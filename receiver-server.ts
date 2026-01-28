#!/usr/bin/env bun
import { decodeSAMLMessage, type DecodedSAMLMessage } from "./saml-decoder";
import receiverHtml from "./receiver.html";

let latestMessage: DecodedSAMLMessage | null = null;

console.log("🚀 Starting SAML Receiver Server...\n");

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": receiverHtml,

    "/receive": {
      GET: async (req) => {
        try {
          const url = new URL(req.url);
          const samlRequest = url.searchParams.get("SAMLRequest");
          const relayState = url.searchParams.get("RelayState") || undefined;

          if (!samlRequest) {
            return new Response("No SAMLRequest parameter found", { status: 400 });
          }

          console.log("\n📨 Received SAML message via GET binding");
          console.log(`   RelayState: ${relayState || "(none)"}`);

          latestMessage = await decodeSAMLMessage(samlRequest, "GET", relayState);

          console.log(`   Message Type: ${latestMessage.parsed.messageType || "Unknown"}`);
          console.log(`   Issuer: ${latestMessage.parsed.issuer || "Unknown"}`);
          console.log(`   Request ID: ${latestMessage.parsed.id || "Unknown"}`);

          // Redirect to the home page to show the decoded message
          return Response.redirect("http://localhost:3000/", 302);
        } catch (error) {
          console.error("Error processing GET request:", error);
          return new Response(`Error: ${error}`, { status: 500 });
        }
      },

      POST: async (req) => {
        try {
          const formData = await req.formData();
          const samlRequest = formData.get("SAMLRequest") as string;
          const relayState = (formData.get("RelayState") as string) || undefined;

          if (!samlRequest) {
            return new Response("No SAMLRequest parameter found", { status: 400 });
          }

          console.log("\n📨 Received SAML message via POST binding");
          console.log(`   RelayState: ${relayState || "(none)"}`);

          latestMessage = await decodeSAMLMessage(samlRequest, "POST", relayState);

          console.log(`   Message Type: ${latestMessage.parsed.messageType || "Unknown"}`);
          console.log(`   Issuer: ${latestMessage.parsed.issuer || "Unknown"}`);
          console.log(`   Request ID: ${latestMessage.parsed.id || "Unknown"}`);

          // Redirect to the home page to show the decoded message
          return Response.redirect("http://localhost:3000/", 302);
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
  },

  development: {
    hmr: true,
  },
});

console.log(`✅ SAML Receiver running at http://localhost:${server.port}`);
console.log(`\n📍 Send SAML messages to: http://localhost:${server.port}/receive`);
console.log(`\nExample commands:`);
console.log(`  bun send-authnrequest.ts -d http://localhost:3000/receive`);
console.log(`  bun send-authnrequest.ts -d http://localhost:3000/receive -b GET`);
console.log(`  bun send-authnrequest.ts -d http://localhost:3000/receive -r "https://example.com/return"\n`);
