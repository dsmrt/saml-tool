#!/usr/bin/env bun
// Quick test script to send a SAML message to the receiver and check the API

import { buildAuthnRequest, encodeForPost } from "./saml-lib";
import { defaultConfig } from "./.saml-config";

console.log("🧪 Testing SAML Receiver\n");

// Build a test SAML request
const config = {
  ...defaultConfig,
  idp: {
    ...defaultConfig.idp,
    ssoUrl: "http://localhost:3000/receive",
  },
};

const authnRequest = buildAuthnRequest(config);
const encodedRequest = encodeForPost(authnRequest);
const relayState = "test-relay-state-from-script";

console.log("Sending SAML AuthnRequest to http://localhost:3000/receive...\n");

// Send POST request
const formData = new FormData();
formData.append("SAMLRequest", encodedRequest);
formData.append("RelayState", relayState);

try {
  const response = await fetch("http://localhost:3000/receive", {
    method: "POST",
    body: formData,
    redirect: "manual",
  });

  console.log(`✅ Request sent! Status: ${response.status}`);

  // Wait a moment for processing
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Check the API for the latest message
  const apiResponse = await fetch("http://localhost:3000/api/latest");
  const decoded = await apiResponse.json();

  if (decoded) {
    console.log("\n📨 Decoded Message:");
    console.log(`   Binding: ${decoded.binding}`);
    console.log(`   Message Type: ${decoded.parsed.messageType}`);
    console.log(`   Request ID: ${decoded.parsed.id}`);
    console.log(`   Issuer: ${decoded.parsed.issuer}`);
    console.log(`   Destination: ${decoded.parsed.destination}`);
    console.log(`   RelayState: ${decoded.relayState || "(none)"}`);
    console.log("\n✨ Success! Open http://localhost:3000 to see the full details.");
  } else {
    console.log("\n⚠️  No message received yet.");
  }
} catch (error) {
  console.error("❌ Error:", error);
  console.log("\nMake sure the receiver server is running:");
  console.log("  bun run receiver");
}
