/**
 * SAML 2.0 metadata XML generators.
 *
 * Produces EntityDescriptor documents suitable for handing to the other side
 * to establish trust:
 *   - buildIdpMetadata: describes our IdP to SPs
 *   - buildSpMetadata:  describes our SP to IdPs
 */

const NS = {
    md: "urn:oasis:names:tc:SAML:2.0:metadata",
    ds: "http://www.w3.org/2000/09/xmldsig#",
    saml: "urn:oasis:names:tc:SAML:2.0:assertion",
    protocol: "urn:oasis:names:tc:SAML:2.0:protocol",
} as const;

export const BINDING = {
    POST: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    REDIRECT: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
} as const;

export type SamlBinding = "POST" | "REDIRECT";
export type KeyUse = "signing" | "encryption";

export interface MetadataKey {
    use?: KeyUse;            // omit to indicate the key is valid for both
    certificate: string;     // PEM (with or without headers)
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function attr(name: string, value: string | undefined | null): string {
    if (value === undefined || value === null) return "";
    return ` ${name}="${escapeXml(value)}"`;
}

/** Strip PEM armor + whitespace so we have raw base64 suitable for X509Certificate. */
export function stripPemHeaders(pem: string): string {
    return pem
        .replace(/-----BEGIN [^-]+-----/g, "")
        .replace(/-----END [^-]+-----/g, "")
        .replace(/\s+/g, "");
}

function bindingUri(b: SamlBinding): string {
    return b === "POST" ? BINDING.POST : BINDING.REDIRECT;
}

function renderKeyDescriptor(key: MetadataKey, indent: string): string {
    const useAttr = attr("use", key.use);
    const certB64 = stripPemHeaders(key.certificate);
    return `${indent}<md:KeyDescriptor${useAttr}>
${indent}  <ds:KeyInfo xmlns:ds="${NS.ds}">
${indent}    <ds:X509Data>
${indent}      <ds:X509Certificate>${certB64}</ds:X509Certificate>
${indent}    </ds:X509Data>
${indent}  </ds:KeyInfo>
${indent}</md:KeyDescriptor>`;
}

function renderNameIdFormats(formats: string[] | undefined, indent: string): string {
    if (!formats || formats.length === 0) return "";
    return (
        formats
            .map((f) => `${indent}<md:NameIDFormat>${escapeXml(f)}</md:NameIDFormat>`)
            .join("\n") + "\n"
    );
}

// ---------------- IdP metadata ----------------

export interface IdpMetadataOptions {
    entityId: string;
    ssoUrl: string;                     // SSO endpoint location
    keys?: MetadataKey[];               // signing/encryption certs; first signing cert is used as default if multiple
    nameIdFormats?: string[];           // e.g. ["urn:...:emailAddress"]
    singleSignOnBindings?: SamlBinding[]; // default: ["POST", "REDIRECT"]
    sloUrl?: string;
    singleLogoutBindings?: SamlBinding[]; // default: ["POST", "REDIRECT"] when sloUrl set
    wantAuthnRequestsSigned?: boolean;  // default: false
    validUntil?: string;                // ISO datetime
    cacheDuration?: string;             // xsd:duration, e.g. "PT24H"
}

export function buildIdpMetadata(opts: IdpMetadataOptions): string {
    const ssoBindings = opts.singleSignOnBindings ?? ["POST", "REDIRECT"];
    const sloBindings = opts.singleLogoutBindings ?? ["POST", "REDIRECT"];
    const wantSigned = opts.wantAuthnRequestsSigned ?? false;

    const keyXml = (opts.keys ?? [])
        .map((k) => renderKeyDescriptor(k, "    "))
        .join("\n");

    const nameIdXml = renderNameIdFormats(opts.nameIdFormats, "    ");

    const ssoXml = ssoBindings
        .map(
            (b) =>
                `    <md:SingleSignOnService Binding="${bindingUri(b)}" Location="${escapeXml(opts.ssoUrl)}"/>`,
        )
        .join("\n");

    const sloXml = opts.sloUrl
        ? sloBindings
              .map(
                  (b) =>
                      `    <md:SingleLogoutService Binding="${bindingUri(b)}" Location="${escapeXml(opts.sloUrl!)}"/>`,
              )
              .join("\n") + "\n"
        : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="${NS.md}"${attr("entityID", opts.entityId)}${attr("validUntil", opts.validUntil)}${attr("cacheDuration", opts.cacheDuration)}>
  <md:IDPSSODescriptor protocolSupportEnumeration="${NS.protocol}" WantAuthnRequestsSigned="${wantSigned}">
${keyXml ? keyXml + "\n" : ""}${nameIdXml}${sloXml}${ssoXml}
  </md:IDPSSODescriptor>
</md:EntityDescriptor>
`;
}

// ---------------- SP metadata ----------------

export interface SpMetadataOptions {
    entityId: string;
    assertionConsumerServiceURL: string;
    keys?: MetadataKey[];
    nameIdFormats?: string[];
    assertionConsumerBindings?: SamlBinding[]; // default: ["POST"]
    sloUrl?: string;
    singleLogoutBindings?: SamlBinding[];      // default: ["POST", "REDIRECT"] when sloUrl set
    authnRequestsSigned?: boolean;             // default: false
    wantAssertionsSigned?: boolean;            // default: true
    validUntil?: string;
    cacheDuration?: string;
}

export function buildSpMetadata(opts: SpMetadataOptions): string {
    const acsBindings = opts.assertionConsumerBindings ?? ["POST"];
    const sloBindings = opts.singleLogoutBindings ?? ["POST", "REDIRECT"];
    const authnSigned = opts.authnRequestsSigned ?? false;
    const wantSigned = opts.wantAssertionsSigned ?? true;

    const keyXml = (opts.keys ?? [])
        .map((k) => renderKeyDescriptor(k, "    "))
        .join("\n");

    const nameIdXml = renderNameIdFormats(opts.nameIdFormats, "    ");

    const sloXml = opts.sloUrl
        ? sloBindings
              .map(
                  (b) =>
                      `    <md:SingleLogoutService Binding="${bindingUri(b)}" Location="${escapeXml(opts.sloUrl!)}"/>`,
              )
              .join("\n") + "\n"
        : "";

    const acsXml = acsBindings
        .map(
            (b, i) =>
                `    <md:AssertionConsumerService index="${i}"${i === 0 ? ' isDefault="true"' : ""} Binding="${bindingUri(b)}" Location="${escapeXml(opts.assertionConsumerServiceURL)}"/>`,
        )
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="${NS.md}"${attr("entityID", opts.entityId)}${attr("validUntil", opts.validUntil)}${attr("cacheDuration", opts.cacheDuration)}>
  <md:SPSSODescriptor protocolSupportEnumeration="${NS.protocol}" AuthnRequestsSigned="${authnSigned}" WantAssertionsSigned="${wantSigned}">
${keyXml ? keyXml + "\n" : ""}${nameIdXml}${sloXml}${acsXml}
  </md:SPSSODescriptor>
</md:EntityDescriptor>
`;
}
