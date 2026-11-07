import { test, expect } from "bun:test";
import { DOMParser } from "@xmldom/xmldom";
import {
    buildIdpMetadata,
    buildSpMetadata,
    stripPemHeaders,
} from "./metadata-lib";

const SAMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdefghijkl
mnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
-----END CERTIFICATE-----
`;

const parse = (xml: string) =>
    new DOMParser().parseFromString(xml, "text/xml") as unknown as Document;

const MD_NS = "urn:oasis:names:tc:SAML:2.0:metadata";
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";

test("stripPemHeaders removes armor and whitespace", () => {
    expect(stripPemHeaders(SAMPLE_CERT)).toBe(
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    );
});

test("stripPemHeaders is idempotent on already-clean input", () => {
    const clean = "ABCDEFG";
    expect(stripPemHeaders(clean)).toBe("ABCDEFG");
});

test("IdP metadata: emits descriptor with entityID, SSO endpoints, KeyDescriptor", () => {
    const xml = buildIdpMetadata({
        entityId: "https://idp.example.com",
        ssoUrl: "https://idp.example.com/sso",
        keys: [{ use: "signing", certificate: SAMPLE_CERT }],
        nameIdFormats: ["urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"],
    });

    const doc = parse(xml);
    const root = doc.documentElement;
    expect(root.localName).toBe("EntityDescriptor");
    expect(root.namespaceURI).toBe(MD_NS);
    expect(root.getAttribute("entityID")).toBe("https://idp.example.com");

    const idpDesc = doc.getElementsByTagNameNS(MD_NS, "IDPSSODescriptor")[0];
    expect(idpDesc).toBeTruthy();
    expect(idpDesc.getAttribute("WantAuthnRequestsSigned")).toBe("false");

    const keyDescs = doc.getElementsByTagNameNS(MD_NS, "KeyDescriptor");
    expect(keyDescs.length).toBe(1);
    expect(keyDescs[0].getAttribute("use")).toBe("signing");

    const certEl = doc.getElementsByTagNameNS(DS_NS, "X509Certificate")[0];
    expect(certEl.textContent).toBe(stripPemHeaders(SAMPLE_CERT));

    const ssoServices = doc.getElementsByTagNameNS(MD_NS, "SingleSignOnService");
    expect(ssoServices.length).toBe(2); // POST + REDIRECT default
    const bindings = Array.from({ length: ssoServices.length }, (_, i) =>
        ssoServices[i].getAttribute("Binding"),
    );
    expect(bindings).toContain("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST");
    expect(bindings).toContain("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect");
});

test("IdP metadata: omits SLO when not provided, includes when set", () => {
    const without = buildIdpMetadata({
        entityId: "x",
        ssoUrl: "https://x/sso",
    });
    expect(parse(without).getElementsByTagNameNS(MD_NS, "SingleLogoutService").length).toBe(0);

    const withSlo = buildIdpMetadata({
        entityId: "x",
        ssoUrl: "https://x/sso",
        sloUrl: "https://x/slo",
    });
    const slos = parse(withSlo).getElementsByTagNameNS(MD_NS, "SingleLogoutService");
    expect(slos.length).toBe(2);
    expect(slos[0].getAttribute("Location")).toBe("https://x/slo");
});

test("IdP metadata: respects WantAuthnRequestsSigned and binding subset", () => {
    const xml = buildIdpMetadata({
        entityId: "x",
        ssoUrl: "https://x/sso",
        wantAuthnRequestsSigned: true,
        singleSignOnBindings: ["POST"],
    });
    const doc = parse(xml);
    expect(
        doc.getElementsByTagNameNS(MD_NS, "IDPSSODescriptor")[0].getAttribute(
            "WantAuthnRequestsSigned",
        ),
    ).toBe("true");
    expect(doc.getElementsByTagNameNS(MD_NS, "SingleSignOnService").length).toBe(1);
});

test("SP metadata: emits ACS with index and isDefault on first", () => {
    const xml = buildSpMetadata({
        entityId: "https://sp.example.com",
        assertionConsumerServiceURL: "https://sp.example.com/acs",
        nameIdFormats: ["urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"],
        assertionConsumerBindings: ["POST", "REDIRECT"],
    });
    const doc = parse(xml);

    const sp = doc.getElementsByTagNameNS(MD_NS, "SPSSODescriptor")[0];
    expect(sp.getAttribute("AuthnRequestsSigned")).toBe("false");
    expect(sp.getAttribute("WantAssertionsSigned")).toBe("true");

    const acs = doc.getElementsByTagNameNS(MD_NS, "AssertionConsumerService");
    expect(acs.length).toBe(2);
    expect(acs[0].getAttribute("index")).toBe("0");
    expect(acs[0].getAttribute("isDefault")).toBe("true");
    expect(acs[1].getAttribute("index")).toBe("1");
    expect(acs[1].getAttribute("isDefault")).toBeNull(); // attribute not emitted on non-default
});

test("SP metadata: respects authnRequestsSigned and wantAssertionsSigned overrides", () => {
    const xml = buildSpMetadata({
        entityId: "x",
        assertionConsumerServiceURL: "https://x/acs",
        authnRequestsSigned: true,
        wantAssertionsSigned: false,
    });
    const doc = parse(xml);
    const sp = doc.getElementsByTagNameNS(MD_NS, "SPSSODescriptor")[0];
    expect(sp.getAttribute("AuthnRequestsSigned")).toBe("true");
    expect(sp.getAttribute("WantAssertionsSigned")).toBe("false");
});

test("SP metadata: omits KeyDescriptor when no keys passed", () => {
    const xml = buildSpMetadata({
        entityId: "x",
        assertionConsumerServiceURL: "https://x/acs",
    });
    const doc = parse(xml);
    expect(doc.getElementsByTagNameNS(MD_NS, "KeyDescriptor").length).toBe(0);
});

test("metadata: validUntil and cacheDuration attrs propagate", () => {
    const xml = buildIdpMetadata({
        entityId: "x",
        ssoUrl: "https://x/sso",
        validUntil: "2030-01-01T00:00:00Z",
        cacheDuration: "PT24H",
    });
    const root = parse(xml).documentElement;
    expect(root.getAttribute("validUntil")).toBe("2030-01-01T00:00:00Z");
    expect(root.getAttribute("cacheDuration")).toBe("PT24H");
});

test("metadata: XML-escapes special characters in URLs and entity IDs", () => {
    const xml = buildSpMetadata({
        entityId: "https://sp.example.com/?a=1&b=2",
        assertionConsumerServiceURL: "https://sp.example.com/acs?next=<x>",
    });
    expect(xml).toContain('entityID="https://sp.example.com/?a=1&amp;b=2"');
    expect(xml).toContain("https://sp.example.com/acs?next=&lt;x&gt;");
});
