import { test, expect } from "bun:test";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { buildAndSignResponse } from "./saml-response-lib";

const CONFIG_PATH = ".saml-response-config.test.ts";
const haveTestConfig = existsSync(CONFIG_PATH);

const loadConfig = async () => {
    const mod = await import(`./${CONFIG_PATH}`);
    const cfg = structuredClone(mod.responseConfig);
    const resolveRel = (p: string | undefined) =>
        p && !isAbsolute(p) ? resolve(process.cwd(), p) : p;
    cfg.idp.certificatePath = resolveRel(cfg.idp.certificatePath);
    cfg.idp.privateKeyPath = resolveRel(cfg.idp.privateKeyPath);
    return cfg;
};

const verifyAllSignatures = (xml: string, certPath: string) => {
    const doc = new DOMParser().parseFromString(xml, "text/xml") as unknown as Document;
    const sigs = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    const cert = readFileSync(certPath, "utf-8");
    const results: boolean[] = [];
    for (let i = 0; i < sigs.length; i++) {
        const verifier = new SignedXml({ publicCert: cert });
        verifier.loadSignature(sigs[i] as unknown as Node);
        results.push(verifier.checkSignature(xml));
    }
    return { count: sigs.length, results };
};

test.if(haveTestConfig)("signs assertion only", async () => {
    const cfg = await loadConfig();
    cfg.signing.signResponse = false;
    cfg.signing.signAssertion = true;
    const { xml } = buildAndSignResponse(cfg);
    const { count, results } = verifyAllSignatures(xml, cfg.idp.certificatePath);
    expect(count).toBe(1);
    expect(results.every(Boolean)).toBe(true);
});

test.if(haveTestConfig)("signs response only", async () => {
    const cfg = await loadConfig();
    cfg.signing.signResponse = true;
    cfg.signing.signAssertion = false;
    const { xml } = buildAndSignResponse(cfg);
    const { count, results } = verifyAllSignatures(xml, cfg.idp.certificatePath);
    expect(count).toBe(1);
    expect(results.every(Boolean)).toBe(true);
});

test.if(haveTestConfig)("signs both response and assertion", async () => {
    const cfg = await loadConfig();
    cfg.signing.signResponse = true;
    cfg.signing.signAssertion = true;
    const { xml } = buildAndSignResponse(cfg);
    const { count, results } = verifyAllSignatures(xml, cfg.idp.certificatePath);
    expect(count).toBe(2);
    expect(results.every(Boolean)).toBe(true);
});

test.if(haveTestConfig)("unsigned mode emits no Signature elements", async () => {
    const cfg = await loadConfig();
    cfg.signing.signResponse = false;
    cfg.signing.signAssertion = false;
    const { xml } = buildAndSignResponse(cfg);
    expect(xml.includes("<ds:Signature")).toBe(false);
});

test.if(haveTestConfig)("emits expected attributes", async () => {
    const cfg = await loadConfig();
    const { xml } = buildAndSignResponse(cfg);
    expect(xml).toContain('Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"');
    expect(xml).toContain('<saml:AttributeValue xsi:type="xs:string">testuser@example.com</saml:AttributeValue>');
    expect(xml).toContain('<saml:AttributeValue xsi:type="xs:string">users</saml:AttributeValue>');
    expect(xml).toContain('<saml:AttributeValue xsi:type="xs:string">admins</saml:AttributeValue>');
});
