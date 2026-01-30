import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";

const inflateRawAsync = promisify(inflateRaw);

export interface DecodedSAMLMessage {
  binding: "POST" | "GET";
  xml: string;
  relayState?: string;
  issuer?: string;
  destination?: string;
  issueInstant?: string;
  requestId?: string;
  parsed: ParsedSAMLData;
  rawEncoded: string;
}

export interface AssertionAttribute {
  name: string;
  friendlyName?: string;
  values: string[];
}

export interface AssertionInfo {
  encrypted: boolean;
  signed: boolean;
  attributes?: AssertionAttribute[];
  subject?: string;
  conditions?: {
    notBefore?: string;
    notOnOrAfter?: string;
  };
}

export interface ParsedSAMLData {
  messageType?: "AuthnRequest" | "LogoutRequest" | "Response" | "LogoutResponse";
  id?: string;
  version?: string;
  issueInstant?: string;
  destination?: string;
  issuer?: string;
  assertionConsumerServiceURL?: string;
  protocolBinding?: string;
  forceAuthn?: boolean;
  isPassive?: boolean;
  nameIDFormat?: string;
  // Response-specific fields
  responseSigned?: boolean;
  assertions?: AssertionInfo[];
  [key: string]: any;
}

export async function decodeSAMLPost(encodedRequest: string): Promise<string> {
  // POST binding: base64 decode only
  return Buffer.from(encodedRequest, "base64").toString("utf-8");
}

export async function decodeSAMLRedirect(encodedRequest: string): Promise<string> {
  // GET/Redirect binding: URL decode -> base64 decode -> inflate
  try {
    const urlDecoded = decodeURIComponent(encodedRequest);
    const buffer = Buffer.from(urlDecoded, "base64");
    const inflated = await inflateRawAsync(buffer);
    return inflated.toString("utf-8");
  } catch (error) {
    throw new Error(`Failed to decode SAML redirect: ${error}`);
  }
}

function parseAssertionAttributes(assertionXml: string): AssertionAttribute[] {
  const attributes: AssertionAttribute[] = [];

  // Match AttributeStatement block
  const attrStatementRegex = /<saml:AttributeStatement[^>]*>([\s\S]*?)<\/saml:AttributeStatement>/gi;
  const attrStatementMatch = assertionXml.match(attrStatementRegex);

  if (attrStatementMatch) {
    attrStatementMatch.forEach(attrStatement => {
      // Match individual Attribute elements
      const attrRegex = /<saml:Attribute\s+([^>]*?)>([\s\S]*?)<\/saml:Attribute>/gi;
      let match;

      while ((match = attrRegex.exec(attrStatement)) !== null) {
        const attrTag = match[1];
        const attrContent = match[2];

        // Extract Name attribute
        const nameMatch = attrTag.match(/Name="([^"]*)"/i);
        const friendlyNameMatch = attrTag.match(/FriendlyName="([^"]*)"/i);

        if (nameMatch) {
          const name = nameMatch[1];
          const friendlyName = friendlyNameMatch ? friendlyNameMatch[1] : undefined;

          // Extract AttributeValue elements
          const values: string[] = [];
          const valueRegex = /<saml:AttributeValue[^>]*>([\s\S]*?)<\/saml:AttributeValue>/gi;
          let valueMatch;

          while ((valueMatch = valueRegex.exec(attrContent)) !== null) {
            const value = valueMatch[1].trim();
            if (value) values.push(value);
          }

          attributes.push({
            name,
            friendlyName,
            values: values.length > 0 ? values : [],
          });
        }
      }
    });
  }

  return attributes;
}

function parseAssertion(assertionXml: string): AssertionInfo {
  const info: AssertionInfo = {
    encrypted: false,
    signed: false,
  };

  // Check if assertion is signed
  info.signed = assertionXml.includes("<ds:Signature") || assertionXml.includes("<Signature");

  // Extract subject
  const subjectRegex = /<saml:Subject[^>]*>([\s\S]*?)<\/saml:Subject>/i;
  const subjectMatch = assertionXml.match(subjectRegex);
  if (subjectMatch) {
    const nameIDRegex = /<saml:NameID[^>]*>([\s\S]*?)<\/saml:NameID>/i;
    const nameIDMatch = subjectMatch[1].match(nameIDRegex);
    if (nameIDMatch) {
      info.subject = nameIDMatch[1].trim();
    }
  }

  // Extract conditions
  const conditionsRegex = /<saml:Conditions[^>]*NotBefore="([^"]*)"[^>]*NotOnOrAfter="([^"]*)"/i;
  const conditionsMatch = assertionXml.match(conditionsRegex);
  if (conditionsMatch) {
    info.conditions = {
      notBefore: conditionsMatch[1],
      notOnOrAfter: conditionsMatch[2],
    };
  }

  // Parse attributes
  info.attributes = parseAssertionAttributes(assertionXml);

  return info;
}

export function parseSAMLXML(xml: string): ParsedSAMLData {
  const parsed: ParsedSAMLData = {};

  // Detect message type
  if (xml.includes("<samlp:AuthnRequest") || xml.includes("<AuthnRequest")) {
    parsed.messageType = "AuthnRequest";
  } else if (xml.includes("<samlp:LogoutRequest") || xml.includes("<LogoutRequest")) {
    parsed.messageType = "LogoutRequest";
  } else if (xml.includes("<samlp:Response") || xml.includes("<Response")) {
    parsed.messageType = "Response";
  } else if (xml.includes("<samlp:LogoutResponse") || xml.includes("<LogoutResponse")) {
    parsed.messageType = "LogoutResponse";
  }

  // Extract common attributes using regex
  // Special handling for Version to avoid matching XML declaration
  const extractAttribute = (attr: string): string | undefined => {
    if (attr === "Version") {
      // Look for Version within samlp: or saml: elements, not XML declaration
      const regex = /<(?:samlp:|saml:)?\w+[^>]*Version="([^"]*)"/i;
      const match = xml.match(regex);
      return match ? match[1] : undefined;
    }
    const regex = new RegExp(`${attr}="([^"]*)"`, "i");
    const match = xml.match(regex);
    return match ? match[1] : undefined;
  };

  const extractTag = (tag: string): string | undefined => {
    const regex = new RegExp(`<(?:saml:|samlp:)?${tag}[^>]*>([^<]*)<`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  };

  parsed.id = extractAttribute("ID");
  parsed.version = extractAttribute("Version");
  parsed.issueInstant = extractAttribute("IssueInstant");
  parsed.destination = extractAttribute("Destination");
  parsed.issuer = extractTag("Issuer");
  parsed.assertionConsumerServiceURL = extractAttribute("AssertionConsumerServiceURL");
  parsed.protocolBinding = extractAttribute("ProtocolBinding");

  const forceAuthn = extractAttribute("ForceAuthn");
  if (forceAuthn) parsed.forceAuthn = forceAuthn === "true";

  const isPassive = extractAttribute("IsPassive");
  if (isPassive) parsed.isPassive = isPassive === "true";

  // NameID Policy Format
  const nameIDRegex = /<samlp:NameIDPolicy[^>]*Format="([^"]*)"/i;
  const nameIDMatch = xml.match(nameIDRegex);
  if (nameIDMatch) parsed.nameIDFormat = nameIDMatch[1];

  // Parse Response-specific data
  if (parsed.messageType === "Response") {
    // Check if Response itself is signed
    const responseSignatureRegex = /<samlp:Response[^>]*>[\s\S]*?<ds:Signature[\s\S]*?<\/ds:Signature>[\s\S]*?(?=<(?:saml:Assertion|saml:EncryptedAssertion))/i;
    parsed.responseSigned = responseSignatureRegex.test(xml);

    parsed.assertions = [];

    // Check for encrypted assertions
    const encryptedAssertionRegex = /<saml:EncryptedAssertion[^>]*>/gi;
    const encryptedMatches = xml.match(encryptedAssertionRegex);
    if (encryptedMatches) {
      encryptedMatches.forEach(() => {
        parsed.assertions!.push({
          encrypted: true,
          signed: false, // Can't determine if encrypted assertion is signed without decryption
        });
      });
    }

    // Check for unencrypted assertions
    const assertionRegex = /<saml:Assertion[^>]*>([\s\S]*?)<\/saml:Assertion>/gi;
    let match;
    while ((match = assertionRegex.exec(xml)) !== null) {
      const assertionXml = match[0];
      const assertionInfo = parseAssertion(assertionXml);
      parsed.assertions!.push(assertionInfo);
    }
  }

  return parsed;
}

export async function decodeSAMLMessage(
  encodedRequest: string,
  binding: "POST" | "GET",
  relayState?: string
): Promise<DecodedSAMLMessage> {
  let xml: string;

  if (binding === "POST") {
    xml = await decodeSAMLPost(encodedRequest);
  } else {
    xml = await decodeSAMLRedirect(encodedRequest);
  }

  const parsed = parseSAMLXML(xml);

  return {
    binding,
    xml,
    relayState,
    issuer: parsed.issuer,
    destination: parsed.destination,
    issueInstant: parsed.issueInstant,
    requestId: parsed.id,
    parsed,
    rawEncoded: encodedRequest,
  };
}
