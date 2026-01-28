// Frontend script for SAML receiver
import type { DecodedSAMLMessage } from "./saml-decoder";

// Poll for the latest message
async function checkForMessage() {
  try {
    const response = await fetch("/api/latest");
    const data: DecodedSAMLMessage | null = await response.json();

    if (data) {
      displayMessage(data);
    }
  } catch (error) {
    console.error("Error fetching latest message:", error);
  }
}

function displayMessage(message: DecodedSAMLMessage) {
  const content = document.getElementById("content");
  if (!content) return;

  const bindingBadge = `<span class="badge ${message.binding.toLowerCase()}">${message.binding}</span>`;
  const typeBadge = message.parsed.messageType
    ? `<span class="badge ${message.parsed.messageType.toLowerCase()}">${message.parsed.messageType}</span>`
    : "";

  content.innerHTML = `
    <div class="section">
      <h2>
        Message Details
        ${bindingBadge}
        ${typeBadge}
      </h2>

      <div class="info-grid">
        ${message.parsed.messageType ? `
          <div class="info-item">
            <label>Message Type</label>
            <div class="value">${message.parsed.messageType}</div>
          </div>
        ` : ""}

        ${message.parsed.id ? `
          <div class="info-item">
            <label>Request ID</label>
            <div class="value">${message.parsed.id}</div>
          </div>
        ` : ""}

        ${message.parsed.issuer ? `
          <div class="info-item">
            <label>Issuer</label>
            <div class="value">${message.parsed.issuer}</div>
          </div>
        ` : ""}

        ${message.parsed.destination ? `
          <div class="info-item">
            <label>Destination</label>
            <div class="value">${message.parsed.destination}</div>
          </div>
        ` : ""}

        ${message.parsed.issueInstant ? `
          <div class="info-item">
            <label>Issue Instant</label>
            <div class="value">${message.parsed.issueInstant}</div>
          </div>
        ` : ""}

        ${message.parsed.assertionConsumerServiceURL ? `
          <div class="info-item">
            <label>ACS URL</label>
            <div class="value">${message.parsed.assertionConsumerServiceURL}</div>
          </div>
        ` : ""}

        ${message.parsed.protocolBinding ? `
          <div class="info-item">
            <label>Protocol Binding</label>
            <div class="value">${message.parsed.protocolBinding.replace("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-", "")}</div>
          </div>
        ` : ""}

        ${message.parsed.nameIDFormat ? `
          <div class="info-item">
            <label>NameID Format</label>
            <div class="value">${message.parsed.nameIDFormat.split(":").pop()}</div>
          </div>
        ` : ""}

        ${message.parsed.forceAuthn !== undefined ? `
          <div class="info-item">
            <label>Force Authn</label>
            <div class="value">${message.parsed.forceAuthn ? "Yes" : "No"}</div>
          </div>
        ` : ""}

        ${message.parsed.isPassive !== undefined ? `
          <div class="info-item">
            <label>Is Passive</label>
            <div class="value">${message.parsed.isPassive ? "Yes" : "No"}</div>
          </div>
        ` : ""}
      </div>
    </div>

    ${message.relayState ? `
      <div class="section">
        <h2>RelayState</h2>
        <div class="relay-state-section">
          <h3>📍 RelayState Parameter</h3>
          <div class="relay-state-value">${escapeHtml(message.relayState)}</div>
        </div>
      </div>
    ` : ""}

    <div class="section">
      <h2>Decoded XML</h2>
      <div class="xml-container">
        <button class="copy-btn" onclick="copyXML()">Copy XML</button>
        <pre id="xml-content">${escapeHtml(formatXML(message.xml))}</pre>
      </div>
    </div>

    <div class="section">
      <div class="encoded-section">
        <h3>📦 Encoded Request (${message.binding} Binding)</h3>
        <div class="encoded-value">${escapeHtml(message.rawEncoded)}</div>
      </div>
    </div>
  `;
}

function formatXML(xml: string): string {
  // Simple XML formatting
  let formatted = "";
  let indent = 0;
  const tab = "  ";

  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) indent--; // Closing tag
    formatted += tab.repeat(indent) + "<" + node + ">\n";
    if (node.match(/^<?\w[^>]*[^\/]$/)) indent++; // Opening tag
  });

  return formatted.substring(1, formatted.length - 2);
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Make copyXML available globally
(window as any).copyXML = async function () {
  const xmlContent = document.getElementById("xml-content");
  if (!xmlContent) return;

  const text = xmlContent.textContent || "";
  await navigator.clipboard.writeText(text);

  const btn = document.querySelector(".copy-btn") as HTMLButtonElement;
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove("copied");
    }, 2000);
  }
};

// Check for messages on load
checkForMessage();

// Poll every 2 seconds for new messages
setInterval(checkForMessage, 2000);
