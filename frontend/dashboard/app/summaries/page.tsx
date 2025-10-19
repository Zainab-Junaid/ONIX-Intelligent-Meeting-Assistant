import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell title="Summary" subtitle="AI-generated notes and insights">
      <div className="rounded-xl border p-8 text-sm text-muted-foreground">
        Summaries will appear here after Onix processes a captured meeting transcript.
      </div>
    </AppShell>
  )
}
