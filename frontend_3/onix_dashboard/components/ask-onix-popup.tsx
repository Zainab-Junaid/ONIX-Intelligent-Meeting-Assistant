'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AskOnixPopupProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  meetingTitle: string;
}

export function AskOnixPopup({ isOpen, onClose, meetingId, meetingTitle }: AskOnixPopupProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setError('');
    setAnswer('');
    setLoading(true);
    try {
      const res = await fetch('/api/meeting-bot/live-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, question: q }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        setAnswer(data.answer);
      } else {
        setError(data.error || data.details || 'Request failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setQuestion('');
    setAnswer('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ask Onix – Live Q&A</DialogTitle>
          <DialogDescription>
            Ask questions about this meeting. Answers are based on the current transcript.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Meeting: <strong>{meetingTitle || meetingId}</strong>
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. What's being discussed? What did the manager say about documentation?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              disabled={loading}
            />
            <Button onClick={handleAsk} disabled={loading}>
              {loading ? '...' : 'Ask'}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {answer && (
            <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
              {answer}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
