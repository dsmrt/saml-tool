import { FileCode2, Lock, LockOpen, MapPin, Package, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AssertionInfo, DecodedSAMLMessage } from "../../saml-decoder";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/copy-button";
import { InfoGrid, InfoItem } from "@/components/info-item";
import { formatXML } from "@/lib/xml";

const typeBadgeClass: Record<string, string> = {
  AuthnRequest: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Response: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  LogoutRequest: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  LogoutResponse: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

export function MessageView({ message }: { message: DecodedSAMLMessage }) {
  const { parsed } = message;
  const assertions = parsed.messageType === "Response" ? parsed.assertions : undefined;
  const prettyXml = formatXML(message.xml);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Message Details</CardTitle>
          <CardDescription>Parsed fields from the received SAML message</CardDescription>
          <CardAction className="flex gap-2">
            <Badge variant="outline">{message.binding}</Badge>
            {parsed.messageType && (
              <Badge className={typeBadgeClass[parsed.messageType]}>{parsed.messageType}</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <InfoGrid>
            {parsed.messageType && <InfoItem label="Message Type">{parsed.messageType}</InfoItem>}
            {parsed.id && <InfoItem label="Request ID">{parsed.id}</InfoItem>}
            {parsed.issuer && <InfoItem label="Issuer">{parsed.issuer}</InfoItem>}
            {parsed.destination && <InfoItem label="Destination">{parsed.destination}</InfoItem>}
            {parsed.issueInstant && <InfoItem label="Issue Instant">{parsed.issueInstant}</InfoItem>}
            {parsed.assertionConsumerServiceURL && (
              <InfoItem label="ACS URL">{parsed.assertionConsumerServiceURL}</InfoItem>
            )}
            {parsed.protocolBinding && (
              <InfoItem label="Protocol Binding">
                {parsed.protocolBinding.replace("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-", "")}
              </InfoItem>
            )}
            {parsed.nameIDFormat && (
              <InfoItem label="NameID Format">{parsed.nameIDFormat.split(":").pop()}</InfoItem>
            )}
            {parsed.forceAuthn !== undefined && (
              <InfoItem label="Force Authn">{parsed.forceAuthn ? "Yes" : "No"}</InfoItem>
            )}
            {parsed.isPassive !== undefined && (
              <InfoItem label="Is Passive">{parsed.isPassive ? "Yes" : "No"}</InfoItem>
            )}
          </InfoGrid>
        </CardContent>
      </Card>

      {assertions && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {parsed.responseSigned ? (
                <ShieldCheck className="size-5 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-5 text-amber-500" />
              )}
              Security
            </CardTitle>
            <CardDescription>Signature and encryption summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Response Signature">
                {parsed.responseSigned ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Signed</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Not signed</span>
                )}
              </Stat>
              <Stat label="Assertions">{assertions.length}</Stat>
              <Stat label="Encrypted">{assertions.filter((a) => a.encrypted).length}</Stat>
              <Stat label="Signed">{assertions.filter((a) => a.signed).length}</Stat>
            </div>
          </CardContent>
        </Card>
      )}

      {assertions?.map((assertion, i) => <AssertionCard key={i} assertion={assertion} index={i} />)}

      {message.relayState && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5" /> RelayState
            </CardTitle>
            <CardAction>
              <CopyButton value={message.relayState} label="Copy RelayState" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-md p-3 font-mono text-sm break-all">{message.relayState}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Tabs defaultValue="xml">
          <CardHeader>
            <CardTitle>Raw Message</CardTitle>
            <CardDescription>Decoded XML and the original encoded payload</CardDescription>
            <CardAction>
              <TabsList>
                <TabsTrigger value="xml">
                  <FileCode2 /> XML
                </TabsTrigger>
                <TabsTrigger value="encoded">
                  <Package /> Encoded
                </TabsTrigger>
              </TabsList>
            </CardAction>
          </CardHeader>
          <CardContent className="mt-4">
            <TabsContent value="xml">
              <CodeBlock value={prettyXml} copyLabel="Copy XML" />
            </TabsContent>
            <TabsContent value="encoded">
              <CodeBlock value={message.rawEncoded} copyLabel="Copy encoded" wrap />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{children}</div>
    </div>
  );
}

function AssertionCard({ assertion, index }: { assertion: AssertionInfo; index: number }) {
  const attributes = assertion.attributes ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {assertion.encrypted ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
          Assertion #{index + 1}
        </CardTitle>
        <CardAction className="flex gap-2">
          {assertion.encrypted && <Badge variant="destructive">Encrypted</Badge>}
          {assertion.signed ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Signed</Badge>
          ) : (
            <Badge variant="secondary">Unsigned</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {assertion.encrypted ? (
          <Alert>
            <Lock />
            <AlertTitle>Encrypted assertion</AlertTitle>
            <AlertDescription>Decrypt it to view the subject and attributes.</AlertDescription>
          </Alert>
        ) : (
          <>
            {assertion.subject && (
              <InfoGrid>
                <InfoItem label="Subject (NameID)">{assertion.subject}</InfoItem>
                {assertion.conditions && (
                  <>
                    <InfoItem label="Valid From">{assertion.conditions.notBefore || "N/A"}</InfoItem>
                    <InfoItem label="Valid Until">{assertion.conditions.notOnOrAfter || "N/A"}</InfoItem>
                  </>
                )}
              </InfoGrid>
            )}

            {attributes.length > 0 ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Attribute</TableHead>
                      <TableHead>Friendly Name</TableHead>
                      <TableHead>Value(s)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attributes.map((attr, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs whitespace-normal break-all align-top">
                          {attr.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground align-top">
                          {attr.friendlyName ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-normal align-top">
                          <div className="flex flex-wrap gap-1">
                            {attr.values.map((v, j) => (
                              <Badge key={j} variant="secondary" className="font-mono break-all whitespace-normal">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No attributes found in this assertion.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CodeBlock({ value, copyLabel, wrap = false }: { value: string; copyLabel: string; wrap?: boolean }) {
  return (
    <div className="relative rounded-lg border bg-zinc-950 text-zinc-100">
      <div className="absolute top-2 right-4 z-10">
        <CopyButton value={value} label={copyLabel} />
      </div>
      <ScrollArea className="h-[480px]">
        <pre className={`p-4 pr-16 font-mono text-xs leading-relaxed ${wrap ? "break-all whitespace-pre-wrap" : ""}`}>
          {value}
        </pre>
      </ScrollArea>
    </div>
  );
}
