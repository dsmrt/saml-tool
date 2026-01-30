# SAML Testing Tool

A Bun-based testing tool for sending and receiving SAML messages. Send SAML AuthNRequest messages to Service Providers (SP) or Identity Providers (IdP), and receive/decode SAML messages locally for debugging. Supports both HTTP-POST and HTTP-Redirect (GET) bindings.

## Installation

```bash
bun install
```

## Quick Start

### Receive and Decode SAML Messages (Local Debugging Server)

Start the local SAML receiver server:

```bash
bun run receiver
```

Then open http://localhost:3000 in your browser. The receiver will display and decode any SAML messages sent to http://localhost:3000/receive, including:
- Full XML content
- Parsed SAML attributes
- **RelayState parameter** (displayed prominently)
- Encoded request data
- Message type detection (AuthnRequest, Response, LogoutRequest, etc.)

Test it by sending a message:

```bash
bun run authn:post -d http://localhost:3000/receive -r "https://example.com/return"
```

### Send AuthNRequest via POST Binding

```bash
bun run authn:post -d https://idp.example.com/sso
```

### Send AuthNRequest via GET Binding

```bash
bun run authn:get -d https://idp.example.com/sso
```

### Generate Raw XML

```bash
bun run authn:xml
```

## Configuration

### Default Configuration

Create a `.saml-config.ts` file (gitignored) for your test site configurations:

```typescript
import type { SAMLConfig } from "./saml-config";

export const defaultConfig: SAMLConfig = {
  sp: {
    entityId: "http://localhost:3000/metadata",
    assertionConsumerServiceURL: "http://localhost:3000/acs",
    nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  },
  idp: {
    ssoUrl: "https://idp.example.com/sso",
    entityId: "https://idp.example.com/metadata",
  },
  request: {
    binding: "POST",
    forceAuthn: false,
    isPassive: false,
  },
};
```

The `.saml-config.ts` file is gitignored by default, so you can safely add your test site URLs without committing them to the repository. The `saml-config.ts` file contains only the TypeScript interface definition.

### Custom Configuration File

Create a custom config file (e.g., `my-config.ts`) based on `example-config.ts`:

```typescript
import type { SAMLConfig } from "./saml-config";

export const config: SAMLConfig = {
  sp: {
    entityId: "https://my-app.com/metadata",
    assertionConsumerServiceURL: "https://my-app.com/saml/acs",
  },
  idp: {
    ssoUrl: "https://my-idp.com/sso",
    entityId: "https://my-idp.com/metadata",
  },
  request: {
    binding: "POST",
  },
};
```

Then use it:

```bash
bun send-authnrequest.ts -c my-config.ts
```

## CLI Options

```
Usage: bun send-authnrequest.ts [options]

Options:
  -b, --binding <POST|GET>      Binding type (default: POST)
  -d, --destination <url>        IdP SSO URL destination
  -e, --entityId <id>           SP entity ID
  -a, --acsUrl <url>            Assertion Consumer Service URL
  -o, --output <type>           Output type: url, html, xml, browser (default: browser)
  -r, --relayState <state>      RelayState parameter
  -f, --forceAuthn              Force authentication
  -p, --isPassive               Passive authentication
  -c, --config <file>           Load configuration from file
  -h, --help                    Show this help message
```

## Examples

### Basic Usage

```bash
# Send POST binding request and open in browser
bun send-authnrequest.ts -b POST -d https://idp.example.com/sso

# Send GET binding request and open in browser
bun send-authnrequest.ts -b GET -d https://idp.example.com/sso
```

### Output Options

```bash
# Generate redirect URL only (for GET binding)
bun send-authnrequest.ts -b GET -d https://idp.example.com/sso -o url

# Generate HTML form only (for POST binding)
bun send-authnrequest.ts -b POST -d https://idp.example.com/sso -o html

# Output raw XML
bun send-authnrequest.ts -o xml
```

### Advanced Options

```bash
# Force authentication with RelayState
bun send-authnrequest.ts -d https://idp.example.com/sso -f -r "https://myapp.com/dashboard"

# Custom entity ID and ACS URL
bun send-authnrequest.ts \
  -d https://idp.example.com/sso \
  -e "https://myapp.com/metadata" \
  -a "https://myapp.com/saml/acs"

# Use custom config with specific options
bun send-authnrequest.ts -c production-config.ts -b GET -f
```

## Package Scripts

```bash
# Start SAML receiver/decoder server
bun run receiver

# Send POST binding (default)
bun run authn

# Send GET binding
bun run authn:get

# Send POST binding
bun run authn:post

# Output raw XML
bun run authn:xml
```

## SAML Bindings

### HTTP-POST Binding

- Encodes the SAML request in base64
- Generates an HTML form that auto-submits to the IdP
- Suitable for larger SAML requests

### HTTP-Redirect (GET) Binding

- Deflates, base64 encodes, and URL encodes the SAML request
- Creates a redirect URL with the request as a query parameter
- Suitable for smaller SAML requests due to URL length limitations

## Features

### SAML Message Sender
- Supports HTTP-POST and HTTP-Redirect bindings
- Configurable via file or CLI arguments
- Multiple output formats (browser, URL, HTML, XML)
- RelayState support
- ForceAuthn and IsPassive options
- Automatic request ID and timestamp generation
- Browser integration for testing

### SAML Message Receiver (Debugging Tool)
- **Local web server for receiving SAML messages**
- **Decodes both POST and GET bindings**
- **Displays RelayState parameter prominently** (unlike samltool.io)
- Parses and displays all SAML attributes
- Shows raw encoded data
- Auto-detects message types (AuthnRequest, Response, LogoutRequest, etc.)
- Beautiful web interface
- Real-time message display
- Copy XML to clipboard

## Project Structure

```
saml-tool/
├── saml-config.ts          # Configuration interface (checked in)
├── .saml-config.ts         # Your config values (gitignored)
├── saml-lib.ts             # SAML encoding library (for sending)
├── saml-decoder.ts         # SAML decoding library (for receiving)
├── send-authnrequest.ts    # CLI tool for sending AuthnRequest
├── receiver-server.ts      # Local SAML receiver/decoder server
├── receiver.html           # Web UI for SAML receiver
├── receiver.ts             # Frontend script for receiver UI
├── example-config.ts       # Example custom configuration
└── README.md               # This file
```

## Complete Testing Workflow

1. **Start the receiver server**:
   ```bash
   bun run receiver
   ```

2. **Open http://localhost:3000 in your browser**

3. **Send a test SAML message**:
   ```bash
   # In another terminal
   bun send-authnrequest.ts -d http://localhost:3000/receive -r "mystate123"
   ```

4. **View the decoded message** in your browser, including:
   - Message type and binding
   - All SAML attributes (Issuer, Destination, Request ID, etc.)
   - RelayState value (if provided)
   - Full XML content (with copy button)
   - Raw encoded data

## Future Enhancements

- SAML Response handling
- LogoutRequest/LogoutResponse
- Signature support (signing requests)
- Metadata generation
- Response validation
- Multiple SP/IdP profiles

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
