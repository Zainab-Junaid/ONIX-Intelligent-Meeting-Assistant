"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bot, CalendarPlus, Video, BarChart3, FileText, CheckSquare } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import Link from "next/link"
import MeetingUrlPopup from "@/components/meeting-url-popup"
import { useBotMeetings } from "@/hooks/use-bot-meetings"

export default function Page() {
  const [showBotPopup, setShowBotPopup] = useState(false)
  const { refetch: refetchBotMeetings } = useBotMeetings()

  const handleStartMeeting = () => {
    window.postMessage({ type: 'ONIX_START_MEETING' }, '*')
  }

  const handleStartBotMeeting = () => {
    setShowBotPopup(true)
  }

  const handleBotSuccess = () => {
    refetchBotMeetings()
  }

  return (
    <AppShell
      title={
        <>
          <span className="text-primary">Onix</span> Dashboard
        </>
      }
      subtitle="AI Meeting Assistant"
      actions={
        <div className="flex gap-2">
          <Button onClick={handleStartBotMeeting} variant="outline" className="rounded-xl">
            Join Bot to Meeting
          </Button>
          <Button onClick={handleStartMeeting} className="rounded-xl">
            <CalendarPlus className="mr-2 size-4" /> Start New Meeting
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Symmetric cards: text above, button below */}
        {/* Start meeting */}
        <Card className="rounded-xl h-full">
          <CardContent className="min-h-[140px] flex h-full flex-col justify-between p-4">
            <div>
              <p className="text-sm font-medium">Start meeting</p>
              <p className="text-xs text-muted-foreground">Join a meeting and auto-capture notes</p>
            </div>
            <Button size="sm" variant="default" className="rounded-lg" onClick={handleStartMeeting}>
              <Video className="mr-2 size-4" /> Start meeting
            </Button>
          </CardContent>
        </Card>
        {/* View transcripts */}
        <Card className="rounded-xl h-full">
          <CardContent className="min-h-[140px] flex h-full flex-col justify-between p-4">
            <div>
              <p className="text-sm font-medium">View transcripts</p>
              <p className="text-xs text-muted-foreground">Auto-captured from meetings Onix joins</p>
            </div>
            <Button size="sm" variant="default" className="rounded-lg" asChild>
              <Link href="/transcripts" prefetch>
                <FileText className="mr-2 size-4" /> Open
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Speaker stats */}
        <Card className="rounded-xl h-full">
          <CardContent className="min-h-[140px] flex h-full flex-col justify-between p-4">
            <div>
              <p className="text-sm font-medium">Speaker stats</p>
              <p className="text-xs text-muted-foreground">Talk time and sentiment per speaker</p>
            </div>
            <Button size="sm" variant="default" className="rounded-lg" asChild>
              <Link href="/speaker-stats" prefetch>
                <BarChart3 className="mr-2 size-4" /> View
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Action items */}
        <Card className="rounded-xl h-full">
          <CardContent className="min-h-[140px] flex h-full flex-col justify-between p-4">
            <div>
              <p className="text-sm font-medium">Action items</p>
              <p className="text-xs text-muted-foreground">Tasks extracted by Onix</p>
            </div>
            <Button size="sm" variant="default" className="rounded-lg" asChild>
              <Link href="/tasks" prefetch>
                <CheckSquare className="mr-2 size-4" /> Review
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Ask the AI */}
        <Card className="rounded-xl h-full">
          <CardContent className="min-h-[140px] flex h-full flex-col justify-between p-4">
            <div>
              <p className="text-sm font-medium">Ask the AI</p>
              <p className="text-xs text-muted-foreground">Query across your meeting memory</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg bg-transparent transition-colors hover:bg-primary/80 hover:text-primary-foreground"
              asChild
            >
              <Link href="/search" prefetch>
                <Bot className="mr-2 size-4" /> Ask me
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid place-items-center rounded-xl border p-10 text-center">
        <p className="max-w-xl text-pretty text-sm text-muted-foreground">
          No meetings captured yet. Start a new Google Meet or invite Onix to an existing call. Your transcripts,
          summaries, speaker stats, and action items will appear here automatically.
        </p>
      </div>

      <MeetingUrlPopup
        isOpen={showBotPopup}
        onClose={() => setShowBotPopup(false)}
        onSuccess={handleBotSuccess}
      />
    </AppShell>
  )
}
