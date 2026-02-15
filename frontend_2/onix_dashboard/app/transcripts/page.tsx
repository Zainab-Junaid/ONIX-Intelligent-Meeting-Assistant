"use client"

import { useEffect, useState, useRef } from 'react'
import { CheckSquare } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { AppShell } from "@/components/app-shell"
import { useSearchParams } from 'next/navigation'
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Pencil, Trash2, X, Check, Download, FileText, User, Calendar, Users, PieChart, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import jsPDF from 'jspdf'
// @ts-ignore
import autoTable from 'jspdf-autotable'
import { io, Socket } from 'socket.io-client'
import { SpeakerTranscript } from '@/components/speaker-transcript'
import { Mail, Loader2, Edit2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { EmailRecipientsDialog } from '@/components/email-recipients-dialog'

// Helper to convert image URL/Base64 to Data URL for jspdf
const getImgData = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = (e) => reject(e)
    img.src = url
  })
}

// Helper to cleaning text and removing markdown junk
const cleanMarkdownText = (text: string) => {
  if (!text) return "";
  return text
    .replace(/##/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .trim();
};

// Clean a single line of any remaining markdown artifacts
const cleanLine = (text: string): string => {
  return text
    .replace(/^#{1,3}\s+/, '')  // leading # ## ###
    .replace(/\*\*/g, '')       // all **
    .replace(/(?<![a-zA-Z])\*(?![a-zA-Z*])/g, '') // orphan *
    .replace(/^[\-•]\s+/, '')   // leading bullet markers
    .trim();
};

// Render markdown text as heading + body format, simple and clean
const renderSummaryContent = (text: string) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Detect heading: ## Heading or **Heading** (standalone bold line that's short)
    const hashHeading = trimmed.match(/^#{1,3}\s+(.+)$/);
    const boldHeading = trimmed.match(/^\*\*([^*]+)\*\*\s*$/);
    // Also detect lines that are just bold text followed by dash/colon as headings
    const boldWithSep = trimmed.match(/^\*\*([^*]+)\*\*\s*[—\-:]\s*$/);

    if (hashHeading || boldHeading) {
      const headingText = cleanLine(hashHeading ? hashHeading[1] : boldHeading![1]);
      if (headingText) {
        elements.push(
          <h4 key={key++} className="text-sm font-semibold text-slate-800 mt-4 first:mt-0 mb-1">
            {headingText}
          </h4>
        );
      }
      continue;
    }

    // Handle "**bold title** — description" pattern on one line
    const boldDescMatch = trimmed.match(/^\*\*(.+?)\*\*\s*[—\-:]\s*(.+)$/);
    if (boldDescMatch) {
      elements.push(
        <div key={key++} className="mb-2 pl-2">
          <span className="font-semibold text-slate-800">{boldDescMatch[1]}</span>
          <span className="text-slate-600"> — {boldDescMatch[2]}</span>
        </div>
      );
      continue;
    }

    // Bullet point: - text or * text or • text
    const bulletMatch = trimmed.match(/^[\-*•]\s+(.+)$/);
    if (bulletMatch) {
      const content = cleanLine(bulletMatch[1]);
      if (content) {
        elements.push(
          <div key={key++} className="flex items-start gap-2 pl-2 mb-1">
            <span className="text-slate-400 mt-0.5 text-xs">•</span>
            <span className="text-slate-700 text-sm leading-relaxed">{content}</span>
          </div>
        );
      }
      continue;
    }

    // Numbered list: 1. text
    const numMatch = trimmed.match(/^(\d+)[.)\s]+(.+)$/);
    if (numMatch) {
      const content = cleanLine(numMatch[2]);
      if (content) {
        elements.push(
          <div key={key++} className="flex items-start gap-2 pl-2 mb-1">
            <span className="text-slate-500 font-medium text-sm min-w-[1.2rem]">{numMatch[1]}.</span>
            <span className="text-slate-700 text-sm leading-relaxed">{content}</span>
          </div>
        );
      }
      continue;
    }

    // Regular text — clean and render
    const cleaned = cleanLine(trimmed);
    if (cleaned) {
      elements.push(
        <p key={key++} className="text-slate-700 text-sm leading-relaxed mb-1 pl-2">
          {cleaned}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
};


// Extract sections from summary text based on ## headings
function extractSummarySections(summaryText: string): { title: string; content: string }[] {
  if (!summaryText) return [];

  const sections: { title: string; content: string }[] = [];
  const lines = summaryText.split('\n');
  let currentTitle = 'Summary';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section header: ## Heading
    const hashHeading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (hashHeading) {
      // Save previous section if it has content
      if (currentLines.some(l => l.trim())) {
        sections.push({ title: currentTitle, content: currentLines.join('\n') });
      }
      currentTitle = hashHeading[1].replace(/\*\*/g, '').replace(/\*/g, '').trim();
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  // Save last section
  if (currentLines.some(l => l.trim())) {
    sections.push({ title: currentTitle, content: currentLines.join('\n') });
  }

  return sections;
}

// Helper function to organize notes by type
function organizeNotesByType(notes: any[]) {
  const sections = [
    { type: 'concept', label: 'Key Concepts', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', notes: [] as any[] },
    { type: 'definition', label: 'Definitions', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', notes: [] as any[] },
    { type: 'point', label: 'Important Points', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', notes: [] as any[] },
    { type: 'example', label: 'Examples', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', notes: [] as any[] },
    { type: 'question', label: 'Questions & Clarifications', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', notes: [] as any[] },
    { type: 'screenshot', label: 'Screenshots', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', notes: [] as any[] },
    { type: 'general', label: 'General Notes', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', notes: [] as any[] }
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

  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [attendees, setAttendees] = useState<string[]>([])
  const [isFetchingAttendees, setIsFetchingAttendees] = useState(false)
  const { toast } = useToast()

  const handleOpenEmailDialog = async () => {
    if (!botId || !authUser) return;
    setIsEmailDialogOpen(true);
    setAttendees([]); // Clear stale data so we show loading state

    // Always fetch calendar attendees when opening - meeting may be linked to Google Calendar
    setIsFetchingAttendees(true);
    try {
      const token = await authUser.getIdToken();
      const response = await fetch('/api/meeting-bot/attendees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ meetingId: botId })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.attendees && Array.isArray(data.attendees) && data.attendees.length > 0) {
          setAttendees(data.attendees);
          toast({
            title: "Calendar Participants Loaded",
            description: `Found ${data.attendees.length} participants. Add or remove anyone before sending.`,
          });
        } else {
          toast({
            title: "No Calendar Participants",
            description: "Add recipients manually below. The meeting may not be linked to a calendar event.",
          });
        }
      } else {
        console.error('Failed to fetch attendees:', await response.text());
        toast({
          title: "Could not load participants",
          description: "Add recipients manually below.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching attendees:', error);
      toast({
        title: "Could not load participants",
        description: "Add recipients manually below.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingAttendees(false);
    }
  }

  const handleSendEmail = async (recipients: string[]) => {
    if (!botId || !authUser) return;

    // Find current meeting to get title/date info
    const currentMeeting = botMeetings.find(m => m.meetingId === botId);
    if (!currentMeeting) {
      toast({ title: "Error", description: "Meeting details not found.", variant: "destructive" });
      return;
    }

    setIsSendingEmail(true);
    try {
      const token = await authUser.getIdToken();
      const response = await fetch('/api/meeting-bot/send-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingId: botId,
          recipients: recipients,
          // Pass data directly to ensure what user sees is what gets sent
          data: {
            meetingTitle: currentMeeting.title || 'Untitled Meeting',
            summaryText: summaryText,
            meetingDate: new Date((currentMeeting as any).createdAtMs || currentMeeting.createdAt).toLocaleDateString(),
            meetingUrl: currentMeeting.meetingUrl,
            actionItems: botActionItems,
            participants: recipients
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Emails Sent",
          description: data.message || `Summary emailed to ${recipients.length} participants successfully.`,
        });
        setIsEmailDialogOpen(false);
      } else {
        throw new Error(data.error || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send summary email.",
        variant: "destructive"
      });
    } finally {
      setIsSendingEmail(false);
    }
  };
  const [segments, setSegments] = useState<Array<{ speaker: string; text: string; start?: number; end?: number }>>([])
  // Live segments state for real-time updates
  const [liveSegments, setLiveSegments] = useState<Array<{ speaker: string; text: string; start?: number; end?: number }>>([])
  const socketRef = useRef<Socket | null>(null)
  const botMeetingSocketRef = useRef<Socket | null>(null)
  const [summaryText, setSummaryText] = useState<string>("")
  const [actionItems, setActionItems] = useState<Array<{ id: string; text: string; assignedTo?: string; dueDate?: any }>>([])
  // Bot specific state
  const [botActionItems, setBotActionItems] = useState<any[]>([])
  const [botAnalytics, setBotAnalytics] = useState<any>(null)

  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'notes' | 'actions' | 'stats' | 'analytics'>('transcript')
  const [summarySection, setSummarySection] = useState<string>('all') // all, executive, keypoints, decisions, actions, nextsteps, important
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState<string>('')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('id')
  const botId = searchParams.get('botId')
  const extensionId = searchParams.get('extensionId')

  // Reset attendees when switching to a different meeting
  useEffect(() => {
    setAttendees([])
  }, [botId])

  // Bot meetings hook
  const { meetings: botMeetings, loading: botLoading } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refreshExtensionMeetings } = useExtensionMeetings()

  // Debug logging
  console.log('Transcripts - Bot meetings:', botMeetings);
  console.log('Transcripts - Extension meetings:', extensionMeetings);

  // Handle generating summary
  const handleGenerateSummary = async (meetingId: string, transcript: string) => {
    if (!transcript || transcript.trim().length < 50) {
      alert('Transcript is too short to generate a summary. Please wait for more conversation.')
      return
    }

    setIsGenerating(true)
    try {
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
        body: JSON.stringify({ meetingId, transcript })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate summary')
      }

      await refreshExtensionMeetings()
    } catch (error: any) {
      console.error('Error generating summary:', error)
      alert(`Failed to generate summary: ${error.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

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
      // alert('Note deleted successfully') 
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
      // alert('Note updated successfully')
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
      // alert('Screenshot deleted successfully')
    } catch (error: any) {
      console.error('Error deleting screenshot:', error)
      alert(`Failed to delete screenshot: ${error.message}`)
    }
  }

  // Generate and download PDF
  const handleDownloadPDF = async (meeting: any) => {
    try {
      const doc = new jsPDF()

      // Add Title
      doc.setFontSize(22)
      doc.setTextColor(41, 50, 65) // Dark blue/gray
      doc.setFont('helvetica', 'bold')
      doc.text(meeting.title || 'Meeting Notes', 20, 20)

      // Add Date and Metadata
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.setFont('helvetica', 'normal')
      const dateStr = meeting.createdAt ? new Date(meeting.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : ''
      doc.text(dateStr, 20, 28)

      doc.setDrawColor(200, 200, 200)
      doc.line(20, 32, 190, 32)

      // Organize notes
      const organizedSections = organizeNotesByType(meeting.notes || [])
      let yPos = 40

      for (const section of organizedSections) {
        // Check for page break
        if (yPos > 260) {
          doc.addPage()
          yPos = 20
        }

        // Section Header
        const headerColor: [number, number, number] =
          section.type === 'concept' ? [107, 33, 168] : // purple
            section.type === 'definition' ? [161, 98, 7] : // yellow/brown
              section.type === 'point' ? [194, 65, 12] : // orange
                section.type === 'example' ? [67, 56, 202] : // indigo
                  section.type === 'question' ? [185, 28, 28] : // red
                    [30, 58, 138] // blue (general)

        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...headerColor)

        // Icon mapping
        const label =
          section.type === 'concept' ? 'Key Concepts' :
            section.type === 'definition' ? 'Definitions' :
              section.type === 'point' ? 'Important Points' :
                section.type === 'example' ? 'Examples' :
                  section.type === 'question' ? 'Questions' :
                    section.label

        doc.text(label, 20, yPos)
        yPos += 8

        // Text notes
        const textNotes = section.notes.filter((n: any) => n.text && !n.screenshotUrl)
        if (textNotes.length > 0) {
          const bodyData = textNotes.map((note: any) => [note.text])

          autoTable(doc, {
            startY: yPos,
            body: bodyData,
            theme: 'plain',
            styles: {
              font: 'helvetica',
              fontSize: 11,
              cellPadding: 3,
              textColor: [50, 50, 50],
              overflow: 'linebreak'
            },
            columnStyles: {
              0: { cellWidth: 170 }
            },
            didParseCell: function (data: any) {
              data.cell.styles.cellPadding = { top: 1, bottom: 1, left: 5, right: 0 }
            },
            willDrawCell: function (data: any) {
              if (data.section === 'body') {
                doc.setFillColor(50, 50, 50);
                doc.circle(data.cell.x + 2, data.cell.y + data.cell.height / 2, 0.5, "F");
              }
            },
            margin: { left: 20, right: 20 }
          })

          // @ts-ignore
          yPos = doc.lastAutoTable.finalY + 10
        }

        // Screenshots - Include actual images
        const screenshotNotes = section.notes.filter((n: any) => n.screenshotUrl)
        for (const note of screenshotNotes) {
          // Check for page break
          if (yPos > 220) {
            doc.addPage()
            yPos = 20
          }

          try {
            const imgData = await getImgData(note.screenshotUrl)
            const imgProps = doc.getImageProperties(imgData)
            const maxWidth = 160
            const imgWidth = Math.min(maxWidth, imgProps.width)
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width

            // Double check for page break for the image height
            if (yPos + imgHeight > 280) {
              doc.addPage()
              yPos = 20
            }

            doc.addImage(imgData, 'PNG', 25, yPos, imgWidth, imgHeight)
            yPos += imgHeight + 5

            if (note.text) {
              doc.setFontSize(10)
              doc.setFont('helvetica', 'italic')
              doc.setTextColor(80, 80, 80)
              const textLines = doc.splitTextToSize(note.text, 150)
              doc.text(textLines, 30, yPos)
              yPos += (textLines.length * 5) + 5
            } else {
              yPos += 5
            }
          } catch (e) {
            console.error('Failed to add image to PDF:', e)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'italic')
            doc.setTextColor(150, 150, 150)
            doc.text(`[Screenshot attached: ${note.id.substring(0, 8)}]`, 25, yPos)
            yPos += 10
          }
        }
      }

      doc.save(`${meeting.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.pdf`)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
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

  // Fetch data for Bot Meeting & Connect Socket
  useEffect(() => {
    if (!botId || !authUser) return;

    let isMounted = true;

    // 1. Initial Fetch
    const fetchBotData = async () => {
      try {
        const token = await authUser.getIdToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch Transcript Segments
        try {
          // Use our new proxy endpoint that fetches full transcript from backend
          const r = await fetch(`/api/meeting-bot/transcript/${botId}`, { headers });
          if (r.ok) {
            const data = await r.json();
            if (isMounted) {
              if (data.segments && Array.isArray(data.segments)) {
                console.log('📝 Loaded', data.segments.length, 'segments from storage for bot meeting', botId);
                setLiveSegments(data.segments);
                setSegments(data.segments);
              } else if (Array.isArray(data)) {
                // Handle case where backend returns array directly
                console.log('📝 Loaded', data.length, 'segments from storage (array) for bot meeting', botId);
                setLiveSegments(data);
                setSegments(data);
              }
            }
          } else {
            console.warn('Failed to fetch transcript:', await r.text());
          }
        } catch (err) {
          console.error('Failed to load bot transcript:', err);
        }

        // Fetch Summary
        try {
          const r = await fetch(`/api/meeting-bot/summary/${botId}`, { headers });
          if (r.ok) {
            const data = await r.json();
            if (isMounted) {
              setSummaryText(data.summaryText || '');
            }
          }
        } catch (err) {
          console.error('Failed to load bot summary:', err);
        }

        // Fetch Action Items
        try {
          const r = await fetch(`/api/meeting-bot/action-items/${botId}`, { headers });
          if (r.ok) {
            const data = await r.json();
            if (isMounted) {
              setBotActionItems(Array.isArray(data) ? data : []);
            }
          }
        } catch (err) {
          console.error('Failed to load bot action items:', err);
        }

        // Fetch Analytics
        try {
          const r = await fetch(`/api/meeting-bot/analytics/${botId}`, { headers });
          if (r.ok) {
            const data = await r.json();
            if (isMounted) {
              setBotAnalytics(data);
            }
          }
        } catch (err) {
          console.error('Failed to load bot analytics:', err);
        }

      } catch (error) {
        console.error('Error in fetchBotData:', error);
      }
    };

    fetchBotData();

    // 2. Connect to Socket.IO for Real-Time Updates
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
    console.log('🔌 Connecting to Socket.IO at:', backendUrl);

    const socket = io(backendUrl, {
      transports: ['polling', 'websocket'], // Allow polling first, then upgrade
      withCredentials: true,
    });

    botMeetingSocketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to Socket.IO for bot meeting at', backendUrl);
      socket.emit('join_meeting', botId);
    });

    socket.on('transcript_update', (data: { meetingId: string; segments: any[]; timestamp: string }) => {
      if (data.meetingId === botId) {
        console.log('📝 Real-time update for bot meeting:', data.segments.length, 'segments');
        if (isMounted) {
          setLiveSegments(prev => {
            const segmentMap = new Map<string, any>();
            // Add existing segments
            prev.forEach(seg => {
              // Create unique key based on start time or text content
              const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}-${seg.text.substring(0, 30)}` : seg.text.substring(0, 50);
              segmentMap.set(key, seg);
            });

            // Merge new segments
            data.segments.forEach(seg => {
              const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}-${seg.text.substring(0, 30)}` : seg.text.substring(0, 50);
              if (!segmentMap.has(key) || segmentMap.get(key).text !== seg.text) {
                segmentMap.set(key, seg);
              }
            });

            return Array.from(segmentMap.values()).sort((a, b) => {
              if (a.start !== undefined && b.start !== undefined) return a.start - b.start;
              return 0;
            });
          });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from Socket.IO server');
    });

    return () => {
      isMounted = false;
      if (botMeetingSocketRef.current) {
        botMeetingSocketRef.current.emit('leave_meeting', botId);
        botMeetingSocketRef.current.disconnect();
        botMeetingSocketRef.current = null;
      }
    };
  }, [botId, authUser]);

  if (isLoading) return <div className="p-6">Loading…</div>
  if (!authUser) return <div className="p-6">Please sign in to view your transcripts.</div>

  // Show specific extension meeting if extensionId provided
  if (extensionId) {
    const extensionMeeting = extensionMeetings.find(m => m.id === extensionId)
    if (!extensionMeeting) return <div className="p-6">Extension meeting not found.</div>

    return (
      <AppShell title={extensionMeeting.title} subtitle={`Created ${extensionMeeting.createdAt ? new Date(extensionMeeting.createdAt).toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }) : ''} ${extensionMeeting.sessionCount ? `| Sessions: ${extensionMeeting.sessionCount}` : ''}`}>
        <div className="space-y-6">
          {/* Modern Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'transcript' | 'summary' | 'notes')} className="w-full">
            <TabsList className="w-full max-w-2xl">
              <TabsTrigger value="transcript" className="flex-1">
                <FileText className="size-4 mr-2" />
                Transcript
              </TabsTrigger>
              <TabsTrigger value="summary" className="flex-1">
                <FileText className="size-4 mr-2" />
                Summary
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-1">
                <Download className="size-4 mr-2" />
                Notes {extensionMeeting.notes && extensionMeeting.notes.length > 0 && `(${extensionMeeting.notes.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="mt-6">
              <div className="rounded-lg border p-6 bg-white shadow-sm space-y-4">
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
            </TabsContent>

            <TabsContent value="summary" className="mt-6">
              <div className="space-y-6">
                {/* Summary */}
                <div className="rounded-lg border p-6 bg-white shadow-sm">
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
                    <>
                      {/* Section Filter Buttons */}
                      {/* Dynamic filter buttons based on actual headings */}
                      {(() => {
                        const sections = extractSummarySections(extensionMeeting.summary.text);
                        return (
                          <>
                            {sections.length > 1 && (
                              <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b">
                                <button
                                  onClick={() => setSummarySection('all')}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${summarySection === 'all'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                >
                                  All Sections
                                </button>
                                {sections.map((sec, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setSummarySection(sec.title)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${summarySection === sec.title
                                      ? 'bg-blue-600 text-white shadow-md'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                      }`}
                                  >
                                    {sec.title}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="space-y-6">
                              {sections
                                .filter(sec => summarySection === 'all' || sec.title === summarySection)
                                .map((sec, idx) => (
                                  <div key={idx}>
                                    <h4 className="text-base font-semibold text-slate-800 mb-3">{sec.title}</h4>
                                    {renderSummaryContent(sec.content)}
                                  </div>
                                ))}
                            </div>
                          </>
                        );
                      })()}
                    </>
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

                {/* Action Items - Only show when filter is 'actions' or 'all' */}
                {(summarySection === 'actions' || summarySection === 'all') && (
                  <div className="rounded-2xl border p-6 bg-white shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="size-2 rounded-full bg-blue-500" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-blue-600">Action Items</h3>
                    </div>

                    {extensionMeeting.actionItems && extensionMeeting.actionItems.length > 0 ? (
                      <div className="space-y-4">
                        {extensionMeeting.actionItems.map((item: any, index: number) => {
                          const itemText = typeof item === 'string' ? item : item.text;
                          // Clean up raw markdown hashes and triple-hashes that user reported
                          const cleanItem = cleanMarkdownText(itemText);

                          return (
                            <div key={index} className="flex items-start gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors group">
                              <div className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-slate-800 leading-relaxed">
                                  {renderTextWithMarkdown(cleanItem, 'text-blue-600', 'bg-blue-500')}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {item.assignedTo && (
                                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${item.assignedTo.toLowerCase() === 'you'
                                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                      }`}>
                                      <User className="h-3 w-3" />
                                      <span>{item.assignedTo}</span>
                                    </div>
                                  )}
                                  {item.dueDate && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                                      <Calendar className="h-3 w-3" />
                                      <span>
                                        {item.dueDate?.toDate
                                          ? new Date(item.dueDate.toDate()).toLocaleDateString()
                                          : typeof item.dueDate === 'string' ? item.dueDate : 'No date'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                        No action items found. Extraction will happen automatically.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-6">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Notes with Screenshots</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => handleDownloadPDF(extensionMeeting)}
                  >
                    <Download className="h-4 w-4" />
                    Download Notes PDF
                  </Button>
                </div>

                {extensionMeeting.notes && extensionMeeting.notes.length > 0 ? (
                  <div className="space-y-8">
                    {organizeNotesByType(extensionMeeting.notes).map((section) => (
                      <div key={section.type} className="space-y-4">
                        <h4 className={`font-semibold text-lg flex items-center gap-2 ${section.color} border-b pb-2`}>
                          {section.type === 'concept' && <span>💡</span>}
                          {section.type === 'definition' && <span>📖</span>}
                          {section.type === 'point' && <span>⭐</span>}
                          {section.type === 'example' && <span>📚</span>}
                          {section.type === 'question' && <span>❓</span>}
                          {section.type === 'screenshot' && <span>📷</span>}
                          {section.type === 'general' && <span>📝</span>}
                          {section.label}
                          <span className="text-xs font-normal text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full">
                            {section.notes.length}
                          </span>
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {section.notes.map((note: any, index: number) => (
                            <div key={note.id || index} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow relative group">
                              {note.screenshotUrl && (
                                <div className="mb-3 relative">
                                  <img
                                    src={note.screenshotUrl}
                                    alt="Screenshot"
                                    className="w-full h-auto rounded border cursor-pointer"
                                    onClick={() => window.open(note.screenshotUrl, '_blank')}
                                  />
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-8 w-8 p-0 shadow-sm"
                                      onClick={() => handleDeleteScreenshot(extensionMeeting.id, note.id)}
                                      title="Delete Screenshot"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}

                              <div className="flex justify-between items-start mb-2">
                                <div className="text-xs text-muted-foreground">
                                  {note.timestamp?.toDate ? new Date(note.timestamp.toDate()).toLocaleString() :
                                    note.createdAt?.toDate ? new Date(note.createdAt.toDate()).toLocaleString() :
                                      'Unknown time'}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleEditNote(note)}
                                    className="p-1 hover:bg-black/5 rounded text-gray-500"
                                    title="Edit Note"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNote(extensionMeeting.id, note.id)}
                                    className="p-1 hover:bg-black/5 rounded text-red-500"
                                    title="Delete Note"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {editingNoteId === note.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingNoteText}
                                    onChange={(e) => setEditingNoteText(e.target.value)}
                                    className="w-full min-h-[100px] p-2 rounded border border-blue-300 focus:ring-1 focus:ring-blue-500 text-sm"
                                    autoFocus
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" className="h-8" onClick={handleCancelEdit}>
                                      <X className="h-4 w-4 mr-1" /> Cancel
                                    </Button>
                                    <Button size="sm" className="h-8" onClick={() => handleSaveNote(extensionMeeting.id, note.id)}>
                                      <Check className="h-4 w-4 mr-1" /> Save
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className={`text-sm whitespace-pre-wrap ${!note.screenshotUrl ? 'bg-gray-50 p-3 rounded border-l-4 ' + section.border : ''}`}>
                                  {note.text ? renderTextWithMarkdown(note.text) : (note.screenshotUrl ? '' : 'Empty note')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed">
                    <FileText className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">No notes generated for this meeting yet.</p>
                    <p className="text-xs text-gray-500 mt-1">Use the extension to capture notes and screenshots during the meeting.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {extensionMeeting.meetingURL && (
            <div className="text-sm text-muted-foreground mt-6 pt-4 border-t">
              <a href={extensionMeeting.meetingURL} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">
                View original meeting
              </a>
            </div>
          )}
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
      <AppShell title={`${botMeeting.title || `Bot Meeting ${botId.substring(0, 8)}...`}`} subtitle={`Created ${(() => {
        const d = new Date((botMeeting as any).createdAtMs ?? (botMeeting as any).createdAt);
        return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      })()}`}>

        <div className="space-y-4">
          <Tabs value={activeTab as string} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="transcript">
                <FileText className="size-4 mr-2" />
                Transcript
              </TabsTrigger>
              <TabsTrigger value="summary">
                <FileText className="size-4 mr-2" />
                Summary
              </TabsTrigger>
              <TabsTrigger value="actions">
                <CheckSquare className="size-4 mr-2" />
                Action Items
              </TabsTrigger>
              <TabsTrigger value="stats">
                <PieChart className="size-4 mr-2" />
                Participants & Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="mt-6">
              <div className="rounded-lg border p-4 bg-white">
                <h3 className="font-medium mb-2">
                  Speaker Transcript{' '}
                  {(() => {
                    const status = (botMeeting as any).status?.toLowerCase?.();
                    const isLiveMeeting = status === 'live' || status === 'bot_launched';
                    if (isLiveMeeting) {
                      return <span className="text-xs font-normal text-green-600 ml-2 animate-pulse">● Live Updates</span>;
                    }
                    if (segments.length > 0 || liveSegments.length > 0) {
                      return <span className="text-xs font-normal text-slate-500 ml-2">Ended</span>;
                    }
                    return null;
                  })()}
                </h3>
                <div className="max-h-[70vh] overflow-y-auto pr-2">
                  <SpeakerTranscript
                    segments={liveSegments.length > 0 ? liveSegments : segments}
                    isLive={((botMeeting as any).status?.toLowerCase?.() === 'live' || (botMeeting as any).status?.toLowerCase?.() === 'bot_launched')}
                    meetingEnded={((botMeeting as any).status?.toLowerCase?.() !== 'live' && (botMeeting as any).status?.toLowerCase?.() !== 'bot_launched') && (segments.length > 0 || liveSegments.length > 0)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="mt-6">
              <div className="rounded-lg border p-6 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">AI Summary</h3>
                  <div className="flex gap-2">
                    {isEditingSummary ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => setIsEditingSummary(false)}
                        >
                          <X className="size-3" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            // Save the edited summary from the textarea
                            const textarea = document.getElementById('summary-edit-textarea') as HTMLTextAreaElement;
                            if (textarea) {
                              setSummaryText(textarea.value);
                            }
                            setIsEditingSummary(false);
                          }}
                        >
                          <Check className="size-3" />
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setIsEditingSummary(true)}
                      >
                        <Edit2 className="size-3" />
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={isSendingEmail || !summaryText}
                      onClick={handleOpenEmailDialog}
                    >
                      {isSendingEmail ? <Loader2 className="size-3 animate-spin" /> : <Mail className="size-3" />}
                      Send Email to Participants
                    </Button>
                  </div>
                </div>
                {summaryText ? (
                  isEditingSummary ? (
                    <textarea
                      id="summary-edit-textarea"
                      defaultValue={summaryText}
                      className="w-full min-h-[400px] p-4 border rounded-lg text-sm font-mono bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                    />
                  ) : (
                    <>
                      {/* Dynamic filter buttons based on actual headings */}
                      {(() => {
                        const sections = extractSummarySections(summaryText);
                        return (
                          <>
                            {sections.length > 1 && (
                              <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b">
                                <button
                                  onClick={() => setSummarySection('all')}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${summarySection === 'all'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                >
                                  All Sections
                                </button>
                                {sections.map((sec, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setSummarySection(sec.title)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${summarySection === sec.title
                                      ? 'bg-blue-600 text-white shadow-md'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                      }`}
                                  >
                                    {sec.title}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="space-y-6">
                              {sections
                                .filter(sec => summarySection === 'all' || sec.title === summarySection)
                                .map((sec, idx) => (
                                  <div key={idx}>
                                    <h4 className="text-base font-semibold text-slate-800 mb-3">{sec.title}</h4>
                                    {renderSummaryContent(sec.content)}
                                  </div>
                                ))}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed text-muted-foreground">
                    No summary available yet.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="actions" className="mt-6">
              <div className="rounded-lg border p-6 bg-white shadow-sm">
                <h3 className="font-medium mb-4">Action Items</h3>
                {botActionItems && botActionItems.length > 0 ? (
                  <div className="space-y-2">
                    {botActionItems.map((item: any, index: number) => {
                      const text = typeof item === 'string' ? item : item.item || item.text || 'No description';
                      const priority = item.priority || 'medium';
                      const assignedTo = item.assignedTo;
                      return (
                        <div key={item.id || index} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${priority === 'high' ? 'bg-red-500' :
                            priority === 'low' ? 'bg-gray-400' :
                              'bg-amber-500'
                            }`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">{text}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              {assignedTo && (
                                <span className="font-medium text-blue-600">→ {assignedTo}</span>
                              )}
                              {priority && (
                                <span className={`px-1.5 py-0.5 rounded text-xs ${priority === 'high' ? 'bg-red-100 text-red-700' :
                                  priority === 'low' ? 'bg-gray-100 text-gray-600' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                  {priority}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed text-muted-foreground">
                    No action items found.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="stats" className="mt-6">
              <div className="space-y-6">
                {/* Overview Stats Grid */}
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Overall Stats */}
                  <div className="rounded-lg border p-6 bg-white shadow-sm">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <Activity className="size-4" /> Overview
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Speaking Duration</div>
                        <div className="text-2xl font-bold">
                          {botAnalytics?.meetingAnalytics?.totalDurationSeconds
                            ? `${Math.floor(botAnalytics.meetingAnalytics.totalDurationSeconds / 60)}m ${botAnalytics.meetingAnalytics.totalDurationSeconds % 60}s`
                            : '0m'}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Speakers</div>
                        <div className="text-2xl font-bold">
                          {botAnalytics?.meetingAnalytics?.totalSpeakers || 0}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Total Words</div>
                        <div className="text-2xl font-bold">
                          {botAnalytics?.meetingAnalytics?.totalWords || 0}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Questions</div>
                        <div className="text-2xl font-bold">
                          {botAnalytics?.meetingAnalytics?.questionCount || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Speaker Breakdown */}
                  <div className="rounded-lg border p-6 bg-white shadow-sm">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <Users className="size-4" /> Speaker Breakdown
                    </h3>
                    <div className="space-y-4">
                      {botAnalytics?.speakerStats?.map((speaker: any, i: number) => (
                        <div key={i} className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase">
                            {(speaker.speakerLabel || speaker.speaker || '?').substring(0, 1)}
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between mb-1">
                              <span className="text-sm font-medium">{speaker.speakerLabel || speaker.speaker || 'Unknown'}</span>
                              <span className="text-xs text-muted-foreground">
                                {Math.floor(speaker.speakingTimeSeconds / 60)}m {Math.floor(speaker.speakingTimeSeconds % 60)}s
                              </span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{
                                  width: `${Math.min(100, (speaker.speakingTimeSeconds / (botAnalytics.meetingAnalytics?.totalDurationSeconds || 1)) * 100)}%`
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {(!botAnalytics?.speakerStats || botAnalytics.speakerStats.length === 0) && (
                        <div className="text-center py-4 text-muted-foreground text-sm">No speaker data available</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Topics */}
                {botAnalytics?.meetingAnalytics?.topicsDiscussed && botAnalytics.meetingAnalytics.topicsDiscussed.length > 0 && (
                  <div className="rounded-lg border p-6 bg-white shadow-sm">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      🎯 Key Topics
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {botAnalytics.meetingAnalytics.topicsDiscussed.map((topic: string, i: number) => (
                        <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-200">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Engagement Metrics */}
                <div className="rounded-lg border p-6 bg-white shadow-sm">
                  <h3 className="font-medium mb-4 flex items-center gap-2">
                    <Activity className="size-4" /> Engagement Metrics
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="text-purple-600 text-xs uppercase tracking-wider font-semibold mb-1">Questions Asked</div>
                      <div className="text-2xl font-bold text-purple-900">{botAnalytics?.meetingAnalytics?.questionCount || 0}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="text-blue-600 text-xs uppercase tracking-wider font-semibold mb-1">Total Turns</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {botAnalytics?.speakerStats?.reduce((sum: number, s: any) => sum + (s.turnCount || 0), 0) || 0}
                      </div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                      <div className="text-green-600 text-xs uppercase tracking-wider font-semibold mb-1">Words/Min</div>
                      <div className="text-2xl font-bold text-green-900">
                        {botAnalytics?.meetingAnalytics?.totalDurationSeconds && botAnalytics?.meetingAnalytics?.totalWords
                          ? Math.round(botAnalytics.meetingAnalytics.totalWords / (botAnalytics.meetingAnalytics.totalDurationSeconds / 60))
                          : 0}
                      </div>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                      <div className="text-amber-600 text-xs uppercase tracking-wider font-semibold mb-1">Balance Score</div>
                      <div className="text-2xl font-bold text-amber-900">
                        {(() => {
                          const stats = botAnalytics?.speakerStats;
                          if (!stats || stats.length === 0) return '--';
                          const totalTime = stats.reduce((s: number, sp: any) => s + (sp.speakingTimeSeconds || 0), 0);
                          if (totalTime === 0) return '--';
                          const ideal = 1 / stats.length;
                          const deviation = stats.reduce((s: number, sp: any) => {
                            const actual = (sp.speakingTimeSeconds || 0) / totalTime;
                            return s + Math.abs(actual - ideal);
                          }, 0) / stats.length;
                          return `${Math.round((1 - deviation) * 100)}%`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Speaker Participation Stacked Bar */}
                {botAnalytics?.speakerStats && botAnalytics.speakerStats.length > 0 && (
                  <div className="rounded-lg border p-6 bg-white shadow-sm">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <Users className="size-4" /> Speaker Participation
                    </h3>
                    <div className="h-8 flex rounded-full overflow-hidden mb-4">
                      {botAnalytics.speakerStats.map((speaker: any, i: number) => {
                        const totalTime = botAnalytics.speakerStats.reduce((s: number, sp: any) => s + (sp.speakingTimeSeconds || 0), 0);
                        const pct = totalTime > 0 ? ((speaker.speakingTimeSeconds || 0) / totalTime) * 100 : 0;
                        const colors = ['bg-blue-500', 'bg-orange-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-amber-500', 'bg-indigo-500'];
                        return (
                          <div
                            key={i}
                            className={`${colors[i % colors.length]} transition-all`}
                            style={{ width: `${pct}%` }}
                            title={`${speaker.speakerLabel || speaker.speaker}: ${Math.round(pct)}%`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {botAnalytics.speakerStats.map((speaker: any, i: number) => {
                        const totalTime = botAnalytics.speakerStats.reduce((s: number, sp: any) => s + (sp.speakingTimeSeconds || 0), 0);
                        const pct = totalTime > 0 ? ((speaker.speakingTimeSeconds || 0) / totalTime) * 100 : 0;
                        const colors = ['bg-blue-500', 'bg-orange-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-amber-500', 'bg-indigo-500'];
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${colors[i % colors.length]}`} />
                            <span className="text-sm">{speaker.speakerLabel || speaker.speaker || 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground">({Math.round(pct)}%)</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Detailed Table */}
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2 font-medium">Speaker</th>
                            <th className="text-right py-2 px-2 font-medium">Time</th>
                            <th className="text-right py-2 px-2 font-medium">Words</th>
                            <th className="text-right py-2 px-2 font-medium">Turns</th>
                            <th className="text-right py-2 px-2 font-medium">Questions</th>
                            <th className="text-right py-2 px-2 font-medium">WPM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {botAnalytics.speakerStats.map((speaker: any, i: number) => {
                            const mins = Math.floor((speaker.speakingTimeSeconds || 0) / 60);
                            const secs = Math.floor((speaker.speakingTimeSeconds || 0) % 60);
                            const wpm = speaker.speakingTimeSeconds > 0
                              ? Math.round((speaker.wordCount || 0) / (speaker.speakingTimeSeconds / 60))
                              : 0;
                            return (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-2 px-2 font-medium">{speaker.speakerLabel || speaker.speaker || 'Unknown'}</td>
                                <td className="text-right py-2 px-2">{mins}m {secs}s</td>
                                <td className="text-right py-2 px-2">{(speaker.wordCount || 0).toLocaleString()}</td>
                                <td className="text-right py-2 px-2">{speaker.turnCount || 0}</td>
                                <td className="text-right py-2 px-2">
                                  <span className={(speaker.questionCount || 0) > 0 ? 'text-blue-600 font-medium' : ''}>
                                    {speaker.questionCount || 0}
                                  </span>
                                </td>
                                <td className="text-right py-2 px-2">{wpm}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Smart Recommendations */}
                {botAnalytics?.speakerStats && botAnalytics.speakerStats.length > 0 && (
                  <div className="rounded-lg border border-amber-200 p-6 bg-amber-50/50 shadow-sm">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      💡 Smart Recommendations
                    </h3>
                    <div className="space-y-2 text-sm text-amber-900">
                      {(() => {
                        const recs: string[] = [];
                        const stats = botAnalytics.speakerStats;
                        const totalTime = stats.reduce((s: number, sp: any) => s + (sp.speakingTimeSeconds || 0), 0);

                        if (stats.length >= 2) {
                          const maxPct = Math.max(...stats.map((s: any) => ((s.speakingTimeSeconds || 0) / totalTime) * 100));
                          const minPct = Math.min(...stats.map((s: any) => ((s.speakingTimeSeconds || 0) / totalTime) * 100));
                          if (maxPct - minPct > 40) {
                            recs.push('⚠️ Participation is significantly imbalanced. Consider encouraging quieter participants to share more.');
                          } else if (maxPct - minPct < 15) {
                            recs.push('✅ Great participation balance! All speakers contributed fairly equally.');
                          }
                        }

                        const totalWords = botAnalytics.meetingAnalytics?.totalWords || 0;
                        const durationMins = totalTime / 60;
                        if (durationMins > 0) {
                          const overallWpm = totalWords / durationMins;
                          if (overallWpm > 180) recs.push('🏃 The pace is quite fast. Consider slowing down for better comprehension.');
                          else if (overallWpm < 100) recs.push('🐌 The pace is quite slow. The meeting could potentially be more concise.');
                        }

                        const questions = botAnalytics.meetingAnalytics?.questionCount || 0;
                        if (questions === 0) recs.push('❓ No questions were asked. Encouraging questions can improve engagement.');
                        else if (questions > 10) recs.push('💬 Great engagement! Many questions were asked during the meeting.');

                        if (recs.length === 0) recs.push('ℹ️ No specific recommendations for this meeting.');
                        return recs.map((rec, i) => <div key={i}>{rec}</div>);
                      })()}
                    </div>
                  </div>
                )}

                {(!botAnalytics || !botAnalytics.speakerStats || botAnalytics.speakerStats.length === 0) && (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed text-muted-foreground">
                    No analytics data available yet. Analytics will appear after post-meeting processing.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {botMeeting.meetingUrl && (
            <div className="text-sm text-muted-foreground">
              <a href={botMeeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="underline">
                View original meeting
              </a>
            </div>
          )}

          <EmailRecipientsDialog
            open={isEmailDialogOpen}
            onOpenChange={setIsEmailDialogOpen}
            onSend={handleSendEmail}
            defaultRecipients={attendees}
            isLoading={isSendingEmail || isFetchingAttendees}
          />
        </div>
      </AppShell>
    )
  }

  // Show all meetings list
  return (
    <AppShell title="Transcripts" subtitle="Auto-captured from meetings Onix joins">
      <div className="space-y-6">
        <Tabs defaultValue="bot" className="w-full">
          <TabsList className="w-full h-12">
            <TabsTrigger value="bot" className="text-base flex-1 whitespace-nowrap">Bot Meetings</TabsTrigger>
            <TabsTrigger value="extension" className="text-base flex-1 whitespace-nowrap">Extension Meetings</TabsTrigger>
          </TabsList>

          <TabsContent value="bot" className="space-y-4">
            {botLoading && (
              <div className="text-sm text-muted-foreground">Loading bot meetings...</div>
            )}
            <div className="grid gap-3">
              {botMeetings.map((meeting) => (
                <a key={meeting.meetingId} href={`/transcripts?botId=${meeting.meetingId}`} className="rounded-lg border p-4 hover:bg-muted/40 bg-white transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Bot Meeting {meeting.meetingId.substring(0, 8)}...</div>
                    <div className="text-sm text-muted-foreground">
                      {(() => {
                        const d = new Date((meeting as any).createdAtMs ?? (meeting as any).createdAt);
                        return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', {
                          timeZone: 'Asia/Karachi',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        });
                      })()}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    📝 {meeting.segments?.length || 0} segments •
                    👥 {meeting.segments ? [...new Set(meeting.segments.map(s => s.speaker))].length : 0} speakers
                  </div>
                </a>
              ))}
              {!botLoading && botMeetings.length === 0 && (
                <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
                  <div className="text-muted-foreground">No bot meetings found</div>
                  <div className="text-xs text-muted-foreground mt-1">Join a meeting with the bot to see it here</div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="extension" className="space-y-4">
            {extensionLoading && (
              <div className="text-sm text-muted-foreground">Loading extension meetings...</div>
            )}
            <div className="grid gap-3">
              {extensionMeetings.map((meeting) => (
                <a key={meeting.id} href={`/transcripts?extensionId=${meeting.id}`} className="rounded-lg border p-4 hover:bg-muted/40 bg-white transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{meeting.title || 'Untitled meeting'}</div>
                    <div className="text-sm text-muted-foreground">
                      {meeting.createdAt ? new Date(meeting.createdAt).toLocaleString('en-US', {
                        timeZone: 'Asia/Karachi',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      }) : ''}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Extension</span>
                    <span>•</span>
                    <span>{meeting.autosave ? 'Auto-saved' : 'Manual save'}</span>
                    {meeting.notes && meeting.notes.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{meeting.notes.length} notes</span>
                      </>
                    )}
                  </div>
                </a>
              ))}
              {!extensionLoading && extensionMeetings.length === 0 && (
                <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
                  <div className="text-muted-foreground">No extension meetings found</div>
                  <div className="text-xs text-muted-foreground mt-1">Use the browser extension to record meetings</div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
