"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bot, CalendarPlus, Video, BarChart3, FileText, CheckSquare } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import Link from "next/link"
import MeetingUrlPopup from "@/components/meeting-url-popup"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function Page() {
  const [showMeetingChoice, setShowMeetingChoice] = useState(false)
  const [showBotPopup, setShowBotPopup] = useState(false)

  const handleNewMeetingClick = () => {
    setShowMeetingChoice(true)
  }

  const handleUseExtension = () => {
    window.open("https://meet.new", "_blank", "noopener,noreferrer")
    setShowMeetingChoice(false)
  }

  const handleUseBot = () => {
    setShowMeetingChoice(false)
    setShowBotPopup(true)
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
        <>
          <Button onClick={handleNewMeetingClick} className="rounded-xl">
            <CalendarPlus className="mr-2 size-4" /> New meeting
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Symmetric cards: text above, button below */}
        {/* Join Bot */}
        <Card className="rounded-xl h-full">
          <CardContent className="min-h-[140px] flex h-full flex-col justify-between p-4">
            <div>
              <p className="text-sm font-medium">Join Bot</p>
              <p className="text-xs text-muted-foreground">Invite Onix Bot to your meeting</p>
            </div>
            <Button size="sm" variant="default" className="rounded-lg" onClick={handleUseBot}>
              <Bot className="mr-2 size-4" /> Join Bot
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

      {/* Meeting Choice Dialog */}
      <Dialog open={showMeetingChoice} onOpenChange={setShowMeetingChoice}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Meeting</DialogTitle>
            <DialogDescription>
              Choose how you want to start and capture your meeting.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button onClick={handleUseExtension} variant="outline" className="h-auto p-4 flex flex-col items-start gap-2 w-full whitespace-normal text-left">
              <div className="font-semibold flex items-center gap-2">
                <Video className="size-4 shrink-0" />
                Use Browser Extension
              </div>
              <div className="text-xs text-muted-foreground leading-normal">
                Opens Google Meet in a new tab. Best for when you have the Onix extension installed.
              </div>
            </Button>
            <Button onClick={handleUseBot} variant="outline" className="h-auto p-4 flex flex-col items-start gap-2 w-full whitespace-normal text-left">
              <div className="font-semibold flex items-center gap-2">
                <Bot className="size-4 shrink-0" />
                Invite Onix Bot
              </div>
              <div className="text-xs text-muted-foreground leading-normal">
                Provide a meeting link and the Onix Bot will join to record and transcribe.
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bot URL Popup */}
      <MeetingUrlPopup
        isOpen={showBotPopup}
        onClose={() => setShowBotPopup(false)}
      />
    </AppShell>
  )
}
