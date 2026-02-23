import { AppShell } from "@/components/app-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChatbotIcon } from "@/components/icons/chatbot-icon"


export default function Page() {
  return (
    <AppShell title="ChatBot" subtitle="Your smart assistant, always ready to help.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-xl">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Generate summary</p>
              <p className="text-xs text-muted-foreground">Upload a recording to summarize</p>
            </div>
            <Button size="sm">
              <ChatbotIcon className="mr-2 size-4" />Run
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Get Your Queries Answered</p>
              <p className="text-xs text-muted-foreground">Your 24/7 guide, one chat away.</p>
            </div>
            <Button size="sm">
              <ChatbotIcon className="mr-2 size-4" />Chat!
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
