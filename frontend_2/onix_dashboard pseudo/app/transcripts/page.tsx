"use client"

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { AppShell } from "@/components/app-shell"
import { useSearchParams } from 'next/navigation'
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'
import { Pencil, Trash2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Helper function to parse summary markdown and apply colors
function parseSummarySections(summaryText: string) {
  const sections: Array<{ title: string; content: string; color: string }> = []

  // Color mapping for different sections
  const getSectionColor = (title: string) => {
    const lowerTitle = title.toLowerCase()
    if (lowerTitle.includes('executive') || lowerTitle.includes('overview')) {
      return 'bg-blue-50 border-blue-400 text-blue-900'
    } else if (lowerTitle.includes('discussion') || lowerTitle.includes('key points') || lowerTitle.includes('key discussion')) {
      return 'bg-purple-50 border-purple-400 text-purple-900'
    } else if (lowerTitle.includes('decision')) {
      return 'bg-green-50 border-green-400 text-green-900'
    } else if (lowerTitle.includes('action') || lowerTitle.includes('todo')) {
      return 'bg-orange-50 border-orange-400 text-orange-900'
    } else if (lowerTitle.includes('next step') || lowerTitle.includes('follow')) {
      return 'bg-indigo-50 border-indigo-400 text-indigo-900'
    } else if (lowerTitle.includes('important') || lowerTitle.includes('information')) {
      return 'bg-yellow-50 border-yellow-400 text-yellow-900'
    } else {
      return 'bg-gray-50 border-gray-400 text-gray-900'
    }
  }

  // Split by markdown headers (## or #)
  const lines = summaryText.split('\n')
  let currentSection: { title: string; content: string; color: string } | null = null

  for (const line of lines) {
    // Check if it's a header (starts with ## or #)
    const headerMatch = line.match(/^(#{1,2})\s+(.+)$/)

    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        sections.push(currentSection)
      }
      // Start new section
      const title = headerMatch[2].trim()
      currentSection = {
        title,
        content: '',
        color: getSectionColor(title)
      }
    } else if (currentSection) {
      // Add content to current section
      currentSection.content += (currentSection.content ? '\n' : '') + line
    } else {
      // Content before first header - create a default section
      if (sections.length === 0 && line.trim()) {
        currentSection = {
          title: 'Summary',
          content: line,
          color: 'bg-blue-50 border-blue-400 text-blue-900'
        }
      } else if (currentSection) {
        currentSection.content += '\n' + line
      }
    }
  }

  // Add last section
  if (currentSection) {
    sections.push(currentSection)
  }

  // If no sections found, return the whole text as one section
  if (sections.length === 0) {
    return (
      <div className="p-4 rounded-lg border-l-4 bg-blue-50 border-blue-400 text-blue-900 whitespace-pre-wrap">
        {summaryText}
      </div>
    )
  }

  // Render sections with colors
  return (
    <>
      {sections.map((section, index) => (
        <div key={index} className={`p-4 rounded-lg border-l-4 ${section.color}`}>
          <h4 className="font-semibold mb-2 text-base">{section.title}</h4>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {section.content.trim()}
          </div>
        </div>
      ))}
    </>
  )
}

// Helper function to organize notes by type
function organizeNotesByType(notes: any[]) {
  const sections = [
    { type: 'concept', label: 'Key Concepts', notes: [] as any[] },
    { type: 'definition', label: 'Definitions', notes: [] as any[] },
    { type: 'point', label: 'Important Points', notes: [] as any[] },
    { type: 'example', label: 'Examples', notes: [] as any[] },
    { type: 'question', label: 'Questions & Clarifications', notes: [] as any[] },
    { type: 'screenshot', label: 'Screenshots', notes: [] as any[] },
    { type: 'general', label: 'General Notes', notes: [] as any[] }
  ]

  notes.forEach(note => {
    const noteType = note.type || (note.screenshotUrl ? 'screenshot' : 'general')
    const section = sections.find(s => s.type === noteType) || sections[sections.length - 1]
    section.notes.push(note)
  })

  // Remove empty sections
  return sections.filter(section => section.notes.length > 0)
}

type MeetingDoc = {
  id: string
  title: string
  transcript: string
  createdAt: Date | null
  duration?: string
  meetingURL?: string
}

export default function Page() {
  const { authUser, isLoading } = useAuth()
  const [segments, setSegments] = useState<Array<{ speaker: string; text: string; start?: number; end?: number }>>([])
  const [summaryText, setSummaryText] = useState<string>("")
  const [actionItems, setActionItems] = useState<Array<{ id: string; text: string; assignedTo?: string; dueDate?: any }>>([])
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'notes'>('transcript')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState<string>('')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('id')
  const botId = searchParams.get('botId')
  const extensionId = searchParams.get('extensionId')
  const [isGenerating, setIsGenerating] = useState(false)

  // Bot meetings hook
  const { meetings: botMeetings, loading: botLoading } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refreshExtensionMeetings } = useExtensionMeetings()

  // Handle generate summary
  const handleGenerateSummary = async (meetingId: string, transcript: string) => {
    try {
      setIsGenerating(true)
      const token = await authUser?.getIdToken()
      if (!token) {
        alert('Please sign in to generate summary')
        return
      }

      const response = await fetch('/api/extension-meetings/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingId,
          transcript
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate summary')
      }

      await refreshExtensionMeetings()
      alert('Summary generated successfully!')
    } catch (error: any) {
      console.error('Error generating summary:', error)
      alert(`Failed to generate summary: ${error.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Debug logging
  console.log('Transcripts - Bot meetings:', botMeetings);
  console.log('Transcripts - Extension meetings:', extensionMeetings);

  // Handle note deletion
  const handleDeleteNote = async (meetingId: string, noteId: string) => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      return
    }

    setIsDeleting(noteId)
    try {
      const token = await authUser?.getIdToken()
      if (!token) {
        alert('Please sign in to delete notes')
        return
      }

      const response = await fetch(`/api/extension-meetings/notes?meetingId=${meetingId}&noteId=${noteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete note')
      }

      // Refresh meetings to get updated notes
      await refreshExtensionMeetings()
      alert('Note deleted successfully')
    } catch (error: any) {
      console.error('Error deleting note:', error)
      alert(`Failed to delete note: ${error.message}`)
    } finally {
      setIsDeleting(null)
    }
  }

  // Handle note edit
  const handleEditNote = (note: any) => {
    setEditingNoteId(note.id)
    setEditingNoteText(note.text || '')
  }

  // Handle save edited note
  const handleSaveNote = async (meetingId: string, noteId: string) => {
    try {
      const token = await authUser?.getIdToken()
      if (!token) {
        alert('Please sign in to edit notes')
        return
      }

      const response = await fetch('/api/extension-meetings/notes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingId,
          noteId,
          text: editingNoteText
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update note')
      }

      // Refresh meetings to get updated notes
      await refreshExtensionMeetings()
      setEditingNoteId(null)
      setEditingNoteText('')
      alert('Note updated successfully')
    } catch (error: any) {
      console.error('Error updating note:', error)
      alert(`Failed to update note: ${error.message}`)
    }
  }

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingNoteId(null)
    setEditingNoteText('')
  }

  // Handle delete screenshot from note
  const handleDeleteScreenshot = async (meetingId: string, noteId: string) => {
    if (!confirm('Are you sure you want to delete this screenshot? The note text will be kept.')) {
      return
    }

    try {
      const token = await authUser?.getIdToken()
      if (!token) {
        alert('Please sign in to delete screenshots')
        return
      }

      const response = await fetch('/api/extension-meetings/notes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingId,
          noteId,
          deleteScreenshot: true
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete screenshot')
      }

      // Refresh meetings to get updated notes
      await refreshExtensionMeetings()
      alert('Screenshot deleted successfully')
    } catch (error: any) {
      console.error('Error deleting screenshot:', error)
      alert(`Failed to delete screenshot: ${error.message}`)
    }
  }

  // Stream segments and load summary/action items for a specific meeting
  useEffect(() => {
    if (!meetingId) return
    // For a specific meeting, load segments and summary via backend endpoints
    fetch('/api/meeting-bot/meetings')
      .then(r => r.json())
      .then((rows: any[]) => {
        const mtg = rows.find(r => r.meetingId === meetingId)
        if (mtg) {
          setSegments(Array.isArray(mtg.segments) ? mtg.segments : [])
        }
      }).catch(() => setSegments([]))

    fetch('/api/meeting-bot/summaries')
      .then(r => r.json())
      .then((rows: any[]) => {
        const s = rows.find(r => r.meetingId === meetingId)
        setSummaryText(s?.summaryText || '')
      }).catch(() => setSummaryText(''))
  }, [meetingId])

  if (isLoading) return <div className="p-6">Loading…</div>
  if (!authUser) return <div className="p-6">Please sign in to view your transcripts.</div>

  // Show specific extension meeting if extensionId provided
  if (extensionId) {
    const extensionMeeting = extensionMeetings.find(m => m.id === extensionId)
    if (!extensionMeeting) return <div className="p-6">Extension meeting not found.</div>

    return (
      <AppShell title={extensionMeeting.title} subtitle={`Created ${extensionMeeting.createdAt?.toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }) || ''}`}>
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab('transcript')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'transcript'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Transcript
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'summary'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Summary / Action Items
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'notes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Notes {extensionMeeting.notes && extensionMeeting.notes.length > 0 && `(${extensionMeeting.notes.length})`}
            </button>
          </div>

          {/* Transcript Tab */}
          {activeTab === 'transcript' && (
            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="font-medium mb-2">Original Transcript</h3>
                <div className="whitespace-pre-wrap text-sm border-l-4 border-gray-200 pl-4">
                  {extensionMeeting.transcript || 'No transcript available.'}
                </div>
              </div>

              {extensionMeeting.translatedTranscript && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <span>🇬🇧</span> Translated Transcript (English)
                  </h3>
                  <div className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded border">
                    {extensionMeeting.translatedTranscript}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summary / Action Items Tab */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Summary</h3>
                  {(!extensionMeeting.summary?.text || extensionMeeting.summary.text.includes('No summary available')) && (
                    <Button
                      onClick={() => handleGenerateSummary(extensionMeeting.id, extensionMeeting.transcript)}
                      disabled={isGenerating}
                      size="sm"
                    >
                      {isGenerating ? 'Generating...' : 'Generate Summary'}
                    </Button>
                  )}
                </div>

                {extensionMeeting.summary?.text ? (
                  <div className="text-sm space-y-3">
                    {parseSummarySections(extensionMeeting.summary.text)}
                  </div>
                ) : (
                  <div className="text-sm text-center py-8 text-muted-foreground bg-gray-50 rounded-lg border border-dashed">
                    <p className="mb-4">No summary available yet.</p>
                    <Button
                      onClick={() => handleGenerateSummary(extensionMeeting.id, extensionMeeting.transcript)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? 'Generating AI Summary...' : 'Generate AI Summary'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Action Items */}
              <div className="rounded-lg border p-4">
                <h3 className="font-medium mb-2">Action Items</h3>
                {extensionMeeting.actionItems && extensionMeeting.actionItems.length > 0 ? (
                  <div className="space-y-3">
                    {extensionMeeting.actionItems.map((item: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 border-l-4 border-blue-200 rounded-r">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-800 leading-relaxed">{item.text || item}</div>
                          {item.assignedTo && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Assigned to: {item.assignedTo}
                            </div>
                          )}
                          {item.dueDate && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Due: {new Date(item.dueDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No action items found. Action items will be extracted automatically from the transcript.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="rounded-lg border p-4">
              <h3 className="font-medium mb-4">Notes with Screenshots</h3>
              {extensionMeeting.notes && extensionMeeting.notes.length > 0 ? (
                <div className="space-y-6">
                  {organizeNotesByType(extensionMeeting.notes).map((section: { type: string; label: string; notes: any[] }) => (
                    section.notes.length > 0 && (
                      <div key={section.type} className="space-y-3">
                        <h4 className="font-semibold text-base flex items-center gap-2">
                          {section.type === 'concept' && <span>💡</span>}
                          {section.type === 'definition' && <span>📖</span>}
                          {section.type === 'point' && <span>⭐</span>}
                          {section.type === 'example' && <span>📚</span>}
                          {section.type === 'question' && <span>❓</span>}
                          {section.type === 'screenshot' && <span>📷</span>}
                          {section.type === 'general' && <span>📝</span>}
                          {section.label}
                          <span className="text-xs font-normal text-muted-foreground">({section.notes.length})</span>
                        </h4>
                        <div className="space-y-4">
                          {section.notes.map((note: any, index: number) => (
                            <div key={note.id || index} className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors relative">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs text-muted-foreground">
                                  {note.timestamp?.toDate ? new Date(note.timestamp.toDate()).toLocaleString() :
                                    note.createdAt?.toDate ? new Date(note.createdAt.toDate()).toLocaleString() :
                                      'Unknown time'}
                                </div>
                                <div className="flex items-center gap-2">
                                  {note.screenshotUrl && (
                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">📷 Screenshot</span>
                                  )}
                                  {note.type && note.type !== 'screenshot' && (
                                    <span className={`text-xs px-2 py-1 rounded ${note.type === 'concept' ? 'bg-purple-100 text-purple-800' :
                                      note.type === 'definition' ? 'bg-yellow-100 text-yellow-800' :
                                        note.type === 'point' ? 'bg-orange-100 text-orange-800' :
                                          note.type === 'example' ? 'bg-indigo-100 text-indigo-800' :
                                            note.type === 'question' ? 'bg-red-100 text-red-800' :
                                              'bg-blue-100 text-blue-800'
                                      }`}>
                                      {note.type === 'concept' ? '💡 Concept' :
                                        note.type === 'definition' ? '📖 Definition' :
                                          note.type === 'point' ? '⭐ Key Point' :
                                            note.type === 'example' ? '📚 Example' :
                                              note.type === 'question' ? '❓ Question' :
                                                '📝 Note'}
                                    </span>
                                  )}
                                  {!note.screenshotUrl && !note.type && note.text && (
                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">📝 Text Note</span>
                                  )}
                                  {/* Edit and Delete buttons */}
                                  <div className="flex items-center gap-1">
                                    {editingNoteId === note.id ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                          onClick={() => handleSaveNote(extensionMeeting.id, note.id)}
                                          title="Save"
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                                          onClick={handleCancelEdit}
                                          title="Cancel"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                          onClick={() => handleEditNote(note)}
                                          title="Edit note"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => handleDeleteNote(extensionMeeting.id, note.id)}
                                          disabled={isDeleting === note.id}
                                          title="Delete note"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {note.screenshotUrl && (
                                <div className="mb-3 relative group">
                                  <img
                                    src={note.screenshotUrl}
                                    alt={`Screenshot ${index + 1}`}
                                    className="max-w-full h-auto rounded border cursor-pointer hover:opacity-90 shadow-sm"
                                    onClick={() => window.open(note.screenshotUrl, '_blank')}
                                  />
                                  {/* Delete screenshot button - appears on hover */}
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-8 px-2 text-xs shadow-lg"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeleteScreenshot(extensionMeeting.id, note.id)
                                      }}
                                      title="Delete screenshot"
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Delete Screenshot
                                    </Button>
                                  </div>
                                </div>
                              )}
                              {editingNoteId === note.id ? (
                                <textarea
                                  value={editingNoteText}
                                  onChange={(e) => setEditingNoteText(e.target.value)}
                                  className="w-full min-h-[100px] p-3 rounded border border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm"
                                  placeholder="Edit note text..."
                                  autoFocus
                                />
                              ) : note.text ? (
                                <div className={`text-sm whitespace-pre-wrap p-3 rounded border-l-4 ${note.type === 'screenshot' ? 'bg-green-50 border-green-400' :
                                  note.type === 'concept' ? 'bg-purple-50 border-purple-400' :
                                    note.type === 'definition' ? 'bg-yellow-50 border-yellow-400' :
                                      note.type === 'key_point' ? 'bg-orange-50 border-orange-400' :
                                        note.type === 'example' ? 'bg-indigo-50 border-indigo-400' :
                                          note.type === 'question' ? 'bg-red-50 border-red-400' :
                                            'bg-blue-50 border-blue-400'
                                  }`}>
                                  {note.text}
                                </div>
                              ) : null}
                              {!note.screenshotUrl && !note.text && editingNoteId !== note.id && (
                                <div className="text-sm text-muted-foreground italic">Empty note</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No notes yet. Use the "Capture Screenshot" button in the extension to add notes with screenshots.
                </div>
              )}
            </div>
          )}

          {extensionMeeting.meetingURL && (
            <div className="text-sm text-muted-foreground">
              <a href={extensionMeeting.meetingURL} target="_blank" rel="noopener noreferrer" className="underline">
                View original meeting
              </a>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            📝 Extension Meeting • {extensionMeeting.autosave ? 'Auto-saved' : 'Manual save'}
          </div>
        </div>
      </AppShell>
    )
  }

  // Show specific meeting if ID provided (legacy support)
  if (meetingId) {
    // This is for legacy meetings - we'll show a message that they're not supported
    return <div className="p-6">Legacy meeting format not supported. Please use extension or bot meetings.</div>
  }

  // Show specific bot meeting if botId provided
  if (botId) {
    const botMeeting = botMeetings.find(m => m.meetingId === botId)
    if (!botMeeting) return <div className="p-6">Bot meeting not found.</div>

    return (
      <AppShell title={`${botMeeting.title || `Bot Meeting ${botId.substring(0, 8)}...`}`} subtitle={`Created ${new Date((botMeeting as any).createdAtMs ?? botMeeting.createdAt).toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })}`}>
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium mb-2">Transcript Segments</h3>
            <div className="space-y-2">
              {botMeeting.segments?.map((segment, index) => (
                <div key={index} className="border-l-2 border-blue-200 pl-3">
                  <div className="font-medium text-sm text-blue-600">{segment.speaker}</div>
                  <div className="text-sm">{segment.text}</div>
                  <div className="text-xs text-muted-foreground">
                    {segment.start && segment.end ? (
                      <>
                        {Math.floor(segment.start / 60)}:{(segment.start % 60).toString().padStart(2, '0')} -
                        {Math.floor(segment.end / 60)}:{(segment.end % 60).toString().padStart(2, '0')}
                      </>
                    ) : (
                      'Live segment'
                    )}
                  </div>
                </div>
              ))}
              {(!botMeeting.segments || botMeeting.segments.length === 0) && (
                <div className="text-sm text-muted-foreground">No segments yet.</div>
              )}
            </div>
          </div>
          {botMeeting.meetingUrl && (
            <div className="text-sm text-muted-foreground">
              <a href={botMeeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="underline">
                View original meeting
              </a>
            </div>
          )}
        </div>
      </AppShell>
    )
  }

  // Show all meetings list
  return (
    <AppShell title="Transcripts" subtitle="Auto-captured from meetings Onix joins">
      <div className="space-y-6">
        {/* Extension Meetings */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Extension Meetings</h3>
          {extensionLoading && (
            <div className="text-sm text-muted-foreground">Loading extension meetings...</div>
          )}
          <div className="grid gap-3">
            {extensionMeetings.map((meeting) => (
              <a key={meeting.id} href={`/transcripts?extensionId=${meeting.id}`} className="rounded-lg border p-4 hover:bg-muted/40">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{meeting.title || 'Untitled meeting'}</div>
                  <div className="text-sm text-muted-foreground">
                    {meeting.createdAt?.toLocaleString('en-US', {
                      timeZone: 'Asia/Karachi',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  📝 Extension • {meeting.autosave ? 'Auto-saved' : 'Manual save'}
                </div>
              </a>
            ))}
            {!extensionLoading && extensionMeetings.length === 0 && (
              <div className="text-sm text-muted-foreground">No extension meetings yet. Use the extension to start transcribing meetings.</div>
            )}
          </div>
        </div>

        {/* Bot Meetings */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Bot Meetings</h3>
          {botLoading && (
            <div className="text-sm text-muted-foreground">Loading bot meetings...</div>
          )}
          <div className="grid gap-3">
            {botMeetings.map((meeting) => (
              <a key={meeting.meetingId} href={`/transcripts?botId=${meeting.meetingId}`} className="rounded-lg border p-4 hover:bg-muted/40">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Bot Meeting {meeting.meetingId.substring(0, 8)}...</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(meeting.createdAt).toLocaleString('en-US', {
                      timeZone: 'Asia/Karachi',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  📝 {meeting.segments?.length || 0} segments •
                  👥 {meeting.segments ? [...new Set(meeting.segments.map(s => s.speaker))].length : 0} speakers
                </div>
              </a>
            ))}
            {!botLoading && botMeetings.length === 0 && (
              <div className="text-sm text-muted-foreground">No bot meetings yet.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
