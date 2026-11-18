#!/usr/bin/env bun
import { decodeSAMLMessage, type DecodedSAMLMessage } from "./saml-decoder";
import {
  buildAndSignResponse,
  buildPostForm,
  encodeForPost,
  loadResponseConfig,
  planSpInitiatedResponse,
  previewSpInitiatedResponse,
  type ReceivedAuthnRequest,
} from "./saml-response-lib";
import receiverHtml from "./receiver.html";

let latestMessage: DecodedSAMLMessage | null = null;

const RESPONSE_CONFIG_PATH = process.env.SAML_RESPONSE_CONFIG ?? ".saml-response-config.ts";

/** The latest message as an AuthnRequest we can answer, or null. */
function latestAuthnRequest(): ReceivedAuthnRequest | null {
  if (latestMessage?.parsed.messageType !== "AuthnRequest") return null;
  const { parsed, relayState } = latestMessage;
  return {
    id: parsed.id,
    issuer: parsed.issuer,
    assertionConsumerServiceURL: parsed.assertionConsumerServiceURL,
    protocolBinding: parsed.protocolBinding,
    relayState,
  };
}

function htmlError(message: string, status: number): Response {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem"><h1>Cannot send SAML Response</h1><p>${escaped}</p><p><a href="/">Back to the receiver</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

console.log("🚀 Starting SAML Receiver Server...\n");

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": receiverHtml,

    "/receive": {
      GET: async (req) => {
        try {
          const url = new URL(req.url);
          const samlRequest = url.searchParams.get("SAMLRequest");
          const samlResponse = url.searchParams.get("SAMLResponse");
          const relayState = url.searchParams.get("RelayState") || undefined;

          const samlMessage = samlRequest || samlResponse;
          if (!samlMessage) {
            return new Response("No SAMLRequest or SAMLResponse parameter found", { status: 400 });
          }

          console.log("\n📨 Received SAML message via GET binding");
          console.log(`   RelayState: ${relayState || "(none)"}`);

          latestMessage = await decodeSAMLMessage(samlMessage, "GET", relayState);

          console.log(`   Message Type: ${latestMessage.parsed.messageType || "Unknown"}`);
          console.log(`   Issuer: ${latestMessage.parsed.issuer || "Unknown"}`);
          console.log(`   Request ID: ${latestMessage.parsed.id || "Unknown"}`);

          // Log Response-specific information
          if (latestMessage.parsed.messageType === "Response" && latestMessage.parsed.assertions) {
            console.log(`\n   🔐 Security Info:`);
            console.log(`      Response Signed: ${latestMessage.parsed.responseSigned ? "Yes" : "No"}`);
            console.log(`      Total Assertions: ${latestMessage.parsed.assertions.length}`);
            console.log(`      Encrypted: ${latestMessage.parsed.assertions.filter(a => a.encrypted).length}`);
            console.log(`      Signed: ${latestMessage.parsed.assertions.filter(a => a.signed).length}`);

            latestMessage.parsed.assertions.forEach((assertion, idx) => {
              console.log(`\n   📝 Assertion #${idx + 1}:`);
              console.log(`      Encrypted: ${assertion.encrypted ? "Yes" : "No"}`);
              console.log(`      Signed: ${assertion.signed ? "Yes" : "No"}`);
              if (!assertion.encrypted) {
                if (assertion.subject) console.log(`      Subject: ${assertion.subject}`);
                if (assertion.attributes && assertion.attributes.length > 0) {
                  console.log(`      Attributes (${assertion.attributes.length}):`);
                  assertion.attributes.forEach(attr => {
                    console.log(`         - ${attr.name}${attr.friendlyName ? ` (${attr.friendlyName})` : ""}: ${attr.values.join(", ")}`);
                  });
                }
              }
            });
          }

          // Redirect to the home page to show the decoded message
          return Response.redirect(new URL("/", req.url).toString(), 302);
        } catch (error) {
          console.error("Error processing GET request:", error);
          return new Response(`Error: ${error}`, { status: 500 });
        }
      },

      POST: async (req) => {
        try {
          const formData = await req.formData();
          const samlRequest = formData.get("SAMLRequest") as string;
          const samlResponse = formData.get("SAMLResponse") as string;
          const relayState = (formData.get("RelayState") as string) || undefined;

          const samlMessage = samlRequest || samlResponse;
          if (!samlMessage) {
            return new Response("No SAMLRequest or SAMLResponse parameter found", { status: 400 });
          }

          console.log("\n📨 Received SAML message via POST binding");
          console.log(`   RelayState: ${relayState || "(none)"}`);

          latestMessage = await decodeSAMLMessage(samlMessage, "POST", relayState);

          console.log(`   Message Type: ${latestMessage.parsed.messageType || "Unknown"}`);
          console.log(`   Issuer: ${latestMessage.parsed.issuer || "Unknown"}`);
          console.log(`   Request ID: ${latestMessage.parsed.id || "Unknown"}`);

          // Log Response-specific information
          if (latestMessage.parsed.messageType === "Response" && latestMessage.parsed.assertions) {
            console.log(`\n   🔐 Security Info:`);
            console.log(`      Response Signed: ${latestMessage.parsed.responseSigned ? "Yes" : "No"}`);
            console.log(`      Total Assertions: ${latestMessage.parsed.assertions.length}`);
            console.log(`      Encrypted: ${latestMessage.parsed.assertions.filter(a => a.encrypted).length}`);
            console.log(`      Signed: ${latestMessage.parsed.assertions.filter(a => a.signed).length}`);

            latestMessage.parsed.assertions.forEach((assertion, idx) => {
              console.log(`\n   📝 Assertion #${idx + 1}:`);
              console.log(`      Encrypted: ${assertion.encrypted ? "Yes" : "No"}`);
              console.log(`      Signed: ${assertion.signed ? "Yes" : "No"}`);
              if (!assertion.encrypted) {
                if (assertion.subject) console.log(`      Subject: ${assertion.subject}`);
                if (assertion.attributes && assertion.attributes.length > 0) {
                  console.log(`      Attributes (${assertion.attributes.length}):`);
                  assertion.attributes.forEach(attr => {
                    console.log(`         - ${attr.name}${attr.friendlyName ? ` (${attr.friendlyName})` : ""}: ${attr.values.join(", ")}`);
                  });
                }
              }
            });
          }

          // Redirect to the home page to show the decoded message
          return Response.redirect(new URL("/", req.url).toString(), 302);
        } catch (error) {
          console.error("Error processing POST request:", error);
          return new Response(`Error: ${error}`, { status: 500 });
        }
      },
    },

    "/api/latest": {
      GET: () => {
        return Response.json(latestMessage);
      },
    },

    // Preview the Response we'd send back for the latest AuthnRequest (SP-initiated login).
    "/api/sp-response": {
      GET: async () => {
        const request = latestAuthnRequest();
        if (!request) return Response.json(null);
        return Response.json(await previewSpInitiatedResponse(request, RESPONSE_CONFIG_PATH));
      },
    },

    // Build a Response to the latest AuthnRequest and auto-POST it to the SP's ACS URL.
    "/respond": {
      POST: async (req) => {
        const formData = await req.formData();
        const requestId = formData.get("requestId");
        const request = latestAuthnRequest();

        if (!request) {
          return htmlError("The latest received message is not an AuthnRequest.", 409);
        }
        if (request.id !== requestId) {
          return htmlError(
            `A newer message arrived since this page loaded (expected request ${requestId}, latest is ${request.id}). Go back and try again.`,
            409,
          );
        }

        try {
          const { config } = planSpInitiatedResponse(await loadResponseConfig(RESPONSE_CONFIG_PATH), request);
          const { xml, responseId } = buildAndSignResponse(config);

          console.log("\n📤 Sending SAML Response (SP-initiated)");
          console.log(`   InResponseTo: ${config.inResponseTo}`);
          console.log(`   Response ID:  ${responseId}`);
          console.log(`   Destination:  ${config.sp.assertionConsumerServiceURL}`);
          console.log(`   Subject:      ${config.subject.nameId}`);
          console.log(`   RelayState:   ${config.relayState || "(none)"}`);

          const form = buildPostForm(config.sp.assertionConsumerServiceURL, encodeForPost(xml), config.relayState);
          return new Response(form, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        } catch (error) {
          console.error("Error building SP-initiated Response:", error);
          return htmlError((error as Error).message, 500);
        }
      },
    },
  },

  development: {
    hmr: true,
  },
});

console.log(`✅ SAML Receiver running at http://localhost:${server.port}`);
console.log(`\n📍 Send SAML messages to: http://localhost:${server.port}/receive`);
console.log(`\nExample commands:`);
console.log(`  bun send-authnrequest.ts -d http://localhost:${server.port}/receive`);
console.log(`  bun send-authnrequest.ts -d http://localhost:${server.port}/receive -b GET`);
console.log(`  bun send-authnrequest.ts -d http://localhost:${server.port}/receive -r "https://example.com/return"\n`);
