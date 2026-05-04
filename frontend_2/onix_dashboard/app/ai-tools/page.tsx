import { AppShell } from "@/components/app-shell"
import { Chatbot } from "@/components/chatbot/Chatbot"

export default function Page() {
  return (
    <AppShell title="AI Chatbot" subtitle="Ask anything about your meetings">
      <Chatbot />
    </AppShell>
  )
}
