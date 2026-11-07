import { useEffect, useState } from "react";
import { Inbox, KeyRound, Radio } from "lucide-react";
import type { DecodedSAMLMessage } from "../saml-decoder";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CopyButton } from "@/components/copy-button";
import { CommandExamples } from "@/components/command-examples";
import { MessageView } from "@/components/message-view";
import { ThemeToggle } from "@/components/theme-toggle";

const POLL_INTERVAL_MS = 2000;

export function App() {
  const [message, setMessage] = useState<DecodedSAMLMessage | null>(null);
  const [connected, setConnected] = useState(true);
  const endpoint = `${window.location.origin}/receive`;

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/latest");
        const data: DecodedSAMLMessage | null = await res.json();
        setConnected(true);
        if (data) {
          setMessage((prev) => (prev && prev.rawEncoded === data.rawEncoded && prev.relayState === data.relayState ? prev : data));
        }
      } catch (error) {
        setConnected(false);
        console.error("Error fetching latest message:", error);
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <KeyRound className="size-4" />
            </div>
            <div className="flex-1">
              <h1 className="text-base leading-tight font-semibold">SAML Message Decoder</h1>
              <p className="text-muted-foreground text-xs">Local SAML debugging tool</p>
            </div>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="relative flex size-2">
                {connected && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-destructive"}`}
                />
              </span>
              {connected ? "Listening" : "Disconnected"}
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
          <Card className="py-4">
            <CardContent className="flex flex-wrap items-center gap-3">
              <Radio className="text-muted-foreground size-4" />
              <span className="text-muted-foreground text-sm">Send SAML messages to</span>
              <code className="bg-muted rounded px-2 py-1 font-mono text-sm">{endpoint}</code>
              <CopyButton value={endpoint} label="Copy endpoint" />
              <span className="text-muted-foreground ml-auto text-xs">POST &amp; GET (Redirect) bindings</span>
            </CardContent>
          </Card>

          {message ? <MessageView message={message} /> : <EmptyState />}
          <CommandExamples endpoint={endpoint} />
        </main>
      </div>
    </TooltipProvider>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Inbox className="text-muted-foreground size-6" />
        </div>
        <h2 className="text-lg font-semibold">No SAML message received yet</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Send a SAML AuthnRequest, Response, or LogoutRequest to the endpoint above. Try one of the commands below.
          This page updates automatically.
        </p>
      </CardContent>
    </Card>
  );
}
