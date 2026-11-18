import { test, expect, describe } from "bun:test";
import type { SAMLResponseConfig } from "./response-config";
import { buildAndSignResponse, planSpInitiatedResponse } from "./saml-response-lib";
import { parseSAMLXML } from "./saml-decoder";

const base: SAMLResponseConfig = {
  idp: { entityId: "https://idp.test" },
  sp: { entityId: "https://sp.test", assertionConsumerServiceURL: "https://sp.test/acs" },
  subject: { nameId: "user@example.com" },
  signing: { signResponse: false, signAssertion: false },
};

describe("planSpInitiatedResponse", () => {
  test("sets InResponseTo and RelayState from the request", () => {
    const { config } = planSpInitiatedResponse(base, { id: "_req1", relayState: "/home" });
    expect(config.inResponseTo).toBe("_req1");
    expect(config.relayState).toBe("/home");
  });

  test("falls back to config ACS URL and audience when the request omits them", () => {
    const plan = planSpInitiatedResponse(base, { id: "_req1" });
    expect(plan.config.sp.assertionConsumerServiceURL).toBe("https://sp.test/acs");
    expect(plan.config.sp.entityId).toBe("https://sp.test");
    expect(plan.acsSource).toBe("config");
    expect(plan.audienceSource).toBe("config");
    expect(plan.warnings).toEqual([]);
  });

  test("prefers the request's ACS URL and issuer, and warns when they differ", () => {
    const plan = planSpInitiatedResponse(base, {
      id: "_req1",
      issuer: "https://other-sp.test",
      assertionConsumerServiceURL: "https://other-sp.test/acs",
    });
    expect(plan.config.sp.assertionConsumerServiceURL).toBe("https://other-sp.test/acs");
    expect(plan.config.sp.entityId).toBe("https://other-sp.test");
    expect(plan.acsSource).toBe("request");
    expect(plan.audienceSource).toBe("request");
    expect(plan.warnings).toHaveLength(2);
  });

  test("warns on non-POST protocol binding", () => {
    const plan = planSpInitiatedResponse(base, {
      id: "_req1",
      protocolBinding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Artifact",
    });
    expect(plan.warnings.some((w) => w.includes("HTTP-Artifact"))).toBe(true);
  });

  test("does not mutate the base config", () => {
    planSpInitiatedResponse(base, { id: "_req1", issuer: "https://x", assertionConsumerServiceURL: "https://x/acs" });
    expect(base.inResponseTo).toBeUndefined();
    expect(base.sp.entityId).toBe("https://sp.test");
  });

  test("throws without a request ID", () => {
    expect(() => planSpInitiatedResponse(base, {})).toThrow();
  });

  test("built Response carries InResponseTo on Response and SubjectConfirmationData", () => {
    const { config } = planSpInitiatedResponse(base, { id: "_req42" });
    const { xml } = buildAndSignResponse(config);
    expect(parseSAMLXML(xml).messageType).toBe("Response");
    expect(xml).toMatch(/<samlp:Response[^>]*InResponseTo="_req42"/);
    expect(xml).toMatch(/<saml:SubjectConfirmationData[^>]*InResponseTo="_req42"/);
  });
});
