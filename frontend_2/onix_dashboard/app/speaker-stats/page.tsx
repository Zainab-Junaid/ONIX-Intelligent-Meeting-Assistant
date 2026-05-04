import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell title="Speaker Stats" subtitle="Talk time, turns, pace, and sentiment">
      <div className="rounded-xl border p-8 text-sm text-muted-foreground">
        Speaker analytics will appear after Onix captures a meeting. Talk-time distribution will appear here.
      </div>
    </AppShell>
  )
}
