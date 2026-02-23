'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface AskOnixSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingTitle: string;
}

export function AskOnixSheet({ open, onOpenChange, meetingId, meetingTitle }: AskOnixSheetProps) {
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

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

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

    try {
      const res = await fetch('/api/meeting-bot/live-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, question: userMessage.text }),
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col p-0 pb-6">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-indigo-100 text-indigo-600">
               <Sparkles className="size-4" />
            </div>
            Ask Onix
          </SheetTitle>
          <SheetDescription>
            AI Assistant for {meetingTitle ? `"${meetingTitle}"` : 'this meeting'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden relative flex flex-col">
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-4 pb-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 max-w-[85%]",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                  )}
                >
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                    msg.role === 'user' ? "bg-slate-200" : "bg-indigo-100 text-indigo-600"
                  )}>
                    {msg.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
                  </div>
                  <div className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    msg.role === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-white border rounded-tl-none text-slate-800"
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    <span className={cn(
                        "text-[10px] opacity-70 mt-1 block",
                        msg.role === 'user' ? "text-blue-100" : "text-slate-400"
                    )}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex gap-3 mr-auto max-w-[85%]">
                  <div className="size-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="size-4" />
                  </div>
                   <div className="bg-white border rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
                     <Loader2 className="size-4 animate-spin text-indigo-500" />
                     <span className="text-xs text-slate-500">Thinking...</span>
                   </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        </div>

        <div className="px-4 pt-2">
          <div className="relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about the meeting..."
              className="pr-12 py-6 rounded-full shadow-sm border-slate-200 focus-visible:ring-indigo-500"
              disabled={loading}
            />
            <Button 
                size="icon" 
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className={cn(
                    "absolute right-1 top-1 rounded-full size-10 transition-all",
                    input.trim() ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-200 text-slate-400 hover:bg-slate-200"
                )}
            >
              <Send className="size-4" />
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-2">
            Onix answers based on the meeting transcript.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
