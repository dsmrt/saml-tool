# SAML Tool Demo

This guide shows you how to use the SAML Testing Tool with both sender and receiver.

## Terminal Setup

You'll need **two terminal windows**:

### Terminal 1: Start the Receiver Server

```bash
cd /path/to/saml-tool
bun run receiver
```

You should see:

```
🚀 Starting SAML Receiver Server...

✅ SAML Receiver running at http://localhost:3000

📍 Send SAML messages to: http://localhost:3000/receive

Example commands:
  bun send-authnrequest.ts -d http://localhost:3000/receive
  bun send-authnrequest.ts -d http://localhost:3000/receive -b GET
  bun send-authnrequest.ts -d http://localhost:3000/receive -r "https://example.com/return"
```

### Terminal 2: Send SAML Messages

Keep Terminal 1 running, and in Terminal 2:

```bash
# Send a POST binding request with RelayState
bun send-authnrequest.ts -d http://localhost:3000/receive -r "my-relay-state-123"

# Send a GET binding request
bun send-authnrequest.ts -d http://localhost:3000/receive -b GET -r "another-state"

# Force authentication
bun send-authnrequest.ts -d http://localhost:3000/receive -f -r "forced-auth"

# Custom issuer and ACS URL
bun send-authnrequest.ts \
  -d http://localhost:3000/receive \
  -e "https://myapp.com/metadata" \
  -a "https://myapp.com/acs" \
  -r "custom-relay"
```

## What You'll See

### In Terminal 1 (Server Output)

When you send a message, you'll see:

```
📨 Received SAML message via POST binding
   RelayState: my-relay-state-123
   Message Type: AuthnRequest
   Issuer: https://saml-tool.io
   Request ID: _885f2d2553f7415ba0439da8f9bd4811
```

### In Your Browser (http://localhost:3000)

The receiver will automatically display:

1. **Message Details** section showing:
   - Message type badge (AuthnRequest, Response, etc.)
   - Binding badge (POST or GET)
   - Request ID
   - Issuer
   - Destination
   - Issue Instant
   - ACS URL
   - Protocol Binding
   - NameID Format
   - ForceAuthn status
   - IsPassive status

2. **RelayState** section (prominently displayed in yellow):
   - The full RelayState value
   - Easy to read and copy

3. **Decoded XML** section:
   - Nicely formatted XML
   - Copy button to copy to clipboard
   - Syntax highlighting

4. **Encoded Request** section:
   - The raw base64 encoded data
   - Shows exactly what was sent over the wire

## Quick Test Script

Use the included test script to verify everything works:

```bash
bun test-receiver.ts
```

Output:

```
🧪 Testing SAML Receiver

Sending SAML AuthnRequest to http://localhost:3000/receive...

✅ Request sent! Status: 302

📨 Decoded Message:
   Binding: POST
   Message Type: AuthnRequest
   Request ID: _885f2d2553f7415ba0439da8f9bd4811
   Issuer: https://saml-tool.io
   Destination: http://localhost:3000/receive
   RelayState: test-relay-state-from-script

✨ Success! Open http://localhost:3000 to see the full details.
```

## Complete Workflow Example

### Scenario: Testing Your IdP Integration

1. **Start the receiver** (acts as your IdP endpoint):
   ```bash
   bun run receiver
   ```

2. **Configure your SP** to use the receiver as the IdP:
   ```typescript
   // my-test-config.ts
   export const config = {
     sp: {
       entityId: "https://myapp.com/metadata",
       assertionConsumerServiceURL: "https://myapp.com/saml/acs",
     },
     idp: {
       ssoUrl: "http://localhost:3000/receive",
       entityId: "http://localhost:3000/metadata",
     },
     request: {
       binding: "POST",
     },
   };
   ```

3. **Send a test request**:
   ```bash
   bun send-authnrequest.ts -c my-test-config.ts -r "return-to-dashboard"
   ```

4. **Review the decoded message** at http://localhost:3000 to verify:
   - ✅ Entity ID is correct
   - ✅ ACS URL is correct
   - ✅ NameID format is acceptable
   - ✅ RelayState is preserved
   - ✅ Protocol binding is correct

5. **Debug issues** by examining:
   - The raw XML for any errors
   - The encoded data format
   - All SAML attributes

## Features Highlight

### Unlike samltool.io, this tool:

✨ **Runs locally** - No data sent to external servers
✨ **Displays RelayState prominently** - In a dedicated, highlighted section
✨ **Auto-refreshes** - No need to manually refresh the page
✨ **Shows both bindings** - POST and GET (Redirect) with proper decoding
✨ **Full control** - You control the server and can modify it
✨ **No limits** - Send as many messages as you want
✨ **Terminal integration** - See logs in your terminal
✨ **API access** - Query `/api/latest` for programmatic access

## Tips

- Keep the receiver running while testing multiple configurations
- The receiver stores only the latest message (for simplicity)
- Use RelayState to track different test scenarios
- Check the terminal output for quick verification
- Use the browser for detailed analysis
- Copy the XML for use in other tools
- Try both POST and GET bindings to test compatibility

## Troubleshooting

**Receiver not starting?**
- Check if port 3000 is already in use
- Try: `lsof -i :3000` to see what's using the port

**No message displayed?**
- Check Terminal 1 for error messages
- Verify the destination URL is `http://localhost:3000/receive`
- Wait a few seconds and refresh the browser

**Browser shows old message?**
- The page auto-refreshes every 2 seconds
- Manually refresh if needed
- Check the terminal to verify a new message was received
