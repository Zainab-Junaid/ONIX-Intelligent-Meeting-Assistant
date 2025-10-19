import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { FileDown } from "lucide-react"

export default function Page() {
  return (
    <AppShell title="Recordings" subtitle="Upload and manage audio/video">
      <div className="flex items-center gap-3">
        <Button variant="outline" className="bg-transparent">
          <FileDown className="mr-2 size-4" /> Import
        </Button>
      </div>
      <div className="mt-6 rounded-xl border p-8 text-sm text-muted-foreground">No recordings yet.</div>
    </AppShell>
  )
}
