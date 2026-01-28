import { test, expect, describe } from "bun:test";
import {
  decodeSAMLPost,
  decodeSAMLRedirect,
  parseSAMLXML,
  decodeSAMLMessage,
} from "./saml-decoder";

describe("SAML Decoder", () => {
  const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="_test123"
                    Version="2.0"
                    IssueInstant="2024-01-01T12:00:00.000Z"
                    Destination="https://idp.example.com/sso"
                    AssertionConsumerServiceURL="http://localhost:3000/acs"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                    ForceAuthn="true">
  <saml:Issuer>http://localhost:3000/metadata</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
                      AllowCreate="true"/>
</samlp:AuthnRequest>`;

  test("decodeSAMLPost decodes base64 encoded XML", async () => {
    const encoded = Buffer.from(sampleXML).toString("base64");
    const decoded = await decodeSAMLPost(encoded);
    expect(decoded).toBe(sampleXML);
  });

  test("parseSAMLXML extracts AuthnRequest attributes", () => {
    const parsed = parseSAMLXML(sampleXML);

    expect(parsed.messageType).toBe("AuthnRequest");
    expect(parsed.id).toBe("_test123");
    expect(parsed.version).toBe("2.0");
    expect(parsed.issueInstant).toBe("2024-01-01T12:00:00.000Z");
    expect(parsed.destination).toBe("https://idp.example.com/sso");
    expect(parsed.issuer).toBe("http://localhost:3000/metadata");
    expect(parsed.assertionConsumerServiceURL).toBe("http://localhost:3000/acs");
    expect(parsed.protocolBinding).toBe("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST");
    expect(parsed.forceAuthn).toBe(true);
    expect(parsed.nameIDFormat).toBe("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
  });

  test("parseSAMLXML detects different message types", () => {
    const logoutXML = '<samlp:LogoutRequest ID="_logout123">content</samlp:LogoutRequest>';
    const responseXML = '<samlp:Response ID="_response123">content</samlp:Response>';

    expect(parseSAMLXML(logoutXML).messageType).toBe("LogoutRequest");
    expect(parseSAMLXML(responseXML).messageType).toBe("Response");
  });

  test("parseSAMLXML handles missing ForceAuthn", () => {
    const xmlWithoutForceAuth = sampleXML.replace('ForceAuthn="true"', "");
    const parsed = parseSAMLXML(xmlWithoutForceAuth);

    expect(parsed.forceAuthn).toBeUndefined();
  });

  test("decodeSAMLMessage returns complete DecodedSAMLMessage for POST", async () => {
    const encoded = Buffer.from(sampleXML).toString("base64");
    const relayState = "https://example.com/return";

    const decoded = await decodeSAMLMessage(encoded, "POST", relayState);

    expect(decoded.binding).toBe("POST");
    expect(decoded.xml).toBe(sampleXML);
    expect(decoded.relayState).toBe(relayState);
    expect(decoded.issuer).toBe("http://localhost:3000/metadata");
    expect(decoded.destination).toBe("https://idp.example.com/sso");
    expect(decoded.requestId).toBe("_test123");
    expect(decoded.parsed.messageType).toBe("AuthnRequest");
    expect(decoded.rawEncoded).toBe(encoded);
  });

  test("decodeSAMLMessage works without relayState", async () => {
    const encoded = Buffer.from(sampleXML).toString("base64");
    const decoded = await decodeSAMLMessage(encoded, "POST");

    expect(decoded.relayState).toBeUndefined();
  });
});
