"use client"

import { AppShell } from "@/components/app-shell"
import { Chatbot } from '@/chatbot';

export default function Page() {
  return (
    <AppShell title="AI Chatbot" subtitle="Your smart assistant, always ready to help.">
      <div className="h-[calc(100vh-120px)]">
        <Chatbot />
      </div>
    </AppShell>
  )
}

