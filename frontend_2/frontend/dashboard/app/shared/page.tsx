import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell title="Shared With Me" subtitle="Notes and recordings others shared">
      <div className="rounded-xl border p-8 text-sm text-muted-foreground">Items shared with you will appear here.</div>
    </AppShell>
  )
}
