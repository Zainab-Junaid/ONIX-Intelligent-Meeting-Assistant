"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, Users, MessageSquare, TrendingUp, BarChart3, AlertTriangle, HelpCircle, Activity, Target, Lightbulb } from "lucide-react"

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
    priority?: string
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

// Calculate Meeting Health Score (composite 0-100)
function calcHealthScore(
    balanceScore: number | null,
    speakerStats: SpeakerStat[],
    totalDuration: number | null,
    totalWords: number,
): number {
    let score = 0
    let factors = 0

    // Balance factor (0-30 pts)
    if (balanceScore !== null) {
        score += (balanceScore) * 30
        factors++
    }

    // Engagement: turns per speaker (0-25 pts)
    if (speakerStats.length > 0) {
        const avgTurns = speakerStats.reduce((s, sp) => s + sp.turnCount, 0) / speakerStats.length
        const turnScore = Math.min(avgTurns / 10, 1) // 10 turns per person = ideal
        score += turnScore * 25
        factors++
    }

    // Question engagement (0-20 pts)
    const totalQuestions = speakerStats.reduce((s, sp) => s + sp.questionCount, 0)
    if (totalQuestions > 0) {
        const qScore = Math.min(totalQuestions / 5, 1) // 5+ questions = great
        score += qScore * 20
        factors++
    } else {
        factors++ // Still count, but 0 pts
    }

    // Productivity: words per minute (0-25 pts)
    if (totalDuration && totalDuration > 0) {
        const wpm = (totalWords / totalDuration) * 60
        // 80-150 WPM is ideal for group meetings
        const wpmScore = wpm >= 80 && wpm <= 150 ? 1 : wpm > 150 ? 0.7 : wpm / 80
        score += wpmScore * 25
        factors++
    }

    return factors > 0 ? Math.round(score / factors * (factors / Math.max(factors, 1))) : 0
}

// Generate smart recommendations
function getRecommendations(
    speakerStats: SpeakerStat[],
    totalDuration: number | null,
    balanceScore: number | null,
): string[] {
    const recs: string[] = []
    if (speakerStats.length === 0) return recs

    const totalSpeaking = speakerStats.reduce((s, sp) => s + sp.speakingTimeSeconds, 0)

    // Dominant speaker
    const dominant = speakerStats[0]
    if (dominant && totalSpeaking > 0) {
        const pct = (dominant.speakingTimeSeconds / totalSpeaking) * 100
        if (pct > 60) {
            recs.push(`⚠️ ${dominant.speakerLabel} spoke ${Math.round(pct)}% of the time. Consider facilitating more balanced input.`)
        }
    }

    // Silent participants
    const quietSpeakers = speakerStats.filter(s => {
        const pct = totalSpeaking > 0 ? (s.speakingTimeSeconds / totalSpeaking) * 100 : 0
        return pct < 10 && speakerStats.length > 2
    })
    if (quietSpeakers.length > 0) {
        recs.push(`💡 ${quietSpeakers.map(s => s.speakerLabel).join(', ')} had less than 10% speaking time. Consider asking for their input directly.`)
    }

    // No questions asked
    const totalQuestions = speakerStats.reduce((s, sp) => s + sp.questionCount, 0)
    if (totalQuestions === 0) {
        recs.push(`❓ No questions were detected. Encourage more Q&A to improve engagement.`)
    } else if (totalQuestions > 10) {
        recs.push(`✅ Great engagement: ${totalQuestions} questions were asked during this meeting.`)
    }

    // Long meeting warning
    if (totalDuration && totalDuration > 3600) {
        recs.push(`⏰ This meeting was over ${Math.round(totalDuration / 3600)} hour(s). Consider breaking into shorter sessions.`)
    }

    // Balance score
    if (balanceScore !== null && balanceScore > 0.85) {
        recs.push(`✅ Excellent participation balance — all speakers contributed meaningfully.`)
    }

    // Monologue warning
    const speakers_with_monologue = speakerStats.filter(s => {
        // longestTurn can be derived from speakingTimeSeconds/turnCount
        const avgTurn = s.turnCount > 0 ? s.speakingTimeSeconds / s.turnCount : 0
        return avgTurn > 60 // Average turn > 1 minute is a sign of monologuing
    })
    if (speakers_with_monologue.length > 0) {
        recs.push(`🎙️ ${speakers_with_monologue.map(s => s.speakerLabel).join(', ')} had long average turns. Shorter turns improve group discussion.`)
    }

    return recs
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
    const totalQuestions = speakerStats.reduce((sum, s) => sum + s.questionCount, 0)
    const healthScore = calcHealthScore(
        meetingAnalytics?.participationBalanceScore ?? null,
        speakerStats,
        meetingAnalytics?.totalDurationSeconds ?? null,
        meetingAnalytics?.totalWords ?? 0,
    )
    const recommendations = getRecommendations(
        speakerStats,
        meetingAnalytics?.totalDurationSeconds ?? null,
        meetingAnalytics?.participationBalanceScore ?? null,
    )

    return (
        <div className="space-y-6">
            {!hasAnalytics && (
                <div className="p-4 rounded-lg bg-muted/50 text-muted-foreground text-sm">
                    No analytics available for this meeting yet. Analytics are generated after the meeting ends.
                </div>
            )}

            {/* Meeting Health Score Hero */}
            {hasAnalytics && meetingAnalytics && (
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-1">
                                    <Activity className="h-4 w-4" />
                                    Meeting Health Score
                                </div>
                                <div className="text-4xl font-bold text-blue-900">
                                    {healthScore}<span className="text-lg text-blue-600">/100</span>
                                </div>
                                <div className="text-xs text-blue-600 mt-1">
                                    {healthScore >= 80 ? '🌟 Excellent' : healthScore >= 60 ? '👍 Good' : healthScore >= 40 ? '⚡ Average' : '⚠️ Needs improvement'}
                                </div>
                            </div>
                            <div className="text-right space-y-1">
                                <div className="text-sm text-blue-700">
                                    <span className="font-medium">{speakerStats.length}</span> speakers •{' '}
                                    <span className="font-medium">{meetingAnalytics.totalDurationSeconds ? formatDuration(meetingAnalytics.totalDurationSeconds) : '--'}</span>
                                </div>
                                <div className="text-sm text-blue-600">
                                    {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} •{' '}
                                    {meetingAnalytics.totalWords.toLocaleString()} words
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Key Topics */}
            {hasAnalytics && meetingAnalytics && meetingAnalytics.topicsDiscussed && meetingAnalytics.topicsDiscussed.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Target className="h-5 w-5 text-indigo-500" />
                            Key Topics
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {meetingAnalytics.topicsDiscussed.map((topic, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-sm rounded-full border border-indigo-200 font-medium"
                                >
                                    {topic}
                                </span>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Overview Cards */}
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

            {/* Engagement Stats Row */}
            {hasAnalytics && speakerStats.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-4 pb-3">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <HelpCircle className="h-4 w-4 text-blue-500" />
                                Questions Asked
                            </div>
                            <div className="text-2xl font-bold text-blue-600">
                                {totalQuestions}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {totalQuestions > 5 ? 'High engagement' : totalQuestions > 0 ? 'Some Q&A' : 'No questions detected'}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 pb-3">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <BarChart3 className="h-4 w-4 text-green-500" />
                                Total Turns
                            </div>
                            <div className="text-2xl font-bold text-green-600">
                                {speakerStats.reduce((s, sp) => s + sp.turnCount, 0)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {speakerStats.length > 0
                                    ? `~${Math.round(speakerStats.reduce((s, sp) => s + sp.turnCount, 0) / speakerStats.length)} per speaker`
                                    : ''}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 pb-3">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <Activity className="h-4 w-4 text-purple-500" />
                                Avg Words/Min
                            </div>
                            <div className="text-2xl font-bold text-purple-600">
                                {totalSpeakingTime > 0
                                    ? Math.round((meetingAnalytics?.totalWords || 0) / totalSpeakingTime * 60)
                                    : '--'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {totalSpeakingTime > 0 ? (() => {
                                    const wpm = Math.round((meetingAnalytics?.totalWords || 0) / totalSpeakingTime * 60)
                                    return wpm >= 80 && wpm <= 150 ? 'Ideal pace' : wpm > 150 ? 'Fast paced' : 'Slow paced'
                                })() : ''}
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
                                        <th className="text-right py-2 px-2 font-medium">Talk:Listen</th>
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
                                                <td className="text-right py-2 px-2">
                                                    <span className={speaker.questionCount > 0 ? 'text-blue-600 font-medium' : ''}>
                                                        {speaker.questionCount}
                                                    </span>
                                                </td>
                                                <td className="text-right py-2 px-2">{wordsPerMin}</td>
                                                <td className="text-right py-2 px-2 text-muted-foreground">
                                                    {speaker.talkToListenRatio !== null ? speaker.talkToListenRatio.toFixed(2) : '--'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Smart Recommendations */}
            {hasAnalytics && recommendations.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-600" />
                            Smart Recommendations
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 text-sm">
                            {recommendations.map((rec, idx) => (
                                <div key={idx} className="text-amber-900">
                                    {rec}
                                </div>
                            ))}
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
                            <div className="whitespace-pre-wrap prose prose-sm max-w-none">{summary.summaryText}</div>
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
                        <div className="space-y-3">
                            {actionItems.map(item => (
                                <div key={item.id} className="flex items-start gap-3 p-2 rounded hover:bg-muted/30">
                                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item.priority === 'high' ? 'bg-red-500' :
                                            item.priority === 'low' ? 'bg-gray-400' :
                                                'bg-amber-500'
                                        }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm">{item.item}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {item.assignedTo && (
                                                <span className="font-medium text-blue-600">→ {item.assignedTo}</span>
                                            )}
                                            {item.priority && (
                                                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${item.priority === 'high' ? 'bg-red-100 text-red-700' :
                                                        item.priority === 'low' ? 'bg-gray-100 text-gray-600' :
                                                            'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {item.priority}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
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
