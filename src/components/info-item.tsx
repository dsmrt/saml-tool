import type { ReactNode } from "react";

export function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className="font-mono text-sm break-all">{children}</div>
    </div>
  );
}

export function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
