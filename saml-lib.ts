import { deflateRaw } from "node:zlib";
import { promisify } from "node:util";
import type { SAMLConfig } from "./saml-config";

const deflateRawAsync = promisify(deflateRaw);

export function generateRequestId(): string {
  return `_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function generateTimestamp(): string {
  return new Date().toISOString();
}

export function buildAuthnRequest(config: SAMLConfig, requestId?: string): string {
  const id = requestId || generateRequestId();
  const issueInstant = generateTimestamp();

  const forceAuthn = config.request.forceAuthn ? ' ForceAuthn="true"' : "";
  const isPassive = config.request.isPassive ? ' IsPassive="true"' : "";
  const protocolBinding = config.request.protocolBinding || "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

  const authnRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="${id}"
                    Version="2.0"
                    IssueInstant="${issueInstant}"
                    Destination="${config.idp.ssoUrl}"
                    AssertionConsumerServiceURL="${config.sp.assertionConsumerServiceURL}"
                    ProtocolBinding="${protocolBinding}"${forceAuthn}${isPassive}>
  <saml:Issuer>${config.sp.entityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="${config.sp.nameIDFormat || "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified"}"
                      AllowCreate="true"/>
</samlp:AuthnRequest>`;

  return authnRequest;
}

export async function encodeForRedirect(samlRequest: string): Promise<string> {
  // For HTTP-Redirect binding: deflate -> base64 -> URL encode
  const deflated = await deflateRawAsync(Buffer.from(samlRequest, "utf-8"));
  const base64 = deflated.toString("base64");
  return encodeURIComponent(base64);
}

export function encodeForPost(samlRequest: string): string {
  // For HTTP-POST binding: just base64 encode
  return Buffer.from(samlRequest, "utf-8").toString("base64");
}

export function buildRedirectUrl(config: SAMLConfig, encodedRequest: string, relayState?: string): string {
  const url = new URL(config.idp.ssoUrl);
  url.searchParams.set("SAMLRequest", encodedRequest);

  if (relayState) {
    url.searchParams.set("RelayState", relayState);
  }

  return url.toString();
}

export function buildPostForm(config: SAMLConfig, encodedRequest: string, relayState?: string): string {
  const relayStateInput = relayState
    ? `<input type="hidden" name="RelayState" value="${relayState}" />`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SAML POST Binding</title>
</head>
<body onload="document.forms[0].submit()">
  <noscript>
    <p>JavaScript is disabled. Please click the button below to continue.</p>
  </noscript>
  <form method="POST" action="${config.idp.ssoUrl}">
    <input type="hidden" name="SAMLRequest" value="${encodedRequest}" />
    ${relayStateInput}
    <noscript>
      <button type="submit">Continue to Identity Provider</button>
    </noscript>
  </form>
</body>
</html>`;
}

export function decodeRequest(encodedRequest: string, binding: "POST" | "GET"): string {
  if (binding === "POST") {
    return Buffer.from(encodedRequest, "base64").toString("utf-8");
  } else {
    // For GET binding, reverse the process: URL decode -> base64 decode -> inflate
    const urlDecoded = decodeURIComponent(encodedRequest);
    const buffer = Buffer.from(urlDecoded, "base64");
    // Note: Inflation would require zlib.inflateRaw, but we'll keep decoding simple for now
    return buffer.toString("utf-8");
  }
}
