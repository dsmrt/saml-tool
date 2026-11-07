#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { resolve, dirname, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import type { SAMLResponseConfig } from "./response-config";
import {
    buildAndSignResponse,
    encodeForPost,
    buildPostForm,
} from "./saml-response-lib";

const HELP = `
SAML Response Sender

Loads a response config (created via init-response-config), builds a
SAML Response (optionally signed), and either prints the XML/HTML or
opens it in a browser to POST to the SP.

Usage: bun send-response.ts [options]

Options:
  -c, --config <path>           Config file (default: .saml-response-config.ts)
  -o, --output <type>           xml | html | encoded | browser (default: browser)
  -d, --destination <url>       Override SP ACS URL
  -n, --name-id <value>         Override subject NameID
  -r, --relay-state <value>     Override RelayState
      --in-response-to <id>     Override InResponseTo
      --no-sign-response        Force signResponse=false
      --no-sign-assertion       Force signAssertion=false
      --sign-response           Force signResponse=true
      --sign-assertion          Force signAssertion=true
  -h, --help                    Show this help
`;

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            config: { type: "string", short: "c", default: ".saml-response-config.ts" },
            output: { type: "string", short: "o", default: "browser" },
            destination: { type: "string", short: "d" },
            "name-id": { type: "string", short: "n" },
            "relay-state": { type: "string", short: "r" },
            "in-response-to": { type: "string" },
            "no-sign-response": { type: "boolean", default: false },
            "no-sign-assertion": { type: "boolean", default: false },
            "sign-response": { type: "boolean", default: false },
            "sign-assertion": { type: "boolean", default: false },
            help: { type: "boolean", short: "h", default: false },
        },
        allowPositionals: false,
    });

    if (values.help) {
        console.log(HELP);
        process.exit(0);
    }

    const configPath = resolve(values.config as string);
    if (!existsSync(configPath)) {
        console.error(`✖ Config not found at ${configPath}`);
        console.error(`  Generate one with: bun run response:init`);
        process.exit(1);
    }

    const mod = await import(configPath);
    const config: SAMLResponseConfig =
        mod.responseConfig ?? mod.default ?? mod.config;

    if (!config) {
        console.error(`✖ Config file ${configPath} must export 'responseConfig' (or default).`);
        process.exit(1);
    }

    // Resolve cert/key paths relative to the config file (so configs are portable).
    const configDir = dirname(configPath);
    const resolveRel = (p: string | undefined) =>
        p && !isAbsolute(p) ? resolve(configDir, p) : p;
    config.idp.certificatePath = resolveRel(config.idp.certificatePath);
    config.idp.privateKeyPath = resolveRel(config.idp.privateKeyPath);

    // CLI overrides
    if (values.destination) config.sp.assertionConsumerServiceURL = values.destination as string;
    if (values["name-id"]) config.subject.nameId = values["name-id"] as string;
    if (values["relay-state"] !== undefined) config.relayState = values["relay-state"] as string;
    if (values["in-response-to"]) config.inResponseTo = values["in-response-to"] as string;
    if (values["sign-response"]) config.signing.signResponse = true;
    if (values["sign-assertion"]) config.signing.signAssertion = true;
    if (values["no-sign-response"]) config.signing.signResponse = false;
    if (values["no-sign-assertion"]) config.signing.signAssertion = false;

    const { xml, responseId, assertionId } = buildAndSignResponse(config);

    console.log(`\n📋 SAML Response:`);
    console.log(`  Destination:   ${config.sp.assertionConsumerServiceURL}`);
    console.log(`  IdP issuer:    ${config.idp.entityId}`);
    console.log(`  SP audience:   ${config.sp.entityId}`);
    console.log(`  Subject:       ${config.subject.nameId}`);
    console.log(`  Response ID:   ${responseId}`);
    console.log(`  Assertion ID:  ${assertionId}`);
    console.log(`  Sign Response: ${config.signing.signResponse}`);
    console.log(`  Sign Assertion: ${config.signing.signAssertion}`);
    if (config.relayState) console.log(`  RelayState:    ${config.relayState}`);
    if (config.inResponseTo) console.log(`  InResponseTo:  ${config.inResponseTo}`);
    console.log();

    const output = values.output as string;

    if (output === "xml") {
        console.log(xml);
        return;
    }

    const encoded = encodeForPost(xml);

    if (output === "encoded") {
        console.log(encoded);
        return;
    }

    const form = buildPostForm(
        config.sp.assertionConsumerServiceURL,
        encoded,
        config.relayState,
    );

    if (output === "html") {
        console.log(form);
        return;
    }

    if (output === "browser") {
        const tmpFile = `/tmp/saml-response-${Date.now()}.html`;
        await Bun.write(tmpFile, form);
        console.log(`🌐 Opening browser to POST Response...`);
        console.log(`   Temp file: ${tmpFile}\n`);
        await Bun.$`open ${tmpFile}`.quiet();

        setTimeout(async () => {
            try {
                await Bun.$`rm ${tmpFile}`.quiet();
            } catch {
                /* ignore */
            }
        }, 5000);
        return;
    }

    console.error(`✖ Unknown output type: ${output}. Use xml | html | encoded | browser.`);
    process.exit(1);
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
