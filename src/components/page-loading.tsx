import { Card, PageHeader } from "@/components/ui";

export function PageLoading({ title = "Loading workspace", variant = "table" }: { title?: string; variant?: "table" | "form" | "detail" }) {
  return (
    <div aria-busy="true">
      <PageHeader title={title} />
      <p role="status" aria-live="polite" className="mb-6 text-muted">Loading content…</p>
      <Card className={variant === "table" ? "overflow-hidden" : "max-w-3xl p-6 sm:p-8"}>
        <div aria-hidden="true">
          {variant === "table" ? (
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-4 gap-6 border-b border-border bg-background p-6">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-4 bg-border" />)}</div>
              {Array.from({ length: 4 }, (_, row) => <div key={row} className="grid min-w-[640px] grid-cols-4 gap-6 border-b border-border p-6">{Array.from({ length: 4 }, (_, col) => <div key={col} className="h-4 bg-background" />)}</div>)}
            </div>
          ) : <div className="grid gap-6 sm:grid-cols-2">{Array.from({ length: variant === "form" ? 6 : 4 }, (_, i) => <div key={i} className="space-y-4"><div className="h-4 w-24 bg-border" /><div className={variant === "form" ? "h-11 border border-border bg-background" : "h-4 bg-background"} /></div>)}</div>}
        </div>
      </Card>
    </div>
  );
}

export function WorkspaceLoading() {
  return <div className="min-h-screen"><header className="app-header"><p className="brand">PrimeWave</p><p role="status" className="text-muted">Opening workspace…</p></header><main className="workspace-content"><PageLoading /></main></div>;
}

export function AccountLoading({ title }: { title: string }) {
  return <main className="flex min-h-screen items-center justify-center px-4 py-8"><div className="w-full max-w-md"><PageLoading title={title} variant="form" /></div></main>;
}
