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
