import { buildAuthnRequest, encodeForPost } from "./saml-lib";
import { defaultConfig } from "./saml-config";

console.log("🔐 SAML Testing Tool\n");
console.log("Use the following commands to test SAML AuthnRequest:\n");
console.log("  bun run authn:post    # Send via POST binding");
console.log("  bun run authn:get     # Send via GET binding");
console.log("  bun run authn:xml     # View raw XML");
console.log("  bun run authn -- -h   # Show all options\n");
console.log("Example SAML AuthnRequest:\n");

const authnRequest = buildAuthnRequest(defaultConfig);
console.log(authnRequest);