# SAML Tool Usage Examples

## Quick Testing

### Test with Default Configuration

```bash
# View the generated XML
bun run authn:xml

# Send POST binding (auto-opens browser)
bun run authn:post

# Send GET binding (auto-opens browser)
bun run authn:get
```

### Test with Real IdP

```bash
# Test against your IdP (POST binding)
bun send-authnrequest.ts -d https://your-idp.com/sso -b POST

# Test against your IdP (GET binding)
bun send-authnrequest.ts -d https://your-idp.com/sso -b GET
```

## Custom Configuration

### Using CLI Arguments

```bash
# Specify all parameters via CLI
bun send-authnrequest.ts \
  -d "https://sso.example.com/idp/SSO.saml2" \
  -e "https://myapp.com/saml/metadata" \
  -a "https://myapp.com/saml/acs" \
  -b POST \
  -f \
  -r "https://myapp.com/dashboard"
```

### Using Configuration File

Create `my-idp-config.ts`:

```typescript
import type { SAMLConfig } from "./saml-config";

export const config: SAMLConfig = {
  sp: {
    entityId: "https://myapp.com/saml/metadata",
    assertionConsumerServiceURL: "https://myapp.com/saml/acs",
    nameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
  },
  idp: {
    ssoUrl: "https://sso.example.com/idp/SSO.saml2",
    entityId: "https://sso.example.com/idp/metadata",
  },
  request: {
    binding: "POST",
    forceAuthn: false,
    isPassive: false,
  },
};
```

Then use it:

```bash
bun send-authnrequest.ts -c my-idp-config.ts
```

## Output Formats

### Get Redirect URL (GET binding)

```bash
# Output just the URL
bun send-authnrequest.ts -b GET -d https://idp.example.com/sso -o url

# Output:
# https://idp.example.com/sso?SAMLRequest=...
```

### Get HTML Form (POST binding)

```bash
# Output the HTML form
bun send-authnrequest.ts -b POST -d https://idp.example.com/sso -o html

# Outputs complete HTML page with auto-submitting form
```

### Get Raw XML

```bash
# Output the raw SAML request
bun send-authnrequest.ts -o xml

# Useful for debugging or manual inspection
```

## Common Scenarios

### Testing with SimpleSAMLphp

```bash
# SimpleSAMLphp typically uses POST binding
bun send-authnrequest.ts \
  -d "https://your-domain.com/simplesaml/saml2/idp/SSOService.php" \
  -e "https://your-sp.com/metadata" \
  -a "https://your-sp.com/saml/acs" \
  -b POST
```

### Testing with Okta

```bash
# Okta IdP URL format
bun send-authnrequest.ts \
  -d "https://your-domain.okta.com/app/your-app-id/sso/saml" \
  -e "https://your-app.com/saml/metadata" \
  -a "https://your-app.com/saml/acs" \
  -b POST
```

### Testing with Azure AD

```bash
# Azure AD IdP URL format
bun send-authnrequest.ts \
  -d "https://login.microsoftonline.com/your-tenant-id/saml2" \
  -e "https://your-app.com/saml/metadata" \
  -a "https://your-app.com/saml/acs" \
  -b POST
```

### Testing with Auth0

```bash
# Auth0 IdP URL format
bun send-authnrequest.ts \
  -d "https://your-domain.auth0.com/samlp/your-client-id" \
  -e "urn:your-app:saml" \
  -a "https://your-app.com/saml/acs" \
  -b POST
```

## Advanced Usage

### Force Authentication

```bash
# Force user to re-authenticate even if session exists
bun send-authnrequest.ts -d https://idp.example.com/sso -f
```

### Passive Authentication

```bash
# Don't prompt user, only authenticate if session exists
bun send-authnrequest.ts -d https://idp.example.com/sso -p
```

### With RelayState

```bash
# Pass a RelayState parameter (returned after authentication)
bun send-authnrequest.ts \
  -d https://idp.example.com/sso \
  -r "https://myapp.com/protected/resource"
```

### Multiple Configurations

Create separate config files for different environments:

```bash
# Development
bun send-authnrequest.ts -c dev-config.ts

# Staging
bun send-authnrequest.ts -c staging-config.ts

# Production
bun send-authnrequest.ts -c prod-config.ts
```

## Programmatic Usage

You can also import and use the library in your own code:

```typescript
import { buildAuthnRequest, encodeForPost, buildPostForm } from "./saml-lib";
import type { SAMLConfig } from "./saml-config";

const config: SAMLConfig = {
  sp: {
    entityId: "https://myapp.com/metadata",
    assertionConsumerServiceURL: "https://myapp.com/acs",
  },
  idp: {
    ssoUrl: "https://idp.example.com/sso",
    entityId: "https://idp.example.com/metadata",
  },
  request: {
    binding: "POST",
  },
};

// Generate SAML request
const authnRequest = buildAuthnRequest(config);
console.log("Raw XML:", authnRequest);

// Encode for POST
const encoded = encodeForPost(authnRequest);
console.log("Encoded:", encoded);

// Generate HTML form
const form = buildPostForm(config, encoded, "optional-relay-state");
console.log("HTML Form:", form);
```

## Debugging

### View All Configuration

```bash
# Run with verbose output
bun send-authnrequest.ts -d https://idp.example.com/sso -o xml

# This shows:
# - Configuration being used
# - Raw XML of the request
# - Encoded values (if applicable)
```

### Test Encoding

```bash
# View raw XML
bun send-authnrequest.ts -o xml

# View encoded request in URL
bun send-authnrequest.ts -b GET -o url

# View POST form HTML
bun send-authnrequest.ts -b POST -o html
```

## Tips

1. **Start Simple**: Use the default config first, then customize as needed
2. **Use GET for Testing**: GET binding URLs are easier to inspect and debug
3. **Check XML First**: Always verify the raw XML looks correct before encoding
4. **Save Configs**: Create separate config files for each IdP you test against
5. **RelayState**: Use RelayState to track where users should return after auth
