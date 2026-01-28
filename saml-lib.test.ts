import { test, expect, describe } from "bun:test";
import {
  generateRequestId,
  generateTimestamp,
  buildAuthnRequest,
  encodeForPost,
  buildRedirectUrl,
  buildPostForm,
} from "./saml-lib";
import { defaultConfig } from "./saml-config";

describe("SAML Library", () => {
  test("generateRequestId creates valid ID", () => {
    const id = generateRequestId();
    expect(id).toStartWith("_");
    expect(id.length).toBeGreaterThan(10);
  });

  test("generateTimestamp creates ISO timestamp", () => {
    const timestamp = generateTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("buildAuthnRequest generates valid XML", () => {
    const request = buildAuthnRequest(defaultConfig);
    expect(request).toContain('<?xml version="1.0"');
    expect(request).toContain("<samlp:AuthnRequest");
    expect(request).toContain(defaultConfig.sp.entityId);
    expect(request).toContain(defaultConfig.idp.ssoUrl);
    expect(request).toContain(defaultConfig.sp.assertionConsumerServiceURL);
  });

  test("buildAuthnRequest includes ForceAuthn when set", () => {
    const config = {
      ...defaultConfig,
      request: { ...defaultConfig.request, forceAuthn: true },
    };
    const request = buildAuthnRequest(config);
    expect(request).toContain('ForceAuthn="true"');
  });

  test("buildAuthnRequest includes IsPassive when set", () => {
    const config = {
      ...defaultConfig,
      request: { ...defaultConfig.request, isPassive: true },
    };
    const request = buildAuthnRequest(config);
    expect(request).toContain('IsPassive="true"');
  });

  test("encodeForPost returns base64 encoded string", () => {
    const request = buildAuthnRequest(defaultConfig);
    const encoded = encodeForPost(request);

    // Should be base64
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // Should decode back to original
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toBe(request);
  });

  test("buildRedirectUrl creates valid URL with SAMLRequest param", () => {
    const encoded = "test123";
    const url = buildRedirectUrl(defaultConfig, encoded);

    expect(url).toContain(defaultConfig.idp.ssoUrl);
    expect(url).toContain("SAMLRequest=test123");
  });

  test("buildRedirectUrl includes RelayState when provided", () => {
    const encoded = "test123";
    const relayState = "https://example.com/return";
    const url = buildRedirectUrl(defaultConfig, encoded, relayState);

    expect(url).toContain("RelayState=");
    expect(url).toContain(encodeURIComponent(relayState));
  });

  test("buildPostForm creates valid HTML form", () => {
    const encoded = "test123";
    const form = buildPostForm(defaultConfig, encoded);

    expect(form).toContain("<!DOCTYPE html>");
    expect(form).toContain('<form method="POST"');
    expect(form).toContain(`action="${defaultConfig.idp.ssoUrl}"`);
    expect(form).toContain('name="SAMLRequest"');
    expect(form).toContain(`value="${encoded}"`);
  });

  test("buildPostForm includes RelayState input when provided", () => {
    const encoded = "test123";
    const relayState = "mystate";
    const form = buildPostForm(defaultConfig, encoded, relayState);

    expect(form).toContain('name="RelayState"');
    expect(form).toContain(`value="${relayState}"`);
  });
});
