export interface SAMLConfig {
  // Service Provider (SP) configuration
  sp: {
    entityId: string;
    assertionConsumerServiceURL: string;
    nameIDFormat?: string;
  };

  // Identity Provider (IdP) configuration
  idp: {
    ssoUrl: string;
    entityId: string;
  };

  // Request configuration
  request: {
    binding: "POST" | "GET";
    forceAuthn?: boolean;
    isPassive?: boolean;
    protocolBinding?: string;
  };
}

// Default configuration - customize this for your needs
export const defaultConfig: SAMLConfig = {
  sp: {
    entityId: "https://saml-tool.io",
    assertionConsumerServiceURL: "http://localhost:3000",
    nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  },
  idp: {
    ssoUrl: "https://my.ddev.site",
    entityId: "https://my.ddev.site",
  },
  request: {
    binding: "POST",
    forceAuthn: false,
    isPassive: false,
    protocolBinding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
  },
};
