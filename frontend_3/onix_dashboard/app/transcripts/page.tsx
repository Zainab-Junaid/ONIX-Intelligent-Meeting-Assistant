"use client"

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/components/auth-provider'
import { AppShell } from "@/components/app-shell"
import { useSearchParams } from 'next/navigation'
import { useBotMeetings } from '@/hooks/use-bot-meetings'
import { useExtensionMeetings } from '@/hooks/use-extension-meetings'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Pencil, Trash2, X, Check, Download, FileText, User, Calendar, Video, Bot, Chrome, CheckSquare, LayoutDashboard, PieChart, Activity, Users, Mail, Loader2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

import jsPDF from 'jspdf'
// @ts-ignore
import autoTable from 'jspdf-autotable'
import { SpeakerTranscript } from '@/components/speaker-transcript'
import { io, Socket } from 'socket.io-client'
import { FloatingAskOnixButton } from '@/components/floating-ask-onix-button'
// import { AskOnixSheet } from '@/components/ask-onix-sheet'
import { AskOnixPanel } from '@/components/ask-onix-panel'
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

// Helper to parse raw transcript into segments based on speaker prefixes
const parseTranscriptToSegments = (text: string) => {
  if (!text) return [];
  const lines = text.split('\n');
  const segments: { speaker: string; text: string; segmentId: string }[] = [];
  let currentSpeaker = '';
  let currentText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Look for "Speaker Name: text" or "Speaker Name : text"
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match && match[1].length < 30) {
      if (currentSpeaker && currentText) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim(), segmentId: `seg_${i}` });
      }
      currentSpeaker = match[1].trim();
      currentText = match[2];
    } else {
      if (currentSpeaker) {
        currentText += '\n' + line;
      } else {
        segments.push({ speaker: 'Speaker', text: line, segmentId: `seg_${i}` });
      }
    }
  }
  if (currentSpeaker && currentText) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim(), segmentId: `seg_end` });
  }
  return segments;
};

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

// Render inline markdown (bold, links) as React nodes for action items and notes
function renderTextWithMarkdownSimple(
  text: string,
  linkClassName?: string,
  _linkBgClassName?: string
): React.ReactNode {
  if (!text || typeof text !== 'string') return text ?? '';
  const parts: React.ReactNode[] = [];
  let key = 0;
  // Split by **bold** and [text](url)
  const boldRegex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={key++} className="font-semibold">{match[1]}</strong>);
    } else {
      const label = match[2];
      const href = match[3];
      parts.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className={linkClassName || 'text-blue-600 underline'}>
          {label}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? <>{parts}</> : text;
}


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

// Helper to render text with basic markdown support (bold/italic) - now just returns clean text for simplicity as per user request
const renderTextWithMarkdown = (text: string, themeHeaderColor: string = 'text-blue-600', themeDotColor: string = 'bg-blue-500') => {
  if (!text) return null;

  const commonHeaders = [
    'Next Steps', 'Important Information', 'Decisions Made',
    'Action Items', 'Executive Summary', 'Key Discussion', 'Key Points',
    'Discussion Points', 'Overview'
  ];

  // Priority 1: Split explicitly by markdown markers that the AI might have joined mid-line
  let processed = text.replace(/([^\n])(##)/g, '$1\nFORCE_NEW_LINE_$2');

  // Priority 2: Safe keyword splitting
  // Only split mid-sentence keywords if they are followed by a colon or dash
  commonHeaders.forEach(header => {
    // Look for header that isn't at the start of a line and is followed by punctuation/new line
    const regex = new RegExp(`([^\\n])(${header})([:\\-\n])`, 'gi');
    processed = processed.replace(regex, '$1\nFORCE_NEW_LINE_$2$3');
  });

  // Clean up remaining markdown junk after splitting decisions are made
  processed = processed.replace(/##/g, '').replace(/\*\*/g, '').replace(/\*/g, '').trim();

  const lines = processed.split('\n').filter(Boolean);

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const isForcedHeader = trimmed.startsWith('FORCE_NEW_LINE_');
        const displayLine = trimmed.replace('FORCE_NEW_LINE_', '');

        // Detect if this line is definitively a header
        const matchedHeader = commonHeaders.find(h => displayLine.toLowerCase().startsWith(h.toLowerCase()));

        // A line is a header if:
        // 1. It was forced by our mid-line detection
        // 2. OR it starts with a keyword AND is short
        // 3. AND it doesn't start with "No specific" (which indicates prose)
        const isHeader = (isForcedHeader || (matchedHeader && displayLine.length < 50)) &&
          !displayLine.toLowerCase().startsWith('no specific');

        if (isHeader) {
          return (
            <div key={i} className="mt-4 first:mt-0 pt-2 border-t border-slate-100/50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`size-1.5 rounded-full ${themeDotColor} shadow-sm`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${themeHeaderColor}`}>
                  {displayLine.replace(/[:\-]/g, '').trim()}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="text-slate-700 leading-relaxed pl-3 border-l border-slate-100">
            {displayLine}
          </div>
        );
      })}
    </div>
  );
};


function parseSummarySections(summaryText: string, filter: string = 'all') {
  if (!summaryText) return null;

  const rawSections: { title: string; content: string; colors: { card: string, header: string, dot: string } }[] = []

  // Ultra-aggressive parsing logic
  // Normalize: ensure every ## or bold section header is on a new line
  let processed = summaryText
    .replace(/([^\n])(##)/g, '$1\n$2')
    .replace(/([^\n])(\*\*)/g, '$1\n$2')
    .replace(/##/g, '') // Remove hashes for cleaner comparison

  const commonDelimiters = [
    'Executive Summary', 'Action Items', 'Next Steps',
    'Important Information', 'Key Discussion', 'Decisions',
    'Key Points', 'Discussion Points', 'Overview'
  ]

  const lines = processed.split('\n').map(l => l.trim()).filter(Boolean)
  let currentTitle = "Summary"
  let currentLines: string[] = []

  const getSectionColor = (title: string) => {
    const lowerTitle = title.toLowerCase()
    if (lowerTitle.includes('executive') || lowerTitle.includes('overview')) return {
      card: 'bg-blue-50 border-blue-400 text-blue-900',
      header: 'text-blue-600',
      dot: 'bg-blue-500'
    }
    if (lowerTitle.includes('discussion') || lowerTitle.includes('key')) return {
      card: 'bg-purple-50 border-purple-400 text-purple-900',
      header: 'text-purple-600',
      dot: 'bg-purple-500'
    }
    if (lowerTitle.includes('decision')) return {
      card: 'bg-green-50 border-green-400 text-green-900',
      header: 'text-green-600',
      dot: 'bg-green-500'
    }
    if (lowerTitle.includes('action') || lowerTitle.includes('todo')) return {
      card: 'bg-blue-50 border-blue-400 text-blue-900',
      header: 'text-blue-600',
      dot: 'bg-blue-500'
    }
    if (lowerTitle.includes('next step') || lowerTitle.includes('follow')) return {
      card: 'bg-indigo-50 border-indigo-400 text-indigo-900',
      header: 'text-indigo-600',
      dot: 'bg-indigo-500'
    }
    if (lowerTitle.includes('important') || lowerTitle.includes('info')) return {
      card: 'bg-yellow-50 border-yellow-400 text-yellow-900',
      header: 'text-amber-600',
      dot: 'bg-amber-500'
    }
    return {
      card: 'bg-gray-50 border-gray-400 text-gray-900',
      header: 'text-gray-600',
      dot: 'bg-gray-500'
    }
  }

  for (const line of lines) {
    const cleanLine = line.replace(/[\*:]/g, '').trim()
    const isHeader = commonDelimiters.some(d => cleanLine.toLowerCase().includes(d.toLowerCase()))

    if (isHeader && cleanLine.length < 40) {
      if (currentLines.length > 0) {
        rawSections.push({
          title: currentTitle,
          content: currentLines.join('\n'),
          colors: getSectionColor(currentTitle)
        })
      }
      currentTitle = cleanLine
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  if (currentLines.length > 0) {
    rawSections.push({
      title: currentTitle,
      content: currentLines.join('\n'),
      colors: getSectionColor(currentTitle)
    })
  }

  // Exclude Action Items from summary – they are shown only in the dedicated block below (extensionMeeting.actionItems)
  const sectionsWithoutActionItems = rawSections.filter(s => {
    const t = s.title.toLowerCase()
    return !t.includes('action') && !t.includes('todo')
  })

  // Filter sections based on selected filter
  const filteredSections = filter === 'all' ? sectionsWithoutActionItems : sectionsWithoutActionItems.filter(section => {
    const lowerTitle = section.title.toLowerCase()
    switch (filter) {
      case 'executive':
        return lowerTitle.includes('executive') || lowerTitle.includes('overview') || lowerTitle.includes('summary')
      case 'keypoints':
        return lowerTitle.includes('key') || lowerTitle.includes('discussion')
      case 'decisions':
        return lowerTitle.includes('decision')
      case 'actions':
        return lowerTitle.includes('action')
      case 'nextsteps':
        return lowerTitle.includes('next') || lowerTitle.includes('follow')
      case 'important':
        return lowerTitle.includes('important') || lowerTitle.includes('info')
      default:
        return true
    }
  })

  return (
    <div className="space-y-6">
      {filteredSections.map((section, index) => (
        <div key={index} className={`p-5 rounded-2xl border-l-4 shadow-sm hover:shadow-md transition-shadow ${section.colors.card}`}>
          {/* Theme-aware Header without Dot */}
          <div className="mb-3">
            <h4 className={`text-xs font-black uppercase tracking-widest ${section.colors.header}`}>
              {section.title}
            </h4>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed font-medium">
            {section.content.split('\n').map((line, lidx) => {
              const cleanLine = line.replace(/^[•\-\*]\s+/, '').replace(/^#{1,3}\s+/, '').trim();
              if (!cleanLine) return null;
              return (
                <div key={lidx} className="flex items-start gap-2 mb-1.5">
                  <div className="flex-1">
                    {renderTextWithMarkdown(cleanLine, section.colors.header, section.colors.dot)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
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
  const [isAskOnixOpen, setIsAskOnixOpen] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [attendees, setAttendees] = useState<string[]>([])
  const [isFetchingAttendees, setIsFetchingAttendees] = useState(false)
  const { toast } = useToast()

  const handleOpenEmailDialog = async () => {
    if (!botId || !authUser) return;
    setIsEmailDialogOpen(true);
    setAttendees([]);

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

      let data: { message?: string; error?: string; details?: string } = {};
      try {
        data = await response.json();
      } catch {
        data = { error: response.statusText || 'Server error' };
      }

      if (response.ok) {
        const successMessage = data.message || `Summary emailed successfully to ${recipients.length} participant${recipients.length === 1 ? '' : 's'}.`;
        toast({
          title: "Success",
          description: successMessage,
        });
        setIsEmailDialogOpen(false);
      } else {
        const errorMessage = data.error || data.details || 'Failed to send summary emails';
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to send summary email. Check your connection and try again.",
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
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [actionItems, setActionItems] = useState<Array<{ id: string; text: string; assignedTo?: string; dueDate?: any }>>([])
  const [botActionItems, setBotActionItems] = useState<any[]>([])
  const [botAnalytics, setBotAnalytics] = useState<any>(null)
  
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'notes' | 'recording' | 'actions' | 'stats'>('transcript')


  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [recordingLoading, setRecordingLoading] = useState(false)
  const [summarySection, setSummarySection] = useState<string>('all') // all, executive, keypoints, decisions, actions, nextsteps, important
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState<string>('')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false)
  const [isSummarySaving, setIsSummarySaving] = useState(false)
  const searchParams = useSearchParams()
  const meetingId = searchParams.get('id')
  const botId = searchParams.get('botId')
  const extensionId = searchParams.get('extensionId') || searchParams.get('extensionID')

  // Bot meetings hook
  const { meetings: botMeetings, loading: botLoading } = useBotMeetings()

  // Extension meetings hook
  const { meetings: extensionMeetings, loading: extensionLoading, refetch: refreshExtensionMeetings } = useExtensionMeetings()

  // Fetch data for Bot Meeting
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
          const r = await fetch(`/api/meeting-bot/transcript/${botId}`, { headers });
          if (r.ok) {
            const data = await r.json();
            if (isMounted) {
              if (data.segments && Array.isArray(data.segments)) {
                console.log('📝 Loaded', data.segments.length, 'segments from storage for bot meeting', botId);
                setLiveSegments(data.segments);
                setSegments(data.segments);
              } else if (Array.isArray(data)) {
                console.log('📝 Loaded', data.length, 'segments from storage (array) for bot meeting', botId);
                setLiveSegments(data);
                setSegments(data);
              }
            }
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

    return () => {
      isMounted = false;
    };
  }, [botId, authUser]);

  // 2. Connect to Socket.IO for Real-Time Updates (Decoupled from Auth)
  useEffect(() => {
    if (!botId) return;

    let isMounted = true;

    // 2. Connect to Socket.IO for Real-Time Updates (Decoupled from Auth)
    // Use relative path to leverage Next.js proxy (avoids CORS)
    console.log('🔌 Connecting to Socket.IO via proxy');

    const socket = io({
      transports: ['polling', 'websocket'], // Allow polling first, then upgrade
      withCredentials: true,
      path: '/socket.io',
    });

    botMeetingSocketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to Socket.IO for bot meeting (via proxy)');
      socket.emit('join_meeting', botId);
    });
    
    socket.on('connect_error', (err) => {
        console.error('❌ Socket connection error:', err);
    });

    socket.on('reconnect', (attempt) => {
        console.log('🔄 Socket reconnected after', attempt, 'attempts');
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
              const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}` : seg.text;
              segmentMap.set(key, seg);
            });
            
            // Merge new segments
            data.segments.forEach(seg => {
               const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}` : seg.text;
               segmentMap.set(key, seg);
            });
            
            return Array.from(segmentMap.values()).sort((a, b) => (a.start || 0) - (b.start || 0));
          });
          
          // Also update main segments state
           setSegments(prev => {
            const segmentMap = new Map<string, any>();
            prev.forEach(seg => {
              const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}` : seg.text;
              segmentMap.set(key, seg);
            });
            data.segments.forEach(seg => {
               const key = seg.start !== undefined ? `${seg.start}-${seg.speaker}` : seg.text;
               segmentMap.set(key, seg);
            });
            return Array.from(segmentMap.values()).sort((a, b) => (a.start || 0) - (b.start || 0));
          });
        }
      }
    });

    socket.on('summary_update', (data: { meetingId: string; summary: string }) => {
        if (data.meetingId === botId && isMounted) {
            console.log('📝 Real-time summary update');
            setSummaryText(data.summary);
        }
    });

    socket.on('action_items_update', (data: { meetingId: string; items: any[] }) => {
        if (data.meetingId === botId && isMounted) {
            console.log('📝 Real-time action items update');
            setBotActionItems(data.items);
        }
    });
    
    socket.on('analytics_update', (data: { meetingId: string; analytics: any }) => {
        if (data.meetingId === botId && isMounted) {
             console.log('📊 Real-time analytics update');
             setBotAnalytics(data.analytics);
        }
    });

    return () => {
      isMounted = false;
      if (botMeetingSocketRef.current) {
        botMeetingSocketRef.current.disconnect();
        botMeetingSocketRef.current = null;
      }
    };
  }, [botId]);

  // Debug logging
  console.log('Transcripts - Bot meetings:', botMeetings);
  console.log('Transcripts - Extension meetings:', extensionMeetings);

  // Handle generating summary
  // Handle saving summary
  const handleSaveSummary = async () => {
    if (!summaryTextareaRef.current || !botId) return
    
    setIsSummarySaving(true)
    try {
        const newSummary = summaryTextareaRef.current.value
        const token = await authUser?.getIdToken()
        const headers: any = { 
            'Content-Type': 'application/json' 
        }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const response = await fetch(`/api/meeting-bot/summary/${botId}`, {
            method: 'POST',
            body: JSON.stringify({ summary: newSummary }),
            headers
        })

        if (response.ok) {
            setSummaryText(newSummary)
            setIsEditingSummary(false)
            toast({ title: 'Success', description: 'Summary updated successfully' })
        } else {
             const err = await response.json()
             toast({ title: 'Error', description: err.error || 'Failed to save summary', variant: 'destructive' })
        }
    } catch (error) {
        console.error(error)
        toast({ title: 'Error', description: 'Failed to save summary', variant: 'destructive' })
    } finally {
        setIsSummarySaving(false)
    }
  }

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
    if (!meetingId || !authUser) return

    let cancelled = false
    const run = async () => {
      const token = await authUser.getIdToken().catch(() => null)
      if (!token || cancelled) return

      const headers = { Authorization: `Bearer ${token}` }

      const meetingsRes = await fetch('/api/meeting-bot/meetings', { headers })
      const meetingsText = await meetingsRes.text()
      if (cancelled) return
      if (meetingsRes.ok) {
        try {
          const rows = JSON.parse(meetingsText) as any[]
          const mtg = Array.isArray(rows) ? rows.find((r: any) => r.meetingId === meetingId) : null
          if (mtg && !cancelled) setSegments(Array.isArray(mtg.segments) ? mtg.segments : [])
        } catch {
          setSegments([])
        }
      } else {
        setSegments([])
      }

      const summariesRes = await fetch('/api/meeting-bot/summaries', { headers })
      const summariesText = await summariesRes.text()
      if (cancelled) return
      if (summariesRes.ok) {
        try {
          const rows = JSON.parse(summariesText) as any[]
          const s = Array.isArray(rows) ? rows.find((r: any) => r.meetingId === meetingId) : null
          if (!cancelled) setSummaryText(s?.summaryText ?? '')
        } catch {
          setSummaryText('')
        }
      } else {
        setSummaryText('')
      }
    }
    run()
    return () => { cancelled = true }
  }, [meetingId, authUser])

  if (isLoading) return <div className="p-6">Loading…</div>
  if (!authUser) return <div className="p-6">Please sign in to view your transcripts.</div>

  // Show specific extension meeting if extensionId provided
  if (extensionId) {
    const extensionMeeting = extensionMeetings.find(m => m.id === extensionId)
    if (extensionLoading) {
      return (
        <AppShell title="Transcript" subtitle="Loading meeting…">
          <div className="flex flex-col items-center justify-center p-12 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
            <p className="text-slate-500 text-sm">Loading meeting transcript…</p>
          </div>
        </AppShell>
      )
    }
    if (!extensionMeeting) return <div className="p-6">Extension meeting not found.</div>

    const hasRecording = !!(extensionMeeting as any).recordingUrl || !!(extensionMeeting as any).recordingStoragePath
    const displayRecordingUrl = recordingUrl || (extensionMeeting as any).recordingUrl || null

    return (
      <AppShell title={extensionMeeting.title} subtitle={`Created ${extensionMeeting.createdAt ? new Date(extensionMeeting.createdAt).toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }) : ''} ${extensionMeeting.sessionCount ? `| Sessions: ${extensionMeeting.sessionCount}` : ''}`}>
        <div className="space-y-6">
          {/* Modern Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'transcript' | 'summary' | 'notes' | 'recording')} className="w-full">
            <TabsList className="w-full max-w-2xl flex flex-wrap">
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
              <TabsTrigger value="recording" className="flex-1">
                <Video className="size-4 mr-2" />
                Recording
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="mt-6">
              <div className="rounded-lg border p-6 bg-white shadow-sm space-y-4">
                <div>
                  <h3 className="font-medium mb-4">Original Transcript</h3>
                  <div className="bg-gray-50 rounded-xl border p-4 max-h-[600px] overflow-y-auto shadow-inner">
                    {extensionMeeting.transcript ? (
                      <SpeakerTranscript segments={parseTranscriptToSegments(extensionMeeting.transcript)} />
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-4">No transcript available.</div>
                    )}
                  </div>
                </div>

                {extensionMeeting.translatedTranscript && (
                  <div className="mt-6 pt-6 border-t">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <span>🇬🇧</span> Translated Transcript (English)
                    </h3>
                    <div className="bg-gray-50 rounded-xl border p-4 max-h-[600px] overflow-y-auto shadow-inner">
                      <SpeakerTranscript segments={parseTranscriptToSegments(extensionMeeting.translatedTranscript)} />
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
                      <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b">
                        <button
                          onClick={() => setSummarySection('all')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${summarySection === 'all'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          All Sections
                        </button>
                        <button
                          onClick={() => setSummarySection('executive')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${summarySection === 'executive'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                        >
                          Executive Summary
                        </button>
                        <button
                          onClick={() => setSummarySection('keypoints')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${summarySection === 'keypoints'
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                            }`}
                        >
                          Key Points
                        </button>
                        <button
                          onClick={() => setSummarySection('decisions')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${summarySection === 'decisions'
                            ? 'bg-green-600 text-white shadow-md'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                            }`}
                        >
                          Decisions
                        </button>
                        <button
                          onClick={() => setSummarySection('actions')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${summarySection === 'actions'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                        >
                          Action Items
                        </button>
                        <button
                          onClick={() => setSummarySection('nextsteps')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${summarySection === 'nextsteps'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                        >
                          Next Steps
                        </button>
                        <button
                          onClick={() => setSummarySection('important')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${summarySection === 'important'
                            ? 'bg-amber-600 text-white shadow-md'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                        >
                          Important Info
                        </button>
                      </div>

                      <div className="text-sm space-y-3">
                        {parseSummarySections(extensionMeeting.summary.text, summarySection)}
                      </div>
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
                    <div className="mb-6">
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

            <TabsContent value="recording" className="mt-6">
              <div className="space-y-6">
                {/* Recording video on top */}
                <div className="rounded-lg border p-4 bg-white shadow-sm">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Video className="size-4" /> Meeting Recording
                  </h3>
                  {recordingLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">Loading recording…</div>
                  ) : displayRecordingUrl ? (
                    <video
                      src={displayRecordingUrl}
                      controls
                      className="w-full max-w-3xl rounded-lg border bg-black"
                      playsInline
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-slate-50/50">
                      <Video className="h-12 w-12 mb-3 opacity-30" />
                      <p className="font-medium text-slate-600">No recording for this meeting</p>
                      <p className="text-sm mt-1 max-w-sm text-center">
                        Next time, check &quot;Record meeting (tab + audio)&quot; in the extension when you start capture to save a video here.
                      </p>
                    </div>
                  )}
                </div>
                {/* Transcript, Summary, Notes in one row when we have recording */}
                {displayRecordingUrl && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border p-4 bg-white shadow-sm">
                      <h4 className="font-medium mb-2 text-sm text-blue-600">Transcript</h4>
                      <div className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto border-l-2 border-gray-200 pl-3">
                        {extensionMeeting.transcript ? extensionMeeting.transcript.slice(0, 800) + (extensionMeeting.transcript.length > 800 ? '…' : '') : 'No transcript.'}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 bg-white shadow-sm">
                      <h4 className="font-medium mb-2 text-sm text-purple-600">Summary</h4>
                      <div className="text-xs max-h-48 overflow-y-auto line-clamp-6">
                        {extensionMeeting.summary?.text ? extensionMeeting.summary.text.slice(0, 500) + (extensionMeeting.summary.text.length > 500 ? '…' : '') : 'No summary yet.'}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 bg-white shadow-sm">
                      <h4 className="font-medium mb-2 text-sm text-amber-600">Notes</h4>
                      <div className="text-xs max-h-48 overflow-y-auto space-y-2">
                        {extensionMeeting.notes && extensionMeeting.notes.length > 0
                          ? extensionMeeting.notes.slice(0, 5).map((n: any, i: number) => (
                              <div key={n.id || i} className="border-l-2 border-amber-200 pl-2">
                                {n.text ? n.text.slice(0, 120) + (n.text.length > 120 ? '…' : '') : '—'}
                              </div>
                            ))
                          : 'No notes yet.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-6">
              <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Meeting Notes & Insights</h3>
                    <p className="text-sm text-slate-500 mt-1">AI-generated notes from your lecture transcript</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!authUser || !extensionMeeting.transcript) return;
                        setIsGeneratingNotes(true);
                        try {
                          const token = await authUser.getIdToken();
                          const res = await fetch('/api/extension-meetings/generate-notes', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({
                              meetingId: extensionMeeting.id,
                              transcript: extensionMeeting.transcript,
                              timestamp: new Date().toISOString(),
                              previousNotes: extensionMeeting.notes?.slice(-5) || []
                            })
                          });
                          if (res.ok) {
                            await refreshExtensionMeetings();
                          }
                        } catch(e) { console.error('Failed to generate notes:', e); }
                        finally { setIsGeneratingNotes(false); }
                      }}
                      disabled={isGeneratingNotes || !extensionMeeting.transcript}
                      className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {isGeneratingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>🤖</span>}
                      {isGeneratingNotes ? 'Generating...' : 'Generate Notes from Transcript'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleDownloadPDF(extensionMeeting)}
                      disabled={!extensionMeeting.notes || extensionMeeting.notes.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      Export PDF
                    </Button>
                  </div>
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

  // Show specific bot meeting if botId provided
  if (botId) {
    const botMeeting = botMeetings.find(m => m.meetingId === botId)
    if (!botMeeting && !botLoading) return <div className="p-6">Bot meeting not found.</div>
    if (botLoading && !botMeeting) return <div className="p-6">Loading meeting...</div>

    return (
      <AppShell title={`${botMeeting?.title || `Bot Meeting`}`} subtitle={`Created ${(() => {
        const d = new Date((botMeeting as any)?.createdAtMs ?? (botMeeting as any)?.createdAt);
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

        {/* Back button or breadcrumb could go here */}
        
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full space-y-4">
          <TabsList className="w-full flex flex-wrap h-auto bg-slate-100/80 p-1 gap-2 border-b border-white/20">
            <TabsTrigger value="transcript" className="flex-1 min-w-[100px] gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <FileText className="size-4" />
              Transcript
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex-1 min-w-[100px] gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <FileText className="size-4" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex-1 min-w-[100px] gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <CheckSquare className="size-4" />
              Action Items
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex-1 min-w-[140px] gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <PieChart className="size-4" />
              Participants & Analytics
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-6 items-start relative group/layout">
            <div className="flex-1 space-y-4 min-w-0 pr-2">

            <TabsContent value="transcript" className="mt-0">
              <div className="rounded-lg border bg-white shadow-sm h-[calc(100vh-14rem)] flex flex-col overflow-hidden sticky top-24 self-start">
                <div className="p-4 border-b flex items-center justify-between shrink-0 bg-white z-10">
                  <h3 className="font-medium flex items-center">
                    Speaker Transcript
                    {(() => {
                      const status = (botMeeting as any)?.status?.toLowerCase?.();
                      const isLiveMeeting = status === 'live' || status === 'bot_launched';
                      if (isLiveMeeting) {
                        return <span className="text-xs font-normal text-green-600 ml-2 animate-pulse flex items-center gap-1"><span className="size-2 rounded-full bg-green-500"/> Live Updates</span>;
                      }
                      if (segments.length > 0 || liveSegments.length > 0) {
                        return <span className="text-xs font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-0.5 rounded-full">Ended</span>;
                      }
                      return null;
                    })()}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar scroll-smooth">
                  <SpeakerTranscript
                    segments={liveSegments.length > 0 ? liveSegments : segments}
                    isLive={((botMeeting as any)?.status?.toLowerCase?.() === 'live' || (botMeeting as any)?.status?.toLowerCase?.() === 'bot_launched')}
                    meetingEnded={((botMeeting as any)?.status?.toLowerCase?.() !== 'live' && (botMeeting as any)?.status?.toLowerCase?.() !== 'bot_launched') && (segments.length > 0 || liveSegments.length > 0)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="mt-0">
              <div className="rounded-lg border p-6 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-medium flex items-center gap-2"><Bot className="size-4 text-purple-500"/> AI Summary</h3>
                  <div className="flex items-center gap-2">
                    {isEditingSummary ? (
                        <>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setIsEditingSummary(false)}
                            >
                                Cancel
                            </Button>
                            <Button 
                                size="sm" 
                                onClick={handleSaveSummary}
                                disabled={isSummarySaving}
                            >
                                {isSummarySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </>
                    ) : (
                        <>
                             <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsEditingSummary(true)}
                                disabled={!summaryText}
                                className="hidden md:flex"
                            >
                                <Edit2 className="size-3 mr-2" />
                                Edit
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                disabled={isSendingEmail || !summaryText}
                                onClick={handleOpenEmailDialog}
                            >
                                {isSendingEmail ? <Loader2 className="size-3 animate-spin" /> : <Mail className="size-3" />}
                                Send Email
                            </Button>
                        </>
                    )}
                  </div>
                </div>

                {isEditingSummary ? (
                    <div className="space-y-0">
                         <textarea
                            ref={summaryTextareaRef}
                            defaultValue={summaryText}
                            className="w-full min-h-[500px] p-4 text-sm leading-relaxed border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y font-sans"
                         />
                         <p className="text-xs text-muted-foreground mt-2 text-right">Markdown supported</p>
                    </div>
                ) : (
                    summaryText ? (
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
                            <div className="space-y-8">
                              {sections
                                .filter(sec => summarySection === 'all' || sec.title === summarySection)
                                .map((sec, idx) => (
                                  <div key={idx} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                    <h4 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <div className="size-1.5 rounded-full bg-blue-500" />
                                        {sec.title}
                                    </h4>
                                    {renderSummaryContent(sec.content)}
                                  </div>
                                ))}
                            </div>
                          </>
                        );
                      })()}
                    </>
                ) : (
                  <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed text-muted-foreground">
                    <Loader2 className="size-8 animate-spin mx-auto mb-3 opacity-20" />
                    <p>No summary available yet.</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="actions" className="mt-0">
              <div className="rounded-lg border p-6 bg-white shadow-sm">
                <h3 className="font-medium mb-6 flex items-center gap-2"><CheckSquare className="size-4 text-green-500"/> Action Items</h3>
                {botActionItems && botActionItems.length > 0 ? (
                  <div className="grid gap-3">
                    {botActionItems.map((item: any, index: number) => {
                      const text = typeof item === 'string' ? item : item.item || item.text || 'No description';
                      const priority = item.priority || 'medium';
                      const assignedTo = item.assignedTo;
                      return (
                        <div key={item.id || index} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all bg-white group">
                          <div className={`mt-1.5 size-2.5 rounded-full flex-shrink-0 ${priority === 'high' ? 'bg-red-500 shadow-red-200 shadow-lg' :
                            priority === 'low' ? 'bg-slate-400' :
                              'bg-amber-500 shadow-amber-200 shadow-lg'
                            }`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 leading-relaxed">{text}</div>
                            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3">
                              {assignedTo && (
                                <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md text-slate-600 font-medium">
                                    <User className="size-3"/> {assignedTo}
                                </span>
                              )}
                              {priority && (
                                <span className={`uppercase tracking-wider font-bold text-[10px] px-1.5 py-0.5 rounded ${priority === 'high' ? 'bg-red-50 text-red-700' :
                                  priority === 'low' ? 'bg-slate-50 text-slate-600' :
                                    'bg-amber-50 text-amber-700'
                                  }`}>
                                  {priority} Priority
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed text-muted-foreground">
                    <CheckSquare className="size-8 mx-auto mb-3 opacity-20" />
                    <p>No action items found.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="stats" className="mt-0">
              <div className="space-y-6">
                {/* Overview Stats Grid */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Overall Stats */}
                  <div className="rounded-lg border p-6 bg-white shadow-sm">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <Activity className="size-4 text-blue-500" /> Overview
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider font-bold mb-1">Duration</div>
                        <div className="text-2xl font-bold text-slate-800">
                          {botAnalytics?.meetingAnalytics?.totalDurationSeconds
                            ? `${Math.floor(botAnalytics.meetingAnalytics.totalDurationSeconds / 60)}m ${botAnalytics.meetingAnalytics.totalDurationSeconds % 60}s`
                            : '0m'}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider font-bold mb-1">Speakers</div>
                        <div className="text-2xl font-bold text-slate-800">
                          {botAnalytics?.meetingAnalytics?.totalSpeakers || 0}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider font-bold mb-1">Words</div>
                        <div className="text-2xl font-bold text-slate-800">
                          {botAnalytics?.meetingAnalytics?.totalWords || 0}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider font-bold mb-1">Questions</div>
                        <div className="text-2xl font-bold text-slate-800">
                          {botAnalytics?.meetingAnalytics?.questionCount || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Speaker Breakdown */}
                  <div className="rounded-lg border p-6 bg-white shadow-sm">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <Users className="size-4 text-indigo-500" /> Speaker Breakdown
                    </h3>
                    <div className="space-y-4">
                      {botAnalytics?.speakerStats?.map((speaker: any, i: number) => (
                        <div key={i} className="flex items-center gap-4">
                          <div className="size-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase shadow-sm border border-white">
                            {(speaker.speakerLabel || speaker.speaker || '?').substring(0, 1)}
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between mb-1.5">
                              <span className="text-sm font-medium text-slate-800">{speaker.speakerLabel || speaker.speaker || 'Unknown'}</span>
                              <span className="text-xs text-muted-foreground font-mono">
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
                        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">No speaker data available</div>
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
                        <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-100 hover:bg-blue-100 transition-colors cursor-default">
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
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                      <div className="text-purple-600 text-[10px] uppercase tracking-wider font-bold mb-1">Questions Asked</div>
                      <div className="text-2xl font-bold text-purple-900">{botAnalytics?.meetingAnalytics?.questionCount || 0}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="text-blue-600 text-[10px] uppercase tracking-wider font-bold mb-1">Total Turns</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {botAnalytics?.speakerStats?.reduce((sum: number, s: any) => sum + (s.turnCount || 0), 0) || 0}
                      </div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                      <div className="text-green-600 text-[10px] uppercase tracking-wider font-bold mb-1">Words/Min</div>
                      <div className="text-2xl font-bold text-green-900">
                        {botAnalytics?.meetingAnalytics?.totalDurationSeconds && botAnalytics?.meetingAnalytics?.totalWords
                          ? Math.round(botAnalytics.meetingAnalytics.totalWords / (botAnalytics.meetingAnalytics.totalDurationSeconds / 60))
                          : 0}
                      </div>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="text-amber-600 text-[10px] uppercase tracking-wider font-bold mb-1">Balance Score</div>
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
                    <h3 className="font-medium mb-6 flex items-center gap-2">
                      <Users className="size-4" /> Speaker Participation
                    </h3>
                    <div className="h-12 flex rounded-xl overflow-hidden mb-6 shadow-inner bg-slate-100">
                      {botAnalytics.speakerStats.map((speaker: any, i: number) => {
                        const totalTime = botAnalytics.speakerStats.reduce((s: number, sp: any) => s + (sp.speakingTimeSeconds || 0), 0);
                        const pct = totalTime > 0 ? ((speaker.speakingTimeSeconds || 0) / totalTime) * 100 : 0;
                        const colors = ['bg-blue-500', 'bg-orange-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-amber-500', 'bg-indigo-500'];
                        return (
                          <div
                            key={i}
                            className={`${colors[i % colors.length]} transition-all flex items-center justify-center text-white text-xs font-bold`}
                            style={{ width: `${pct}%` }}
                            title={`${speaker.speakerLabel || speaker.speaker}: ${Math.round(pct)}%`}
                          >
                             {pct > 5 && `${Math.round(pct)}%`}
                          </div>
                        );
                      })}
                    </div>
                   
                    {/* Detailed Table */}
                    <div className="mt-6 overflow-hidden border rounded-xl">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="text-left py-3 px-4 font-bold text-xs uppercase tracking-wider">Speaker</th>
                            <th className="text-right py-3 px-4 font-bold text-xs uppercase tracking-wider">Time</th>
                            <th className="text-right py-3 px-4 font-bold text-xs uppercase tracking-wider">Words</th>
                            <th className="text-right py-3 px-4 font-bold text-xs uppercase tracking-wider">Turns</th>
                            <th className="text-right py-3 px-4 font-bold text-xs uppercase tracking-wider">questions</th>
                            <th className="text-right py-3 px-4 font-bold text-xs uppercase tracking-wider">WPM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {botAnalytics.speakerStats.map((speaker: any, i: number) => {
                            const mins = Math.floor((speaker.speakingTimeSeconds || 0) / 60);
                            const secs = Math.floor((speaker.speakingTimeSeconds || 0) % 60);
                            const wpm = speaker.speakingTimeSeconds > 0
                              ? Math.round((speaker.wordCount || 0) / (speaker.speakingTimeSeconds / 60))
                              : 0;
                            return (
                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-4 font-medium text-slate-800">{speaker.speakerLabel || speaker.speaker || 'Unknown'}</td>
                                <td className="text-right py-3 px-4 text-slate-600 font-mono text-xs">{mins}m {secs}s</td>
                                <td className="text-right py-3 px-4 text-slate-600 font-mono text-xs">{(speaker.wordCount || 0).toLocaleString()}</td>
                                <td className="text-right py-3 px-4 text-slate-600 font-mono text-xs">{speaker.turnCount || 0}</td>
                                <td className="text-right py-3 px-4">
                                  <span className={(speaker.questionCount || 0) > 0 ? 'inline-flex items-center justify-center min-w-[1.5rem] h-6 bg-blue-100 text-blue-700 rounded-full px-2 text-xs font-bold' : 'text-slate-400'}>
                                    {speaker.questionCount || 0}
                                  </span>
                                </td>
                                <td className="text-right py-3 px-4 text-slate-600 font-mono text-xs">{wpm}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>

           {isAskOnixOpen && (
             <div className="w-[380px] flex-shrink-0 sticky top-24 self-start h-[calc(100vh-14rem)] flex flex-col bg-white border rounded-xl shadow-sm animate-in slide-in-from-right-5 duration-300 overflow-hidden mt-0">
                <AskOnixPanel 
                  onClose={() => setIsAskOnixOpen(false)}
                  meetingId={botId || ''}
                  meetingTitle={botMeeting?.title || 'Meeting'}
                  transcript={liveSegments.length > 0 ? liveSegments : segments}
                />
             </div>
           )}
        </div>
      </Tabs>

        <EmailRecipientsDialog
          open={isEmailDialogOpen}
          onOpenChange={setIsEmailDialogOpen}
          onSend={handleSendEmail}
          defaultRecipients={attendees}
          isLoading={isSendingEmail || isFetchingAttendees}
        />

        {!isAskOnixOpen && <FloatingAskOnixButton onClick={() => setIsAskOnixOpen(true)} />}
      </AppShell>
    )
  }

  if (meetingId) {
    // This is for legacy meetings - we'll show a message that they're not supported
    return <div className="p-6">Legacy meeting format not supported. Please use extension or bot meetings.</div>
  }



  // Show all meetings list
  return (
    <AppShell title="Transcripts" subtitle="Auto-captured from meetings Onix joins">
      <div className="space-y-6">
        <Tabs defaultValue="bot" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bot" className="text-base gap-2">
              <Bot className="size-4" />
              Bot Meetings
            </TabsTrigger>
            <TabsTrigger value="extension" className="text-base gap-2">
              <Chrome className="size-4" />
              Extension Meetings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extension" className="space-y-4">
            {/* Extension Meetings */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Extension Meetings</h3>
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
                  <div className="text-center py-8 bg-muted/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">No extension meetings found</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bot" className="space-y-4">
            {/* Bot Meetings */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Bot Meetings</h3>
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
                  <div className="text-sm text-muted-foreground">No bot meetings yet.</div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
