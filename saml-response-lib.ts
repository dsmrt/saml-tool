import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { SignedXml } from "xml-crypto";
import type {
    SAMLResponseConfig,
    SignatureAlgorithm,
    DigestAlgorithm,
} from "./response-config";

const SIG_ALG_URI: Record<SignatureAlgorithm, string> = {
    "rsa-sha256": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    "rsa-sha1": "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    "rsa-sha512": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
};

const DIGEST_ALG_URI: Record<DigestAlgorithm, string> = {
    sha256: "http://www.w3.org/2001/04/xmlenc#sha256",
    sha1: "http://www.w3.org/2000/09/xmldsig#sha1",
    sha512: "http://www.w3.org/2001/04/xmlenc#sha512",
};

const C14N_EXC = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ENVELOPED_SIG = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

const NS = {
    samlp: "urn:oasis:names:tc:SAML:2.0:protocol",
    saml: "urn:oasis:names:tc:SAML:2.0:assertion",
};

export function genId(): string {
    return `_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function isoNow(offsetSeconds = 0): string {
    return new Date(Date.now() + offsetSeconds * 1000).toISOString();
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function attr(name: string, value: string | undefined): string {
    if (value === undefined || value === null) return "";
    return ` ${name}="${escapeXml(value)}"`;
}

function buildAttributeStatement(
    attributes: SAMLResponseConfig["attributes"],
): string {
    if (!attributes || Object.keys(attributes).length === 0) return "";

    const items = Object.entries(attributes).map(([name, raw]) => {
        let values: string[];
        let nameFormat: string | undefined;
        let friendlyName: string | undefined;

        if (typeof raw === "string") {
            values = [raw];
        } else if (Array.isArray(raw)) {
            values = raw;
        } else {
            values = Array.isArray(raw.value) ? raw.value : [raw.value];
            nameFormat = raw.nameFormat;
            friendlyName = raw.friendlyName;
        }

        const valueXml = values
            .map((v) => `      <saml:AttributeValue xsi:type="xs:string">${escapeXml(v)}</saml:AttributeValue>`)
            .join("\n");

        return `    <saml:Attribute${attr("Name", name)}${attr("NameFormat", nameFormat)}${attr("FriendlyName", friendlyName)}>
${valueXml}
    </saml:Attribute>`;
    });

    return `  <saml:AttributeStatement>
${items.join("\n")}
  </saml:AttributeStatement>`;
}

export interface BuildOptions {
    responseId?: string;
    assertionId?: string;
    issueInstant?: string;
}

export function buildAssertionXml(
    config: SAMLResponseConfig,
    opts: BuildOptions = {},
): { xml: string; assertionId: string } {
    const assertionId = opts.assertionId ?? genId();
    const issueInstant = opts.issueInstant ?? isoNow();

    const session = config.session ?? {};
    const notBefore = isoNow(session.notBeforeOffsetSeconds ?? -60);
    const notOnOrAfter = isoNow(session.notOnOrAfterOffsetSeconds ?? 300);
    const subjectNotOnOrAfter = isoNow(
        config.subject.subjectConfirmationNotOnOrAfterSeconds ?? 300,
    );
    const sessionIndex = session.sessionIndex ?? genId();
    const authnContextClassRef =
        session.authnContextClassRef ??
        "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";
    const sessionNotOnOrAfter =
        session.sessionNotOnOrAfterSeconds !== undefined
            ? isoNow(session.sessionNotOnOrAfterSeconds)
            : undefined;

    const nameIdFormat =
        config.subject.nameIdFormat ??
        "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

    const subjectConfirmationData = `        <saml:SubjectConfirmationData${attr("NotOnOrAfter", subjectNotOnOrAfter)}${attr("Recipient", config.sp.assertionConsumerServiceURL)}${attr("InResponseTo", config.inResponseTo)}/>`;

    const attributeStatement = buildAttributeStatement(config.attributes);

    const xml = `<saml:Assertion xmlns:saml="${NS.saml}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ID="${assertionId}" Version="2.0" IssueInstant="${issueInstant}">
  <saml:Issuer>${escapeXml(config.idp.entityId)}</saml:Issuer>
  <saml:Subject>
    <saml:NameID Format="${escapeXml(nameIdFormat)}">${escapeXml(config.subject.nameId)}</saml:NameID>
    <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
${subjectConfirmationData}
    </saml:SubjectConfirmation>
  </saml:Subject>
  <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
    <saml:AudienceRestriction>
      <saml:Audience>${escapeXml(config.sp.entityId)}</saml:Audience>
    </saml:AudienceRestriction>
  </saml:Conditions>
  <saml:AuthnStatement AuthnInstant="${issueInstant}" SessionIndex="${sessionIndex}"${attr("SessionNotOnOrAfter", sessionNotOnOrAfter)}>
    <saml:AuthnContext>
      <saml:AuthnContextClassRef>${escapeXml(authnContextClassRef)}</saml:AuthnContextClassRef>
    </saml:AuthnContext>
  </saml:AuthnStatement>
${attributeStatement}
</saml:Assertion>`;

    return { xml, assertionId };
}

export function buildResponseXml(
    config: SAMLResponseConfig,
    assertionXml: string,
    opts: BuildOptions = {},
): { xml: string; responseId: string } {
    const responseId = opts.responseId ?? genId();
    const issueInstant = opts.issueInstant ?? isoNow();
    const statusCode =
        config.statusCode ?? "urn:oasis:names:tc:SAML:2.0:status:Success";

    const xml = `<samlp:Response xmlns:samlp="${NS.samlp}" xmlns:saml="${NS.saml}" ID="${responseId}" Version="2.0" IssueInstant="${issueInstant}"${attr("Destination", config.sp.assertionConsumerServiceURL)}${attr("InResponseTo", config.inResponseTo)}>
  <saml:Issuer>${escapeXml(config.idp.entityId)}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="${escapeXml(statusCode)}"/>
  </samlp:Status>
${assertionXml}
</samlp:Response>`;

    return { xml, responseId };
}

interface SignParams {
    xml: string;
    elementId: string;
    elementLocalName: "Response" | "Assertion";
    privateKey: string;
    certificate: string;
    signatureAlgorithm: SignatureAlgorithm;
    digestAlgorithm: DigestAlgorithm;
}

function signElement({
    xml,
    elementId,
    elementLocalName,
    privateKey,
    certificate,
    signatureAlgorithm,
    digestAlgorithm,
}: SignParams): string {
    const sig = new SignedXml({
        privateKey,
        publicCert: certificate,
        signatureAlgorithm: SIG_ALG_URI[signatureAlgorithm] as never,
        canonicalizationAlgorithm: C14N_EXC as never,
        getKeyInfoContent: SignedXml.getKeyInfoContent,
    });

    sig.addReference({
        xpath: `//*[local-name(.)='${elementLocalName}' and @ID='${elementId}']`,
        transforms: [ENVELOPED_SIG, C14N_EXC] as never,
        digestAlgorithm: DIGEST_ALG_URI[digestAlgorithm] as never,
        uri: `#${elementId}`,
    });

    sig.computeSignature(xml, {
        prefix: "ds",
        location: {
            reference: `//*[local-name(.)='${elementLocalName}' and @ID='${elementId}']/*[local-name(.)='Issuer']`,
            action: "after",
        },
    });

    return sig.getSignedXml();
}

export interface CertMaterial {
    certificate: string;
    privateKey: string;
}

function loadCertMaterial(config: SAMLResponseConfig): CertMaterial {
    const cert = config.idp.certificate ?? readPemFile(config.idp.certificatePath);
    const key = config.idp.privateKey ?? readPemFile(config.idp.privateKeyPath);

    if (!cert) throw new Error("idp.certificate or idp.certificatePath is required when signing");
    if (!key) throw new Error("idp.privateKey or idp.privateKeyPath is required when signing");

    return { certificate: cert, privateKey: key };
}

function readPemFile(path: string | undefined): string | undefined {
    if (!path) return undefined;
    try {
        return require("node:fs").readFileSync(path, "utf-8");
    } catch (err) {
        throw new Error(`Failed to read PEM file at ${path}: ${err}`);
    }
}

export interface BuildAndSignResult {
    xml: string;
    responseId: string;
    assertionId: string;
}

export function buildAndSignResponse(
    config: SAMLResponseConfig,
    opts: BuildOptions = {},
): BuildAndSignResult {
    const sigAlg = config.signing.signatureAlgorithm ?? "rsa-sha256";
    const digAlg = config.signing.digestAlgorithm ?? "sha256";

    const needsCerts = config.signing.signResponse || config.signing.signAssertion;
    const certMat = needsCerts ? loadCertMaterial(config) : null;

    let { xml: assertionXml, assertionId } = buildAssertionXml(config, opts);

    if (config.signing.signAssertion && certMat) {
        assertionXml = signElement({
            xml: assertionXml,
            elementId: assertionId,
            elementLocalName: "Assertion",
            privateKey: certMat.privateKey,
            certificate: certMat.certificate,
            signatureAlgorithm: sigAlg,
            digestAlgorithm: digAlg,
        });
    }

    let { xml: responseXml, responseId } = buildResponseXml(
        config,
        assertionXml,
        opts,
    );

    if (config.signing.signResponse && certMat) {
        responseXml = signElement({
            xml: responseXml,
            elementId: responseId,
            elementLocalName: "Response",
            privateKey: certMat.privateKey,
            certificate: certMat.certificate,
            signatureAlgorithm: sigAlg,
            digestAlgorithm: digAlg,
        });
    }

    return { xml: responseXml, responseId, assertionId };
}

export function encodeForPost(xml: string): string {
    return Buffer.from(xml, "utf-8").toString("base64");
}

export function buildPostForm(
    actionUrl: string,
    encodedResponse: string,
    relayState?: string,
): string {
    const relayStateInput = relayState
        ? `<input type="hidden" name="RelayState" value="${escapeXml(relayState)}" />`
        : "";

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SAML Response POST</title>
</head>
<body onload="document.forms[0].submit()">
  <noscript>
    <p>JavaScript is disabled. Click the button below to continue.</p>
  </noscript>
  <form method="POST" action="${escapeXml(actionUrl)}">
    <input type="hidden" name="SAMLResponse" value="${encodedResponse}" />
    ${relayStateInput}
    <noscript>
      <button type="submit">Continue to Service Provider</button>
    </noscript>
  </form>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

export const DEFAULT_RESPONSE_CONFIG_PATH = ".saml-response-config.ts";

/**
 * Load a response config file. Returns a fresh copy on every call (edits to the
 * file are picked up without restarting), with cert/key paths resolved relative
 * to the config file.
 */
export async function loadResponseConfig(
    path: string = DEFAULT_RESPONSE_CONFIG_PATH,
): Promise<SAMLResponseConfig> {
    const configPath = resolve(path);
    if (!existsSync(configPath)) {
        throw new ResponseConfigNotFoundError(configPath);
    }

    // Bust the module cache when the file changes so edits apply immediately.
    const mod = await import(`${configPath}?v=${statSync(configPath).mtimeMs}`);
    const loaded: SAMLResponseConfig | undefined = mod.responseConfig ?? mod.default ?? mod.config;
    if (!loaded) {
        throw new Error(`Config file ${configPath} must export 'responseConfig' (or default).`);
    }

    const config = structuredClone(loaded);
    const configDir = dirname(configPath);
    const resolveRel = (p: string | undefined) => (p && !isAbsolute(p) ? resolve(configDir, p) : p);
    config.idp.certificatePath = resolveRel(config.idp.certificatePath);
    config.idp.privateKeyPath = resolveRel(config.idp.privateKeyPath);
    return config;
}

export class ResponseConfigNotFoundError extends Error {
    constructor(public readonly path: string) {
        super(`Config not found at ${path}`);
        this.name = "ResponseConfigNotFoundError";
    }
}

// ---------------------------------------------------------------------------
// SP-initiated flow: answer a received AuthnRequest
// ---------------------------------------------------------------------------

const HTTP_POST_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

export interface ReceivedAuthnRequest {
    id?: string;
    issuer?: string;
    assertionConsumerServiceURL?: string;
    protocolBinding?: string;
    relayState?: string;
}

export type ValueSource = "request" | "config";

export interface SpInitiatedPlan {
    /** Config with InResponseTo, ACS URL, audience and RelayState filled in from the request. */
    config: SAMLResponseConfig;
    acsSource: ValueSource;
    audienceSource: ValueSource;
    warnings: string[];
}

/**
 * Combine the base response config with the details of a received AuthnRequest.
 * Values the SP asked for in the request (ACS URL, issuer → audience) take
 * precedence over the config, the same way an IdP honours the SP's request.
 */
export function planSpInitiatedResponse(
    base: SAMLResponseConfig,
    request: ReceivedAuthnRequest,
): SpInitiatedPlan {
    if (!request.id) {
        throw new Error("AuthnRequest has no ID, so there is nothing to set InResponseTo to");
    }

    const config = structuredClone(base);
    const warnings: string[] = [];

    config.inResponseTo = request.id;
    config.relayState = request.relayState;

    const acsSource: ValueSource = request.assertionConsumerServiceURL ? "request" : "config";
    if (request.assertionConsumerServiceURL) {
        if (request.assertionConsumerServiceURL !== base.sp.assertionConsumerServiceURL) {
            warnings.push(
                `The request's ACS URL (${request.assertionConsumerServiceURL}) differs from the config (${base.sp.assertionConsumerServiceURL}). Using the request's.`,
            );
        }
        config.sp.assertionConsumerServiceURL = request.assertionConsumerServiceURL;
    }

    const audienceSource: ValueSource = request.issuer ? "request" : "config";
    if (request.issuer) {
        if (request.issuer !== base.sp.entityId) {
            warnings.push(
                `The request's issuer (${request.issuer}) differs from the config's SP entity ID (${base.sp.entityId}). Using the issuer as the Audience.`,
            );
        }
        config.sp.entityId = request.issuer;
    }

    if (request.protocolBinding && request.protocolBinding !== HTTP_POST_BINDING) {
        warnings.push(
            `The request asks for ${request.protocolBinding}, but only HTTP-POST is supported. The Response will be POSTed.`,
        );
    }

    return { config, acsSource, audienceSource, warnings };
}

/** What the receiver UI shows before sending a Response for an SP-initiated login. */
export type SpResponsePreview =
    | { status: "no-config"; configPath: string }
    | { status: "error"; configPath: string; error: string }
    | {
          status: "ready";
          configPath: string;
          requestId: string;
          acsUrl: string;
          acsSource: ValueSource;
          audience: string;
          audienceSource: ValueSource;
          idpEntityId: string;
          nameId: string;
          relayState?: string;
          signResponse: boolean;
          signAssertion: boolean;
          warnings: string[];
      };

/**
 * Load the response config and plan a Response for the given AuthnRequest.
 * Builds (and signs) the Response once as a dry run, so problems like a
 * missing key surface in the preview instead of on click.
 */
export async function previewSpInitiatedResponse(
    request: ReceivedAuthnRequest,
    configPath: string = DEFAULT_RESPONSE_CONFIG_PATH,
): Promise<SpResponsePreview> {
    try {
        const plan = planSpInitiatedResponse(await loadResponseConfig(configPath), request);
        buildAndSignResponse(plan.config);
        const { config } = plan;
        return {
            status: "ready",
            configPath,
            requestId: config.inResponseTo!,
            acsUrl: config.sp.assertionConsumerServiceURL,
            acsSource: plan.acsSource,
            audience: config.sp.entityId,
            audienceSource: plan.audienceSource,
            idpEntityId: config.idp.entityId,
            nameId: config.subject.nameId,
            relayState: config.relayState,
            signResponse: config.signing.signResponse,
            signAssertion: config.signing.signAssertion,
            warnings: plan.warnings,
        };
    } catch (err) {
        if (err instanceof ResponseConfigNotFoundError) return { status: "no-config", configPath };
        return { status: "error", configPath, error: (err as Error).message };
    }
}
