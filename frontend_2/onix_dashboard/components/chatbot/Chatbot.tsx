"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/components/auth-provider'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Send,
  Sparkles,
  ChevronDown,
  Bot,
  User,
  Calendar,
  Clock,
  FileText,
  Zap,
  Users,
  MessageCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'

// ------ Types ------

interface Message {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  intent?: string
  source?: 'structured' | 'llm'
}

interface BotMeeting {
  meetingId: string
  title?: string
  createdAtMs: number
  status?: string
  totalDurationSeconds?: number
}

// ------ Component ------

export function Chatbot() {
  const { authUser } = useAuth()

  // Meeting state
  const [meetings, setMeetings] = useState<BotMeeting[]>([])
  const [meetingsLoading, setMeetingsLoading] = useState(true)
  const [selectedMeeting, setSelectedMeeting] = useState<BotMeeting | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ------ Fetch Meetings ------

  useEffect(() => {
    if (!authUser) return

    const fetchMeetings = async () => {
      setMeetingsLoading(true)
      try {
        const token = await authUser.getIdToken()
        const res = await fetch('/api/meeting-bot/meetings', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setMeetings(data)
        }
      } catch (err) {
        console.error('Failed to fetch meetings:', err)
      } finally {
        setMeetingsLoading(false)
      }
    }
    fetchMeetings()
  }, [authUser])

  // ------ Welcome message ------

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content:
          "Hello! 👋 I'm your **AI Meeting Assistant**. Select a meeting from the dropdown above and ask me anything about it — summaries, action items, participants, and more!",
        timestamp: now(),
      },
    ])
  }, [])

  // ------ Outside click for dropdown ------

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ------ Auto-scroll ------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ------ Meeting selection ------

  const handleMeetingSelect = (meeting: BotMeeting) => {
    setSelectedMeeting(meeting)
    setShowDropdown(false)

    // Clear previous chat and add selection message
    setMessages([
      {
        role: 'assistant',
        content:
          "Hello! 👋 I'm your **AI Meeting Assistant**. Select a meeting from the dropdown above and ask me anything about it — summaries, action items, participants, and more!",
        timestamp: now(),
      },
      {
        role: 'assistant',
        content: `Great! I've loaded **"${meeting.title || 'Untitled Meeting'}"**. What would you like to know about it?`,
        timestamp: now(),
      },
    ])

    inputRef.current?.focus()
  }

  // ------ Send message ------

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || !selectedMeeting || !authUser) return

    const question = input.trim()
    const userMessage: Message = {
      role: 'user',
      content: question,
      timestamp: now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const token = await authUser.getIdToken()
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          meetingId: selectedMeeting.meetingId,
          question,
        }),
      })

      if (res.status === 429) {
        addAssistantMessage('⏳ You\'re sending too many messages. Please wait a moment and try again.')
        return
      }

      if (!res.ok) {
        addAssistantMessage('Sorry, something went wrong. Please try again.')
        return
      }

      const data = await res.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer,
        timestamp: now(),
        intent: data.intent,
        source: data.source,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (error) {
      addAssistantMessage('Sorry, I couldn\'t connect to the server. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [input, loading, selectedMeeting, authUser])

  const addAssistantMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content, timestamp: now() }])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ------ Sample questions ------

  const sampleQuestions = [
    { icon: FileText, text: 'Give me a summary', gradient: 'from-blue-500 to-cyan-500' },
    { icon: Zap, text: 'What were the key decisions?', gradient: 'from-violet-500 to-purple-500' },
    { icon: Users, text: 'Who attended this meeting?', gradient: 'from-emerald-500 to-green-500' },
    { icon: MessageCircle, text: 'What are the action items?', gradient: 'from-orange-500 to-red-500' },
  ]

  // ------ Render ------

  const canSend = !!selectedMeeting && !!input.trim() && !loading

  return (
    <Card className="flex flex-col h-[calc(100vh-10rem)] rounded-2xl border border-slate-200 shadow-lg overflow-hidden bg-white">
      {/* Header + Meeting Selector */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded-xl shadow-md">
            <Sparkles className="text-white" size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">AI Meeting Chatbot</h2>
            <p className="text-slate-500 text-xs">Ask anything about your meetings</p>
          </div>
        </div>

        {/* Meeting Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-left flex items-center justify-between hover:border-blue-400 transition-all shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Calendar className="text-blue-600" size={14} />
              <span className={`text-sm font-medium ${selectedMeeting ? 'text-slate-900' : 'text-slate-400'}`}>
                {meetingsLoading
                  ? 'Loading meetings...'
                  : selectedMeeting
                  ? selectedMeeting.title || 'Untitled Meeting'
                  : meetings.length > 0
                  ? 'Select a meeting to start chatting'
                  : 'No meetings available'}
              </span>
            </div>
            <ChevronDown
              className={`text-blue-600 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`}
              size={16}
            />
          </button>

          {showDropdown && meetings.length > 0 && (
            <div className="absolute z-50 w-full mt-1.5 bg-white border border-blue-200 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
              {meetings.map((m) => (
                <button
                  key={m.meetingId}
                  onClick={() => handleMeetingSelect(m)}
                  className={`w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-all ${
                    selectedMeeting?.meetingId === m.meetingId ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-semibold text-slate-900 text-sm truncate">
                    {m.title || 'Untitled Meeting'}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {new Date(m.createdAtMs).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(m.createdAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {m.status && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        m.status === 'PROCESSED' ? 'bg-green-100 text-green-700' :
                        m.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {m.status}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gradient-to-b from-slate-50/50 to-white">
        {messages.map((msg, idx) => (
          <div key={idx} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-md ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                    : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                }`}
              >
                {msg.role === 'user' ? (
                  <User size={14} className="text-white" />
                ) : (
                  <Bot size={14} className="text-white" />
                )}
              </div>

              <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-4 py-3 shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed text-sm break-words"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                  {msg.source && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      msg.source === 'llm' ? 'bg-violet-100 text-violet-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {msg.source === 'llm' ? '✨ AI' : '📊 Data'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading bubbles */}
        {loading && (
          <div className="flex items-start gap-2.5 animate-in fade-in duration-300">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
              <Bot size={14} className="text-white" />
            </div>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-slate-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sample Questions */}
      {selectedMeeting && messages.length <= 3 && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            {sampleQuestions.map((q, idx) => {
              const Icon = q.icon
              return (
                <button
                  key={idx}
                  onClick={() => setInput(q.text)}
                  className="group bg-white hover:bg-blue-50 rounded-xl px-3 py-2.5 border border-slate-200 hover:border-blue-300 transition-all duration-150 text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg bg-gradient-to-br ${q.gradient}`}>
                      <Icon size={12} className="text-white" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 truncate">
                      {q.text}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* No meeting selected warning */}
      {!selectedMeeting && !meetingsLoading && meetings.length > 0 && (
        <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-center gap-2 flex-shrink-0">
          <AlertCircle size={14} className="text-amber-600" />
          <span className="text-xs text-amber-700">Select a meeting above to start chatting</span>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-slate-200 px-5 py-3 flex-shrink-0">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !selectedMeeting
                ? 'Select a meeting first...'
                : 'Ask about the meeting...'
            }
            className="flex-1 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-blue-400"
            disabled={loading || !selectedMeeting}
          />
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl px-4 shadow-md disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ------ Helper functions ------

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Simple markdown-to-HTML renderer (bold, lists, headings)
 */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Headings
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-2 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-base mt-3 mb-1">$1</h3>')
    // Numbered lists
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex gap-2 ml-1 my-0.5"><span class="text-slate-400 flex-shrink-0">$1.</span><span>$2</span></div>')
    // Bullet lists
    .replace(/^[-•] (.+)$/gm, '<div class="flex gap-2 ml-1 my-0.5"><span class="text-blue-400 flex-shrink-0">•</span><span>$1</span></div>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}
