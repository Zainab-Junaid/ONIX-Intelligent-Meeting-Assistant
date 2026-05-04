import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui/card"

export default function Page() {
  return (
    <AppShell title="Templates" subtitle="Note, follow-up, and action templates">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-xl border p-4 text-sm text-muted-foreground">Keep your templates here.</Card>
        <Card className="rounded-xl border p-4 text-sm text-muted-foreground">Customize for your workflow.</Card>
      </div>
    </AppShell>
  )
}
