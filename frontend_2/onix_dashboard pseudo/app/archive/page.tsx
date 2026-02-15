import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell title="Archive" subtitle="Keep old content here">
      <div className="rounded-xl border p-8 text-sm text-muted-foreground">Your archived items will appear here.</div>
    </AppShell>
  )
}
