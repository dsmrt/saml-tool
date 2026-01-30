/**
 * SAML Configuration Interface
 *
 * This file contains only the TypeScript interface for SAML configuration.
 * Your actual configuration data should be in .saml-config.ts (gitignored).
 *
 * To get started, copy this example to .saml-config.ts:
 *
 * ```
 * import type { SAMLConfig } from "./saml-config";
 *
 * export const defaultConfig: SAMLConfig = {
 *     sp: {
 *         entityId: "https://saml-tool.io",
 *         assertionConsumerServiceURL: "http://localhost:3000/receive",
 *         nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
 *     },
 *     idp: {
 *         ssoUrl: "https://your-idp.example.com",
 *         entityId: "https://your-idp.example.com",
 *     },
 *     request: {
 *         binding: "POST",
 *         forceAuthn: false,
 *         isPassive: false,
 *         protocolBinding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
 *     },
 * };
 * ```
 */
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
