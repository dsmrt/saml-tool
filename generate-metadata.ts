#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import {
    buildIdpMetadata,
    buildSpMetadata,
    type MetadataKey,
    type SamlBinding,
} from "./metadata-lib";

const HELP = `
SAML Metadata Generator

Generates an EntityDescriptor XML document for either the IdP or the SP side,
using your existing configs as defaults and overlaying CLI flags.

Usage:
  bun generate-metadata.ts idp [options]
  bun generate-metadata.ts sp  [options]

Common options:
  -o, --output <path>           Write XML to file (default: stdout)
  -e, --entity-id <id>          Override entity ID
      --cert <path>             PEM certificate file (used in <KeyDescriptor>)
      --gen-cert                Generate a self-signed cert/key pair
      --cert-cn <name>          Common Name for the generated cert
      --cert-days <n>           Validity period for the generated cert (default: 3650)
      --cert-out-dir <path>     Output dir for generated certs (default: certs)
      --name-id-format <fmt>    NameIDFormat (repeatable)
      --valid-until <iso>       validUntil attribute (ISO 8601)
      --cache-duration <dur>    cacheDuration attribute (xsd:duration, e.g. PT24H)
  -c, --config <path>           Source config file (defaults vary by mode)
  -h, --help                    Show this help

IdP-only options:
      --sso-url <url>           SingleSignOnService Location
      --slo-url <url>           SingleLogoutService Location (optional)
      --sso-bindings <list>     POST,REDIRECT (default: POST,REDIRECT)
      --want-authn-signed       Set WantAuthnRequestsSigned="true"

SP-only options:
      --acs-url <url>           AssertionConsumerService Location
      --acs-bindings <list>     POST,REDIRECT (default: POST)
      --slo-url <url>           SingleLogoutService Location (optional)
      --authn-signed            Set AuthnRequestsSigned="true"
      --no-want-assertions-signed   Set WantAssertionsSigned="false" (default: true)

Examples:
  # IdP metadata using cert+entity from .saml-response-config.ts
  bun generate-metadata.ts idp --sso-url https://idp.local/sso -o idp-metadata.xml

  # SP metadata using .saml-config.ts, generating a fresh signing cert
  bun generate-metadata.ts sp --gen-cert -o sp-metadata.xml
`;

async function main() {
    const positionals = process.argv.slice(2).filter((a) => !a.startsWith("-"));
    const mode = positionals[0];

    if (!mode || mode === "help" || process.argv.includes("-h") || process.argv.includes("--help")) {
        console.log(HELP);
        process.exit(mode ? 0 : 1);
    }

    if (mode !== "idp" && mode !== "sp") {
        console.error(`✖ Unknown mode '${mode}'. Use 'idp' or 'sp'.`);
        process.exit(1);
    }

    const { values } = parseArgs({
        args: process.argv.slice(2).filter((a) => a !== mode),
        options: {
            output: { type: "string", short: "o" },
            "entity-id": { type: "string", short: "e" },
            cert: { type: "string" },
            "gen-cert": { type: "boolean", default: false },
            "cert-cn": { type: "string" },
            "cert-days": { type: "string", default: "3650" },
            "cert-out-dir": { type: "string", default: "certs" },
            "name-id-format": { type: "string", multiple: true },
            "valid-until": { type: "string" },
            "cache-duration": { type: "string" },
            config: { type: "string", short: "c" },
            // IdP
            "sso-url": { type: "string" },
            "slo-url": { type: "string" },
            "sso-bindings": { type: "string" },
            "want-authn-signed": { type: "boolean", default: false },
            // SP
            "acs-url": { type: "string" },
            "acs-bindings": { type: "string" },
            "authn-signed": { type: "boolean", default: false },
            "no-want-assertions-signed": { type: "boolean", default: false },
        },
        allowPositionals: false,
    });

    const xml =
        mode === "idp"
            ? await buildIdp(values)
            : await buildSp(values);

    if (values.output) {
        await Bun.write(resolve(values.output as string), xml);
        console.error(`✓ Wrote ${mode.toUpperCase()} metadata to ${values.output}`);
    } else {
        process.stdout.write(xml);
    }
}

interface CommonValues {
    [k: string]: unknown;
}

async function loadConfig(
    pathStr: string,
    requiredExports: string[],
): Promise<Record<string, any> | null> {
    const abs = resolve(pathStr);
    if (!existsSync(abs)) return null;
    const mod = await import(abs);
    for (const name of requiredExports) {
        if (mod[name]) return { __dir: dirname(abs), ...mod };
    }
    return { __dir: dirname(abs), ...mod };
}

function resolveCertPath(configDir: string, p: string | undefined): string | undefined {
    if (!p) return undefined;
    return isAbsolute(p) ? p : resolve(configDir, p);
}

async function resolveKey(
    values: CommonValues,
    role: "idp" | "sp",
    fallbackCertPath?: string,
    fallbackCertInline?: string,
): Promise<MetadataKey | null> {
    let certContent: string | undefined;

    if (values["gen-cert"]) {
        const dir = resolve(values["cert-out-dir"] as string);
        const certPath = resolve(dir, `${role}-cert.pem`);
        const keyPath = resolve(dir, `${role}-key.pem`);
        if (existsSync(certPath) || existsSync(keyPath)) {
            console.error(`✖ ${certPath} or ${keyPath} already exists. Remove them or pick a different --cert-out-dir.`);
            process.exit(1);
        }
        await Bun.$`mkdir -p ${dir}`.quiet();
        const cn = (values["cert-cn"] as string) ?? `SAML Tool ${role.toUpperCase()}`;
        const days = parseInt(values["cert-days"] as string, 10);
        await Bun.$`openssl req -x509 -nodes -newkey rsa:2048 -sha256 -keyout ${keyPath} -out ${certPath} -days ${days} -subj ${`/CN=${cn}`}`.quiet();
        console.error(`✓ Generated ${certPath}`);
        console.error(`✓ Generated ${keyPath}`);
        certContent = readFileSync(certPath, "utf-8");
    } else if (values.cert) {
        const path = resolve(values.cert as string);
        if (!existsSync(path)) {
            console.error(`✖ Cert not found at ${path}`);
            process.exit(1);
        }
        certContent = readFileSync(path, "utf-8");
    } else if (fallbackCertPath && existsSync(fallbackCertPath)) {
        certContent = readFileSync(fallbackCertPath, "utf-8");
    } else if (fallbackCertInline) {
        certContent = fallbackCertInline;
    }

    if (!certContent) return null;
    return { use: "signing", certificate: certContent };
}

function parseBindings(input: string | undefined, fallback: SamlBinding[]): SamlBinding[] {
    if (!input) return fallback;
    return input
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is SamlBinding => s === "POST" || s === "REDIRECT");
}

async function buildIdp(values: CommonValues): Promise<string> {
    const configPath = (values.config as string) ?? ".saml-response-config.ts";
    const cfg = await loadConfig(configPath, ["responseConfig"]);
    const responseConfig = cfg?.responseConfig ?? cfg?.default ?? cfg?.config;
    const configDir = (cfg?.__dir as string) ?? process.cwd();

    const entityId =
        (values["entity-id"] as string) ?? responseConfig?.idp?.entityId;
    const ssoUrl =
        (values["sso-url"] as string) ?? responseConfig?.idp?.ssoUrl;
    const sloUrl =
        (values["slo-url"] as string) ?? responseConfig?.idp?.sloUrl;

    if (!entityId) die("IdP entityId is required (use --entity-id or set responseConfig.idp.entityId)");
    if (!ssoUrl) die("IdP SSO URL is required (use --sso-url or set responseConfig.idp.ssoUrl)");

    const fallbackCertPath = resolveCertPath(configDir, responseConfig?.idp?.certificatePath);
    const fallbackCertInline = responseConfig?.idp?.certificate;
    const key = await resolveKey(values, "idp", fallbackCertPath, fallbackCertInline);

    const nameIdFormats = (values["name-id-format"] as string[] | undefined) ?? [
        responseConfig?.subject?.nameIdFormat ??
            "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    ];

    return buildIdpMetadata({
        entityId,
        ssoUrl,
        sloUrl,
        keys: key ? [key] : [],
        nameIdFormats,
        singleSignOnBindings: parseBindings(values["sso-bindings"] as string, ["POST", "REDIRECT"]),
        wantAuthnRequestsSigned: values["want-authn-signed"] as boolean,
        validUntil: values["valid-until"] as string | undefined,
        cacheDuration: values["cache-duration"] as string | undefined,
    });
}

async function buildSp(values: CommonValues): Promise<string> {
    const configPath = (values.config as string) ?? ".saml-config.ts";
    const cfg = await loadConfig(configPath, ["defaultConfig"]);
    const samlConfig = cfg?.defaultConfig ?? cfg?.default ?? cfg?.config;

    const entityId =
        (values["entity-id"] as string) ?? samlConfig?.sp?.entityId;
    const acsUrl =
        (values["acs-url"] as string) ?? samlConfig?.sp?.assertionConsumerServiceURL;
    const sloUrl = values["slo-url"] as string | undefined;

    if (!entityId) die("SP entityId is required (use --entity-id or set defaultConfig.sp.entityId)");
    if (!acsUrl) die("SP ACS URL is required (use --acs-url or set defaultConfig.sp.assertionConsumerServiceURL)");

    const key = await resolveKey(values, "sp");

    const nameIdFormats = (values["name-id-format"] as string[] | undefined) ?? [
        samlConfig?.sp?.nameIDFormat ??
            "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    ];

    return buildSpMetadata({
        entityId,
        assertionConsumerServiceURL: acsUrl,
        sloUrl,
        keys: key ? [key] : [],
        nameIdFormats,
        assertionConsumerBindings: parseBindings(values["acs-bindings"] as string, ["POST"]),
        authnRequestsSigned: values["authn-signed"] as boolean,
        wantAssertionsSigned: !(values["no-want-assertions-signed"] as boolean),
        validUntil: values["valid-until"] as string | undefined,
        cacheDuration: values["cache-duration"] as string | undefined,
    });
}

function die(msg: string): never {
    console.error(`✖ ${msg}`);
    process.exit(1);
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
