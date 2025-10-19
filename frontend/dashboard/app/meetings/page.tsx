import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell title="Meetings" subtitle="Calendar events Onix can join">
      <div className="rounded-xl border p-8 text-sm text-muted-foreground">
        Connect your calendar so Onix can join events and capture notes automatically.
      </div>
    </AppShell>
  )
}
