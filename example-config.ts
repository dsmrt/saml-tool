import type { SAMLConfig } from "./saml-config";

// Example custom configuration
// Copy this file and modify for your specific IdP/SP setup
export const config: SAMLConfig = {
  sp: {
    entityId: "https://my-app.example.com/metadata",
    assertionConsumerServiceURL: "https://my-app.example.com/saml/acs",
    nameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
  },

  idp: {
    ssoUrl: "https://sso.example.com/saml2/idp/SSOService.php",
    entityId: "https://sso.example.com/idp/metadata",
  },

  request: {
    binding: "POST",
    forceAuthn: false,
    isPassive: false,
    protocolBinding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
  },
};

export default config;
