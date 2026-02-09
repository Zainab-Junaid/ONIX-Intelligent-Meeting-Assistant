"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, Users, MessageSquare, TrendingUp, BarChart3 } from "lucide-react"

interface SpeakerStat {
    id: string
    speakerLabel: string
    speakingTimeSeconds: number
    wordCount: number
    turnCount: number
    interruptionCount: number
    questionCount: number
    talkToListenRatio: number | null
    sentiment: string | null
}

interface MeetingAnalyticsData {
    totalDurationSeconds: number | null
    totalSpeakers: number
    totalWords: number
    avgSpeakingTimePerPerson: number | null
    participationBalanceScore: number | null
    questionCount: number
    sentimentBreakdown: Record<string, number> | null
    topicsDiscussed: string[]
}

interface AnalyticsResponse {
    meeting: {
        id: string
        title: string
        status: string
        startTime: string | null
        endTime: string | null
    }
    speakerStats: SpeakerStat[]
    meetingAnalytics: MeetingAnalyticsData
    hasAnalytics: boolean
}

interface MeetingAnalyticsPanelProps {
    meetingId: string
}

interface SummaryResponse {
    meetingId: string
    summaryText: string
    generatedAt: string
    model: string
    isFallback: boolean
}

interface ActionItem {
    id: string
    item: string
    status: string
    assignedTo?: string | null
    createdAt?: string
}

// Color palette for speakers
const SPEAKER_COLORS = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#F97316', // orange
]

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
}

export function MeetingAnalyticsPanel({ meetingId }: MeetingAnalyticsPanelProps) {
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
    const [summary, setSummary] = useState<SummaryResponse | null>(null)
    const [actionItems, setActionItems] = useState<ActionItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchAnalytics() {
            try {
                setLoading(true)
                const [analyticsRes, summaryRes, actionItemsRes] = await Promise.all([
                    fetch(`/api/meeting-bot/analytics/${meetingId}`),
                    fetch(`/api/meeting-bot/summary/${meetingId}`),
                    fetch(`/api/meeting-bot/action-items/${meetingId}`),
                ])

                if (!analyticsRes.ok) {
                    throw new Error('Failed to fetch analytics')
                }

                const analyticsData = await analyticsRes.json()
                setAnalytics(analyticsData)

                if (summaryRes.ok) {
                    const summaryData = await summaryRes.json()
                    setSummary(summaryData)
                } else {
                    setSummary(null)
                }

                if (actionItemsRes.ok) {
                    const actionItemsData = await actionItemsRes.json()
                    setActionItems(Array.isArray(actionItemsData) ? actionItemsData : [])
                } else {
                    setActionItems([])
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load analytics')
            } finally {
                setLoading(false)
            }
        }

        if (meetingId) {
            fetchAnalytics()
        }
    }, [meetingId])

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-24 bg-muted rounded-lg" />
                <div className="h-48 bg-muted rounded-lg" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
            </div>
        )
    }

    const hasAnalytics = !!analytics?.hasAnalytics
    const speakerStats = analytics?.speakerStats || []
    const meetingAnalytics = analytics?.meetingAnalytics
    const totalSpeakingTime = speakerStats.reduce((sum, s) => sum + s.speakingTimeSeconds, 0)

    return (
        <div className="space-y-6">
            {!hasAnalytics && (
                <div className="p-4 rounded-lg bg-muted/50 text-muted-foreground text-sm">
                    No analytics available for this meeting yet. Analytics are generated after the meeting ends.
                </div>
            )}
            {/* Meeting Overview Cards */}
            {hasAnalytics && meetingAnalytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                            <Clock className="h-4 w-4" />
                            Duration
                        </div>
                        <div className="text-2xl font-bold">
                            {meetingAnalytics.totalDurationSeconds
                                ? formatDuration(meetingAnalytics.totalDurationSeconds)
                                : '--'}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                            <Users className="h-4 w-4" />
                            Speakers
                        </div>
                        <div className="text-2xl font-bold">
                            {meetingAnalytics.totalSpeakers}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                            <MessageSquare className="h-4 w-4" />
                            Total Words
                        </div>
                        <div className="text-2xl font-bold">
                            {meetingAnalytics.totalWords.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                            <TrendingUp className="h-4 w-4" />
                            Balance Score
                        </div>
                        <div className="text-2xl font-bold">
                            {meetingAnalytics.participationBalanceScore !== null
                                ? `${Math.round(meetingAnalytics.participationBalanceScore * 100)}%`
                                : '--'}
                        </div>
                    </CardContent>
                </Card>
            </div>
            )}

            {/* Speaker Participation Chart */}
            {hasAnalytics && speakerStats.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Speaker Participation
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Horizontal stacked bar */}
                        <div className="mb-4">
                            <div className="h-8 rounded-full overflow-hidden flex bg-muted">
                                {speakerStats.map((speaker, idx) => {
                                    const percentage = totalSpeakingTime > 0
                                        ? (speaker.speakingTimeSeconds / totalSpeakingTime) * 100
                                        : 0
                                    return (
                                        <div
                                            key={speaker.id}
                                            style={{
                                                width: `${percentage}%`,
                                                backgroundColor: SPEAKER_COLORS[idx % SPEAKER_COLORS.length]
                                            }}
                                            className="h-full transition-all duration-300 hover:opacity-80"
                                            title={`${speaker.speakerLabel}: ${Math.round(percentage)}%`}
                                        />
                                    )
                                })}
                            </div>
                        </div>

                        {/* Speaker Legend & Stats */}
                        <div className="space-y-3">
                            {speakerStats.map((speaker, idx) => {
                                const percentage = totalSpeakingTime > 0
                                    ? (speaker.speakingTimeSeconds / totalSpeakingTime) * 100
                                    : 0
                                return (
                                    <div key={speaker.id} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: SPEAKER_COLORS[idx % SPEAKER_COLORS.length] }}
                                            />
                                            <span className="font-medium">{speaker.speakerLabel}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-muted-foreground">
                                            <span>{formatDuration(speaker.speakingTimeSeconds)}</span>
                                            <span className="w-12 text-right">{Math.round(percentage)}%</span>
                                            <span className="w-20 text-right">{speaker.wordCount} words</span>
                                            <span className="w-16 text-right">{speaker.turnCount} turns</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Detailed Speaker Stats Table */}
            {hasAnalytics && speakerStats.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Detailed Speaker Stats</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-2 font-medium">Speaker</th>
                                        <th className="text-right py-2 px-2 font-medium">Speaking Time</th>
                                        <th className="text-right py-2 px-2 font-medium">Words</th>
                                        <th className="text-right py-2 px-2 font-medium">Turns</th>
                                        <th className="text-right py-2 px-2 font-medium">Questions</th>
                                        <th className="text-right py-2 px-2 font-medium">Words/Min</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {speakerStats.map((speaker, idx) => {
                                        const wordsPerMin = speaker.speakingTimeSeconds > 0
                                            ? Math.round((speaker.wordCount / speaker.speakingTimeSeconds) * 60)
                                            : 0
                                        return (
                                            <tr key={speaker.id} className="border-b last:border-0">
                                                <td className="py-2 px-2">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ backgroundColor: SPEAKER_COLORS[idx % SPEAKER_COLORS.length] }}
                                                        />
                                                        {speaker.speakerLabel}
                                                    </div>
                                                </td>
                                                <td className="text-right py-2 px-2">{formatDuration(speaker.speakingTimeSeconds)}</td>
                                                <td className="text-right py-2 px-2">{speaker.wordCount.toLocaleString()}</td>
                                                <td className="text-right py-2 px-2">{speaker.turnCount}</td>
                                                <td className="text-right py-2 px-2">{speaker.questionCount}</td>
                                                <td className="text-right py-2 px-2">{wordsPerMin}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Summary */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Meeting Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    {summary ? (
                        <div className="space-y-2 text-sm">
                            <div className="text-muted-foreground">
                                Model: {summary.model}{summary.isFallback ? ' (fallback)' : ''}
                            </div>
                            <div className="whitespace-pre-wrap">{summary.summaryText}</div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            No summary available yet. It will appear after post‑meeting processing completes.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Action Items */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Action Items</CardTitle>
                </CardHeader>
                <CardContent>
                    {actionItems.length > 0 ? (
                        <ul className="space-y-2 text-sm list-disc pl-5">
                            {actionItems.map(item => (
                                <li key={item.id}>
                                    {item.item}
                                    {item.assignedTo ? ` — ${item.assignedTo}` : ''}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            No action items detected for this meeting yet.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
