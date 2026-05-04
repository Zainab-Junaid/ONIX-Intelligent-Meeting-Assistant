"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, ChevronDown, Bot, User, Calendar, Clock, Users, FileText, Zap, MessageCircle } from 'lucide-react';
import { useMeetings } from './hooks/useMeetings';
import { getAIResponse } from './services/aiService';
import { useAuth } from '@/components/auth-provider';

interface ChatbotProps {
  className?: string;
  userId?: string;
}

interface Message {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

export function Chatbot({ className, userId }: ChatbotProps) {
  const { authUser } = useAuth();
  const effectiveUserId = userId || authUser?.uid || 'default_user';
  const { meetings, loading: meetingsLoading, error } = useMeetings(effectiveUserId);
  
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: 'Hello! 👋 I\'m your AI Meeting Assistant. Select a meeting from the dropdown above and ask me anything about it!',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }]);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleMeetingSelect = (meeting: any) => {
    setSelectedMeeting(meeting);
    setShowDropdown(false);
    
    const meetingInfo: Message = {
      role: 'assistant',
      content: `Perfect! I've selected **"${meeting.title}"**\n\n📅 **Date:** ${meeting.date} at ${meeting.time}\n⏱️ **Duration:** ${meeting.duration || 'N/A'}\n👥 **Participants:** ${meeting.participants?.join(', ') || 'N/A'}\n\n${meeting.summary || 'No summary available'}\n\nWhat would you like to know?`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, meetingInfo]);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const aiResponse = await getAIResponse(input, selectedMeeting);
      const assistantMessage: Message = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sampleQuestions = [
    { icon: FileText, text: "Give me a summary", color: "from-blue-500 to-cyan-500" },
    { icon: Zap, text: "What were the key decisions?", color: "from-purple-500 to-pink-500" },
    { icon: Users, text: "Who attended this meeting?", color: "from-green-500 to-emerald-500" },
    { icon: MessageCircle, text: "What are the action items?", color: "from-orange-500 to-red-500" }
  ];

  const handleSampleQuestion = (question: string) => {
    setInput(question);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Meetings</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 ${className || ''}`}>
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-2.5">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-1.5 rounded-lg">
                <Sparkles className="text-white" size={16} />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">AI Chatbot</h1>
                <p className="text-gray-500 text-xs">Your smart assistant</p>
              </div>
            </div>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-blue-400 transition-all"
            >
              <div className="flex items-center gap-2">
                <Calendar className="text-blue-600" size={14} />
                <span className={`text-xs font-medium ${selectedMeeting ? 'text-gray-900' : 'text-gray-500'}`}>
                  {meetingsLoading
                    ? 'Loading meetings...'
                    : selectedMeeting
                    ? selectedMeeting.title
                    : meetings.length > 0
                    ? 'Select a meeting to start'
                    : 'No meetings available'}
                </span>
              </div>
              <ChevronDown 
                className={`text-blue-600 transition-transform ${showDropdown ? 'rotate-180' : ''}`} 
                size={16} 
              />
            </button>

            {showDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                {meetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => handleMeetingSelect(meeting)}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-all duration-150"
                  >
                    <div className="font-semibold text-gray-900 mb-1 text-xs">
                      {meeting.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {meeting.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {meeting.time}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="h-full space-y-3">
          {messages.map((message, idx) => (
            <div key={idx} className="animate-fadeIn">
              <div className={`flex items-start gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center shadow-md ${
                  message.role === 'user' 
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
                    : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                }`}>
                  {message.role === 'user' ? (
                    <User size={16} className="text-white" />
                  ) : (
                    <Bot size={16} className="text-white" />
                  )}
                </div>

                <div className={`flex flex-col flex-1 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-xl px-3 py-2.5 shadow-md max-w-full ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                      : 'bg-white text-gray-800 border border-gray-200'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed text-sm break-words">{message.content}</p>
                  </div>
                  <span className="text-xs text-gray-400 mt-1">{message.timestamp}</span>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="animate-fadeIn flex items-start gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-white rounded-xl px-3 py-2.5 shadow-md border border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="text-xs text-gray-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          {sampleQuestions.map((question, idx) => {
            const IconComponent = question.icon;
            return (
              <button
                key={idx}
                onClick={() => handleSampleQuestion(question.text)}
                className="group bg-white hover:bg-blue-50 rounded-lg p-2 border border-gray-200 hover:border-blue-300 transition-all duration-150"
              >
                <div className="flex items-center gap-1.5">
                  <div className={`p-1 rounded-md bg-gradient-to-br ${question.color}`}>
                    <IconComponent size={12} className="text-white" />
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-left truncate">
                    {question.text}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-2 shadow-lg flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about the meeting..."
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-sm transition-all"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 font-semibold text-sm"
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
