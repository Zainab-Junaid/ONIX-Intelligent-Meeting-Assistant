"use client"

import { AppShell } from "@/components/app-shell"
import { MeetingAnalyticsPanel } from "@/components/meeting-analytics-panel"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface PageProps {
    params: { meetingId: string }
}

export default function AnalyticsPage({ params }: PageProps) {
    const { meetingId } = params

    return (
        <AppShell
            title="Meeting Analytics"
            actions={
                <Button variant="outline" asChild>
                    <Link href="/meetings" className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Meetings
                    </Link>
                </Button>
            }
        >
            <div className="max-w-4xl mx-auto">
                <MeetingAnalyticsPanel meetingId={meetingId} />
            </div>
        </AppShell>
    )
}
