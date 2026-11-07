/**
 * SAML Response Configuration Interface
 *
 * Defines the shape of a config file for sending IdP-initiated SAML Responses.
 * Generate one with: bun run response:init
 *
 * Your config file (default: .saml-response-config.ts) is gitignored — it holds
 * cert/key paths and any test attributes you don't want checked in.
 */

export type SignatureAlgorithm = "rsa-sha256" | "rsa-sha1" | "rsa-sha512";
export type DigestAlgorithm = "sha256" | "sha1" | "sha512";

export interface SAMLResponseConfig {
    // Identity Provider (the role this tool plays when sending a Response)
    idp: {
        entityId: string;
        // PEM-encoded cert/key. Provide either inline strings or file paths.
        certificatePath?: string;
        privateKeyPath?: string;
        certificate?: string;
        privateKey?: string;
        // Used only when generating IdP metadata XML.
        ssoUrl?: string;
        sloUrl?: string;
    };

    // Service Provider receiving the Response
    sp: {
        entityId: string;                       // becomes <Audience>
        assertionConsumerServiceURL: string;    // POST destination
    };

    // Subject of the assertion
    subject: {
        nameId: string;
        nameIdFormat?: string;                  // default: emailAddress
        // Optional. If omitted, generated fresh per send.
        subjectConfirmationNotOnOrAfterSeconds?: number; // default: 300
    };

    // Custom attributes / claims emitted in <AttributeStatement>.
    // Values can be a single string, an array of strings, or an object with a
    // SAML NameFormat. Omit or leave empty to skip the AttributeStatement.
    attributes?: Record<
        string,
        | string
        | string[]
        | { value: string | string[]; nameFormat?: string; friendlyName?: string }
    >;

    // Session / authn context
    session?: {
        sessionIndex?: string;                  // default: generated
        authnContextClassRef?: string;          // default: PasswordProtectedTransport
        notBeforeOffsetSeconds?: number;        // default: -60 (clock skew)
        notOnOrAfterOffsetSeconds?: number;     // default: 300
        sessionNotOnOrAfterSeconds?: number;    // optional
    };

    // Signing options
    signing: {
        signResponse: boolean;
        signAssertion: boolean;
        signatureAlgorithm?: SignatureAlgorithm; // default: rsa-sha256
        digestAlgorithm?: DigestAlgorithm;       // default: sha256
    };

    // Optional response metadata
    inResponseTo?: string;                       // ID of the AuthnRequest this responds to
    relayState?: string;
    statusCode?: string;                         // default: urn:oasis:names:tc:SAML:2.0:status:Success
}
