import { Terminal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/copy-button";

interface Example {
  title: string;
  description: string;
  command: string;
}

interface ExampleGroup {
  id: string;
  label: string;
  note?: string;
  examples: Example[];
}

function buildGroups(endpoint: string): ExampleGroup[] {
  return [
    {
      id: "authn",
      label: "AuthnRequest",
      examples: [
        {
          title: "POST binding",
          description: "Send an AuthnRequest with an auto-submitting form (the default).",
          command: `bun send-authnrequest.ts -d ${endpoint}`,
        },
        {
          title: "Redirect (GET) binding",
          description: "Deflate and encode the request into the query string.",
          command: `bun send-authnrequest.ts -d ${endpoint} -b GET`,
        },
        {
          title: "With RelayState",
          description: "Include a RelayState value to check that it comes back unchanged.",
          command: `bun send-authnrequest.ts -d ${endpoint} -r "https://example.com/return"`,
        },
        {
          title: "ForceAuthn + IsPassive",
          description: "Set the ForceAuthn and IsPassive flags on the request.",
          command: `bun send-authnrequest.ts -d ${endpoint} -f -p`,
        },
        {
          title: "Custom SP entity & ACS",
          description: "Override the SP entity ID and Assertion Consumer Service URL.",
          command: `bun send-authnrequest.ts -d ${endpoint} -e https://sp.example.com -a https://sp.example.com/acs`,
        },
        {
          title: "Print the XML",
          description: "Print the raw AuthnRequest XML instead of sending it.",
          command: `bun send-authnrequest.ts -o xml`,
        },
      ],
    },
    {
      id: "response",
      label: "Response",
      note: "Run `bun run response:init` once to create a response config and signing cert.",
      examples: [
        {
          title: "Create response config",
          description: "Generate .saml-response-config.ts and a self-signed cert/key in certs/.",
          command: `bun run response:init`,
        },
        {
          title: "Send a signed Response",
          description: "Post a SAML Response to this receiver.",
          command: `bun send-response.ts -d ${endpoint}`,
        },
        {
          title: "Custom subject & RelayState",
          description: "Override the NameID and RelayState for this Response.",
          command: `bun send-response.ts -d ${endpoint} -n jane@example.com -r "https://app.example.com/home"`,
        },
        {
          title: "Unsigned Response",
          description: "Turn off both signatures to test how an SP handles unsigned messages.",
          command: `bun send-response.ts -d ${endpoint} --no-sign-response --no-sign-assertion`,
        },
        {
          title: "Reply to a specific request",
          description: "Set InResponseTo to the ID of an AuthnRequest you received earlier.",
          command: `bun send-response.ts -d ${endpoint} --in-response-to _abc123`,
        },
        {
          title: "Print the XML",
          description: "Print the Response XML instead of sending it.",
          command: `bun send-response.ts -o xml`,
        },
      ],
    },
    {
      id: "metadata",
      label: "Metadata",
      examples: [
        {
          title: "SP metadata for this receiver",
          description: "Generate SP metadata with this receiver as the ACS URL.",
          command: `bun generate-metadata.ts sp --acs-url ${endpoint}`,
        },
        {
          title: "SP metadata with a new cert",
          description: "Generate a signing cert and write the metadata to a file.",
          command: `bun generate-metadata.ts sp --gen-cert -o sp-metadata.xml`,
        },
        {
          title: "IdP metadata",
          description: "Generate IdP metadata with a custom SSO URL.",
          command: `bun generate-metadata.ts idp --sso-url https://idp.local/sso -o idp-metadata.xml`,
        },
      ],
    },
    {
      id: "test",
      label: "Testing",
      examples: [
        {
          title: "Smoke-test the receiver",
          description: "Send a test AuthnRequest and check that /api/latest decodes it.",
          command: `bun run test:receiver`,
        },
        {
          title: "Send raw XML with curl",
          description: "Base64-encode an existing XML file and POST it here.",
          command: `curl -X POST --data-urlencode "SAMLResponse=$(base64 -i response.xml)" ${endpoint}`,
        },
        {
          title: "Fetch the latest message as JSON",
          description: "Read the most recent decoded message from the API.",
          command: `curl -s ${window.location.origin}/api/latest`,
        },
        {
          title: "Run the test suite",
          description: "Run the unit tests for the SAML libraries.",
          command: `bun test`,
        },
      ],
    },
  ];
}

export function CommandExamples({ endpoint }: { endpoint: string }) {
  const groups = buildGroups(endpoint);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="size-5" /> Example commands
        </CardTitle>
        <CardDescription>Run these from the project root in another terminal. Add -h to any script to see all its options.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={groups[0]!.id}>
          <TabsList>
            {groups.map((g) => (
              <TabsTrigger key={g.id} value={g.id}>
                {g.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {groups.map((g) => (
            <TabsContent key={g.id} value={g.id} className="mt-3 flex flex-col gap-3">
              {g.note && <p className="text-muted-foreground text-sm">{g.note}</p>}
              <div className="grid gap-3 md:grid-cols-2">
                {g.examples.map((ex) => (
                  <div key={ex.title} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">{ex.title}</div>
                      <div className="text-muted-foreground text-xs">{ex.description}</div>
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      <code className="bg-muted flex-1 overflow-x-auto rounded px-2 py-1.5 font-mono text-xs whitespace-nowrap">
                        {ex.command}
                      </code>
                      <CopyButton value={ex.command} label="Copy command" />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
