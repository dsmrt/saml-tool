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
