import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell title="Transcripts" subtitle="Auto-captured from meetings Onix joins">
      <div className="rounded-xl border p-8 text-sm text-muted-foreground">
        When Onix joins your meetings, transcripts will be listed here with speakers, timestamps, and highlight links.
      </div>
    </AppShell>
  )
}
