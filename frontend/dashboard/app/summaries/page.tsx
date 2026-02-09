"use client"

import { AppShell } from "@/components/app-shell"
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'
import { Mail, CheckCircle2, AlertCircle, Loader2, Edit2, Save, X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

interface BotSummary {
  meetingId: string;
  meetingTitle?: string;
  summaryText: string;
  generatedAt: string;
  model: string;
  isFallback?: boolean;
}

export default function Page() {
  const { summaries, loading, error, refetch, meetings } = useBotMeetings()
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('meetingId') || searchParams.get('botId')
  const { authUser } = useAuth()
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [emailStatus, setEmailStatus] = useState<Record<string, { success: boolean; message: string }>>({})
  const [editingSummary, setEditingSummary] = useState<string | null>(null)
  const [editText, setEditText] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [selectedSummary, setSelectedSummary] = useState<BotSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const resolveMeetingTitle = (id: string, fallback?: string) => {
    const meeting = meetings.find(m => m.meetingId === id)
    return meeting?.title || fallback || `Meeting ${id.substring(0, 8)}...`
  }

  // Fetch summary directly when meetingId is provided
  useEffect(() => {
    if (!meetingId) {
      setSelectedSummary(null)
      return
    }

    let isMounted = true
    setSummaryLoading(true)
    fetch(`/api/meeting-bot/summary/${meetingId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted) setSelectedSummary(data)
      })
      .catch(() => {
        if (isMounted) setSelectedSummary(null)
      })
      .finally(() => {
        if (isMounted) setSummaryLoading(false)
      })

    return () => { isMounted = false }
  }, [meetingId])

  if (loading) {
    return (
      <AppShell title="Summary" subtitle="AI-generated notes and insights">
        <div className="rounded-xl border p-8 text-sm text-muted-foreground">
          Loading summaries...
        </div>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell title="Summary" subtitle="AI-generated notes and insights">
        <div className="rounded-xl border p-8 text-sm text-red-500">
          Error loading summaries: {error}
        </div>
      </AppShell>
    )
  }

  // Filter summaries by meetingId if provided (fallback path)
  const filteredSummaries = meetingId
    ? summaries.filter(summary => summary.meetingId === meetingId)
    : summaries

  const handleSendEmail = async (meetingId: string) => {
    if (!authUser) return
    
    setSendingEmail(meetingId)
    setEmailStatus(prev => ({ ...prev, [meetingId]: { success: false, message: '' } }))
    
    try {
      const token = await authUser.getIdToken()
      const response = await fetch('/api/meetings/send-summary', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meetingId }),
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        setEmailStatus(prev => ({
          ...prev,
          [meetingId]: {
            success: true,
            message: data.message || `Emails sent to ${data.recipients?.length || 0} participants`
          }
        }))
      } else {
        setEmailStatus(prev => ({
          ...prev,
          [meetingId]: {
            success: false,
            message: data.message || data.error || 'Failed to send emails'
          }
        }))
      }
    } catch (error: any) {
      setEmailStatus(prev => ({
        ...prev,
        [meetingId]: {
          success: false,
          message: error.message || 'Failed to send emails'
        }
      }))
    } finally {
      setSendingEmail(null)
    }
  }

  const handleEditSummary = (summary: BotSummary) => {
    setEditingSummary(summary.meetingId)
    setEditText(summary.summaryText)
  }

  const handleSaveEdit = async () => {
    if (!authUser || !editingSummary) return
    
    setSaving(true)
    try {
      const token = await authUser.getIdToken()
      const response = await fetch('/api/meetings/update-summary', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId: editingSummary,
          summaryText: editText,
        }),
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Refresh summaries to show updated text
        await refetch()
        setEditingSummary(null)
        setEditText('')
      } else {
        const errorMsg = data.message || data.error || data.details || 'Failed to update summary'
        alert(`Error: ${errorMsg}`)
        console.error('Update summary error:', data)
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to update summary'
      alert(`Error: ${errorMsg}`)
      console.error('Update summary exception:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingSummary(null)
    setEditText('')
  }

  // Show specific meeting summary if meetingId provided
  if (meetingId && (selectedSummary || filteredSummaries.length > 0)) {
    const summary = selectedSummary || filteredSummaries[0]
    const status = emailStatus[summary.meetingId]
    const isSending = sendingEmail === summary.meetingId

    const meetingTitle = resolveMeetingTitle(meetingId, summary.meetingTitle)

    return (
      <AppShell 
        title={`Meeting Summary ${meetingTitle}`} 
        subtitle={`Generated ${new Date(summary.generatedAt).toLocaleString('en-US', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })}`}
      >
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">Meeting Summary</h3>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleEditSummary(summary)}
                  size="sm"
                  variant="outline"
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  onClick={() => handleSendEmail(summary.meetingId)}
                  disabled={isSending}
                  size="sm"
                  variant="outline"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email to Participants
                    </>
                  )}
                </Button>
              </div>
            </div>
            {status && (
              <div className={`mb-3 p-3 rounded-md flex items-center gap-2 ${
                status.success 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {status.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span className="text-sm">{status.message}</span>
              </div>
            )}
            {summaryLoading ? (
              <div className="text-sm text-muted-foreground">Loading summary...</div>
            ) : editingSummary === summary.meetingId ? (
              <div className="space-y-2">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="Enter summary text..."
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    size="sm"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    size="sm"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm whitespace-pre-line">
                {summary.summaryText}
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              Model: {summary.model}{summary.isFallback ? ' (fallback)' : ''} • Meeting: {meetingTitle}
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Summary" subtitle="AI-generated notes and insights">
      <div className="space-y-4">
        {filteredSummaries.length === 0 ? (
          <div className="rounded-xl border p-8 text-sm text-muted-foreground">
            {meetingId 
              ? `No summary found for meeting ${meetingId.substring(0, 8)}...`
              : "No summaries available yet. Start a bot meeting to generate summaries."
            }
          </div>
        ) : (
          filteredSummaries.map((summary, index) => {
            const status = emailStatus[summary.meetingId]
            const isSending = sendingEmail === summary.meetingId
            
            return (
              <div key={index} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-medium">Meeting Summary</h3>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-muted-foreground">
                      {new Date(summary.generatedAt).toLocaleString('en-US', {
                        timeZone: 'Asia/Karachi',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </div>
                    <Button
                      onClick={() => handleEditSummary(summary)}
                      size="sm"
                      variant="outline"
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleSendEmail(summary.meetingId)}
                      disabled={isSending}
                      size="sm"
                      variant="outline"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Send Email
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {status && (
                  <div className={`mb-3 p-3 rounded-md flex items-center gap-2 ${
                    status.success 
                      ? 'bg-green-50 text-green-700 border border-green-200' 
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {status.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span className="text-sm">{status.message}</span>
                  </div>
                )}
                {editingSummary === summary.meetingId ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="Enter summary text..."
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        size="sm"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={saving}
                        size="sm"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-line">
                    {summary.summaryText}
                  </div>
                )}
                <div className="mt-2 text-xs text-muted-foreground">
                  Model: {summary.model}{summary.isFallback ? ' (fallback)' : ''} • Meeting: {resolveMeetingTitle(summary.meetingId, summary.meetingTitle)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </AppShell>
  )
}
