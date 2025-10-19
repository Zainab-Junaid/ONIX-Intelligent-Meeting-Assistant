import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell title="My Tasks" subtitle="Action items extracted from meetings">
      <div className="rounded-xl border p-8 text-sm text-muted-foreground">
        Tasks assigned to you will show here automatically, with due dates and links to transcript moments.
      </div>
    </AppShell>
  )
}
