'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Loader2, Sparkles, X } from 'lucide-react';
import { OnixBotIcon } from '@/components/icons/onix-bot-icon';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface AskOnixPanelProps {
  onClose: () => void;
  meetingId: string;
  meetingTitle: string;
  transcript?: any[]; // Array of segments
}

export function AskOnixPanel({ onClose, meetingId, meetingTitle, transcript }: AskOnixPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hi! I'm Onix. Ask me anything about "${meetingTitle || 'this meeting'}".`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Auto-focus input when mounted
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Format transcript for API if available
    const formattedTranscript = transcript?.map(s => `${s.speaker}: ${s.text}`).join('\n');

    try {
      const res = await fetch('/api/meeting-bot/live-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            meetingId, 
            question: userMessage.text,
            transcript: formattedTranscript, // Send current transcript context
            meetingTitle
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get answer');
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.answer || "I couldn't generate an answer based on the transcript.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Error: ${error.message || 'Something went wrong.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full shadow-sm">
             <OnixBotIcon />
          </div>
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ask Onix</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
              AI Assistant for {meetingTitle ? `"${meetingTitle}"` : 'meeting'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50/30 dark:bg-slate-900/30">
        <ScrollArea className="flex-1 p-4 h-full" type="always">
          <div className="flex flex-col gap-4 pb-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3 max-w-[90%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "size-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                  msg.role === 'user' ? "bg-slate-200 dark:bg-slate-700" : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                )}>
                  {msg.role === 'user' ? <User className="size-3.5 dark:text-slate-300" /> : <Bot className="size-3.5" />}
                </div>
                <div className={cn(
                  "rounded-2xl px-3 py-2 text-sm shadow-sm",
                  msg.role === 'user' 
                    ? "bg-blue-600 dark:bg-blue-500 text-white rounded-tr-none" 
                    : "bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-none text-slate-800 dark:text-slate-200"
                )}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  <span className={cn(
                      "text-[10px] opacity-70 mt-1 block",
                      msg.role === 'user' ? "text-blue-100" : "text-slate-400 dark:text-slate-500"
                  )}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-3 mr-auto max-w-[90%]">
                <div className="size-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="size-3.5" />
                </div>
                 <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
                   <Loader2 className="size-3.5 animate-spin text-indigo-500 dark:text-indigo-400" />
                   <span className="text-xs text-slate-500 dark:text-slate-400">Thinking...</span>
                 </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="px-3 py-3 bg-white dark:bg-slate-950 border-t dark:border-slate-800">
        <div className="relative">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="pr-10 py-5 text-sm rounded-full shadow-sm border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 focus-visible:ring-indigo-500"
            disabled={loading}
          />
          <Button 
              size="icon" 
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className={cn(
                  "absolute right-1 top-1 rounded-full size-8 transition-all",
                  input.trim() ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
              )}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
