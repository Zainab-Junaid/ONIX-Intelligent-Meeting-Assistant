import { AppShell } from "@/components/app-shell"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"

export default function Page() {
  return (
    <AppShell title="Search" subtitle="Find meetings, recordings, and notes">
      <form className="flex gap-2">
        <Input placeholder="Search by title, participant, or keyword" />
        <Button>
          <Search className="mr-2 size-4" /> Search
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">Start typing above to search your workspace.</p>
    </AppShell>
  )
}
