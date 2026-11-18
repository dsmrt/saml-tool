import { useEffect, useState } from "react";
import { AlertTriangle, FileWarning, Loader2, RefreshCw, Send } from "lucide-react";
import type { SpResponsePreview, ValueSource } from "../../saml-response-lib";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoGrid, InfoItem } from "@/components/info-item";

/**
 * For a received AuthnRequest (SP-initiated login), preview the Response the
 * response config would produce and offer a button to POST it back to the SP.
 */
export function SpResponseCard({ requestId }: { requestId: string }) {
  const [preview, setPreview] = useState<SpResponsePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/sp-response")
      .then((res) => res.json())
      .then((data: SpResponsePreview | null) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setPreview({ status: "error", configPath: "", error: String(err) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, reloadKey]);

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-5" /> Respond to the SP
        </CardTitle>
        <CardDescription>
          Send a SAML Response back to the Service Provider with InResponseTo set to this request's ID.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={() => setReloadKey((k) => k + 1)} aria-label="Reload config">
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!preview && loading && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading response config…
          </div>
        )}

        {preview?.status === "no-config" && (
          <Alert>
            <FileWarning />
            <AlertTitle>No response config found</AlertTitle>
            <AlertDescription>
              <p>
                Expected <code className="font-mono">{preview.configPath}</code>. Create one with{" "}
                <code className="font-mono">bun run response:init</code>, then reload.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {preview?.status === "error" && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Can't build a Response</AlertTitle>
            <AlertDescription>
              <p className="font-mono break-all">{preview.error}</p>
            </AlertDescription>
          </Alert>
        )}

        {preview?.status === "ready" && (
          <>
            <InfoGrid>
              <InfoItem label="InResponseTo">{preview.requestId}</InfoItem>
              <InfoItem label={<Sourced label="Destination (ACS)" source={preview.acsSource} />}>
                {preview.acsUrl}
              </InfoItem>
              <InfoItem label={<Sourced label="Audience" source={preview.audienceSource} />}>
                {preview.audience}
              </InfoItem>
              <InfoItem label="IdP Issuer">{preview.idpEntityId}</InfoItem>
              <InfoItem label="Subject (NameID)">{preview.nameId}</InfoItem>
              <InfoItem label="RelayState">{preview.relayState ?? "(none)"}</InfoItem>
              <InfoItem label="Signing">
                {[preview.signResponse && "Response", preview.signAssertion && "Assertion"].filter(Boolean).join(" + ") ||
                  "Unsigned"}
              </InfoItem>
            </InfoGrid>

            {preview.warnings.length > 0 && (
              <Alert>
                <AlertTriangle />
                <AlertTitle>Check these before sending</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {preview.warnings.map((w) => (
                      <li key={w} className="break-all">
                        {w}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
      {preview?.status === "ready" && (
        <CardFooter className="flex flex-wrap items-center gap-3">
          <form method="POST" action="/respond">
            <input type="hidden" name="requestId" value={preview.requestId} />
            <Button type="submit">
              <Send /> Send Response to SP
            </Button>
          </form>
          <span className="text-muted-foreground text-xs">
            Built from <code className="font-mono">{preview.configPath}</code>. This tab will POST to the ACS URL.
          </span>
        </CardFooter>
      )}
    </Card>
  );
}

function Sourced({ label, source }: { label: string; source: ValueSource }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <Badge variant="outline" className="px-1 py-0 text-[10px] normal-case">
        from {source}
      </Badge>
    </span>
  );
}
