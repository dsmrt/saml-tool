#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";

const HELP = `
SAML Response Config Generator

Scaffolds a config file for sending IdP-initiated SAML Responses, and
generates a self-signed cert/key pair for signing.

Usage: bun init-response-config.ts [options]

Options:
  -o, --output <path>           Config file path (default: .saml-response-config.ts)
      --cert-dir <path>         Directory for generated certs (default: certs)
      --idp-entity-id <id>      IdP entity ID (default: https://saml-tool.local/idp)
      --sp-entity-id <id>       SP entity ID (default: http://localhost:3000/metadata)
      --acs-url <url>           SP Assertion Consumer Service URL (default: http://localhost:3000/receive)
      --name-id <value>         Default subject NameID (default: testuser@example.com)
      --skip-cert               Don't generate a cert/key (use if you already have one)
      --cert-cn <name>          Common Name for the self-signed cert (default: SAML Tool Test IdP)
      --cert-days <n>           Validity period in days (default: 3650)
  -f, --force                   Overwrite existing config / certs
  -h, --help                    Show this help
`;

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            output: { type: "string", short: "o", default: ".saml-response-config.ts" },
            "cert-dir": { type: "string", default: "certs" },
            "idp-entity-id": { type: "string", default: "https://saml-tool.local/idp" },
            "sp-entity-id": { type: "string", default: "http://localhost:3000/metadata" },
            "acs-url": { type: "string", default: "http://localhost:3000/receive" },
            "name-id": { type: "string", default: "testuser@example.com" },
            "skip-cert": { type: "boolean", default: false },
            "cert-cn": { type: "string", default: "SAML Tool Test IdP" },
            "cert-days": { type: "string", default: "3650" },
            force: { type: "boolean", short: "f", default: false },
            help: { type: "boolean", short: "h", default: false },
        },
        allowPositionals: false,
    });

    if (values.help) {
        console.log(HELP);
        process.exit(0);
    }

    const outputPath = resolve(values.output as string);
    const certDir = resolve(values["cert-dir"] as string);
    const certPath = resolve(certDir, "idp-cert.pem");
    const keyPath = resolve(certDir, "idp-key.pem");

    if (existsSync(outputPath) && !values.force) {
        console.error(`✖ Config already exists at ${outputPath}. Use --force to overwrite.`);
        process.exit(1);
    }

    if (!values["skip-cert"]) {
        if ((existsSync(certPath) || existsSync(keyPath)) && !values.force) {
            console.error(`✖ Cert or key already exists in ${certDir}. Use --force to overwrite.`);
            process.exit(1);
        }
        await generateSelfSignedCert({
            certDir,
            certPath,
            keyPath,
            commonName: values["cert-cn"] as string,
            days: parseInt(values["cert-days"] as string, 10),
        });
    }

    // Resolve cert/key paths relative to the config file so the config is portable.
    const configDir = dirname(outputPath);
    const relCert = relative(configDir, certPath);
    const relKey = relative(configDir, keyPath);

    const configContents = renderConfig({
        idpEntityId: values["idp-entity-id"] as string,
        spEntityId: values["sp-entity-id"] as string,
        acsUrl: values["acs-url"] as string,
        nameId: values["name-id"] as string,
        certPath: relCert,
        keyPath: relKey,
        skipCert: values["skip-cert"] as boolean,
    });

    await Bun.write(outputPath, configContents);

    console.log(`✓ Wrote config to ${outputPath}`);
    if (!values["skip-cert"]) {
        console.log(`✓ Wrote cert to ${certPath}`);
        console.log(`✓ Wrote key  to ${keyPath}`);
    }
    console.log(`\nNext steps:
  1. (Optional) edit ${values.output} — tweak attributes, signing flags, session.
  2. Start the receiver:    bun run receiver
  3. Send a Response:       bun run response`);
}

interface GenCertOpts {
    certDir: string;
    certPath: string;
    keyPath: string;
    commonName: string;
    days: number;
}

async function generateSelfSignedCert(opts: GenCertOpts): Promise<void> {
    await Bun.$`mkdir -p ${opts.certDir}`.quiet();
    const subj = `/CN=${opts.commonName}`;
    // RSA 2048 self-signed; SHA-256 signature on the cert itself.
    await Bun.$`openssl req -x509 -nodes -newkey rsa:2048 -sha256 \
        -keyout ${opts.keyPath} -out ${opts.certPath} \
        -days ${opts.days} -subj ${subj}`.quiet();
}

interface RenderOpts {
    idpEntityId: string;
    spEntityId: string;
    acsUrl: string;
    nameId: string;
    certPath: string;
    keyPath: string;
    skipCert: boolean;
}

function renderConfig(o: RenderOpts): string {
    const certBlock = o.skipCert
        ? `        // Provide either inline PEM strings or paths. Required when signing.
        // certificatePath: "certs/idp-cert.pem",
        // privateKeyPath: "certs/idp-key.pem",`
        : `        certificatePath: ${JSON.stringify(o.certPath)},
        privateKeyPath: ${JSON.stringify(o.keyPath)},`;

    return `import type { SAMLResponseConfig } from "./response-config";

export const responseConfig: SAMLResponseConfig = {
    idp: {
        entityId: ${JSON.stringify(o.idpEntityId)},
${certBlock}
    },

    sp: {
        entityId: ${JSON.stringify(o.spEntityId)},
        assertionConsumerServiceURL: ${JSON.stringify(o.acsUrl)},
    },

    subject: {
        nameId: ${JSON.stringify(o.nameId)},
        nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    },

    // Custom claims / session params. Strings, arrays, or { value, nameFormat, friendlyName }.
    attributes: {
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": ${JSON.stringify(o.nameId)},
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "Test User",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "Test",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "User",
        groups: {
            value: ["users", "admins"],
            nameFormat: "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
        },
    },

    session: {
        // sessionIndex: "_session-id-here",
        authnContextClassRef: "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
        notBeforeOffsetSeconds: -60,
        notOnOrAfterOffsetSeconds: 300,
    },

    signing: {
        signResponse: false,
        signAssertion: true,
        signatureAlgorithm: "rsa-sha256",
        digestAlgorithm: "sha256",
    },

    // inResponseTo: "_request-id-from-authnrequest",
    // relayState: "https://your-app.example.com/dashboard",
};
`;
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
