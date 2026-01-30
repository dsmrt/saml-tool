#!/usr/bin/env bun
import { parseArgs } from "node:util";
import type { SAMLConfig } from "./saml-config";
import { defaultConfig } from "./.saml-config";
import {
  buildAuthnRequest,
  encodeForRedirect,
  encodeForPost,
  buildRedirectUrl,
  buildPostForm,
} from "./saml-lib";

interface CLIOptions {
  binding?: "POST" | "GET";
  destination?: string;
  entityId?: string;
  acsUrl?: string;
  output?: "url" | "html" | "xml" | "browser";
  relayState?: string;
  forceAuthn?: boolean;
  isPassive?: boolean;
  config?: string;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      binding: {
        type: "string",
        short: "b",
        default: "POST",
      },
      destination: {
        type: "string",
        short: "d",
      },
      entityId: {
        type: "string",
        short: "e",
      },
      acsUrl: {
        type: "string",
        short: "a",
      },
      output: {
        type: "string",
        short: "o",
        default: "browser",
      },
      relayState: {
        type: "string",
        short: "r",
      },
      forceAuthn: {
        type: "boolean",
        short: "f",
        default: false,
      },
      isPassive: {
        type: "boolean",
        short: "p",
        default: false,
      },
      config: {
        type: "string",
        short: "c",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
  });

  if (values.help) {
    console.log(`
SAML AuthnRequest Testing Tool

Usage: bun send-authnrequest.ts [options]

Options:
  -b, --binding <POST|GET>      Binding type (default: POST)
  -d, --destination <url>        IdP SSO URL destination
  -e, --entityId <id>           SP entity ID
  -a, --acsUrl <url>            Assertion Consumer Service URL
  -o, --output <type>           Output type: url, html, xml, browser (default: browser)
  -r, --relayState <state>      RelayState parameter
  -f, --forceAuthn              Force authentication
  -p, --isPassive               Passive authentication
  -c, --config <file>           Load configuration from file
  -h, --help                    Show this help message

Examples:
  # Send POST binding request and open in browser
  bun send-authnrequest.ts -b POST -d https://idp.example.com/sso

  # Generate GET binding URL
  bun send-authnrequest.ts -b GET -d https://idp.example.com/sso -o url

  # Output raw XML
  bun send-authnrequest.ts -o xml

  # Use custom config file
  bun send-authnrequest.ts -c my-config.ts
`);
    process.exit(0);
  }

  // Load configuration
  let config: SAMLConfig = { ...defaultConfig };

  if (values.config) {
    try {
      const customConfig = await import(`./${values.config}`);
      config = customConfig.default || customConfig.config;
    } catch (error) {
      console.error(`Error loading config file: ${error}`);
      process.exit(1);
    }
  }

  // Override with CLI options
  if (values.destination) {
    config.idp.ssoUrl = values.destination;
  }
  if (values.entityId) {
    config.sp.entityId = values.entityId;
  }
  if (values.acsUrl) {
    config.sp.assertionConsumerServiceURL = values.acsUrl;
  }
  if (values.binding === "POST" || values.binding === "GET") {
    config.request.binding = values.binding;
  }
  if (values.forceAuthn) {
    config.request.forceAuthn = true;
  }
  if (values.isPassive) {
    config.request.isPassive = true;
  }

  // Generate AuthnRequest
  const authnRequest = buildAuthnRequest(config);

  console.log(`\n📋 SAML Configuration:`);
  console.log(`  Binding: ${config.request.binding}`);
  console.log(`  Destination: ${config.idp.ssoUrl}`);
  console.log(`  SP Entity ID: ${config.sp.entityId}`);
  console.log(`  ACS URL: ${config.sp.assertionConsumerServiceURL}\n`);

  // Output based on type
  const output = values.output as string;

  if (output === "xml") {
    console.log("Raw SAML AuthnRequest:");
    console.log(authnRequest);
    return;
  }

  if (config.request.binding === "GET") {
    const encodedRequest = await encodeForRedirect(authnRequest);
    const redirectUrl = buildRedirectUrl(config, encodedRequest, values.relayState as string);

    if (output === "url") {
      console.log("Redirect URL:");
      console.log(redirectUrl);
    } else if (output === "browser") {
      console.log(`🌐 Opening browser with GET binding...`);
      console.log(`URL: ${redirectUrl}\n`);
      await Bun.$`open ${redirectUrl}`;
    } else {
      console.log(redirectUrl);
    }
  } else {
    // POST binding
    const encodedRequest = encodeForPost(authnRequest);
    const postForm = buildPostForm(config, encodedRequest, values.relayState as string);

    if (output === "html") {
      console.log("HTML POST Form:");
      console.log(postForm);
    } else if (output === "browser") {
      // Save to temp file and open in browser
      const tmpFile = `/tmp/saml-post-${Date.now()}.html`;
      await Bun.write(tmpFile, postForm);
      console.log(`🌐 Opening browser with POST binding...`);
      console.log(`Temp file: ${tmpFile}\n`);
      await Bun.$`open ${tmpFile}`;

      // Clean up after a delay
      setTimeout(async () => {
        try {
          await Bun.$`rm ${tmpFile}`;
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 5000);
    } else {
      console.log(postForm);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
