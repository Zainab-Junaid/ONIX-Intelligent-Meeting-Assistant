'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MeetingUrlPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const SUPPORTED_LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Italian', value: 'it' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Chinese (Simplified)', value: 'zh' },
  { label: 'Russian', value: 'ru' },
  { label: 'Arabic', value: 'ar' },
];

const MeetingUrlPopup: React.FC<MeetingUrlPopupProps> = ({ isOpen, onClose, onSuccess }) => {
  const { authUser } = useAuth();
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startMeetingBot = async () => {
    if (!meetingUrl.trim()) {
      setError('Please enter a meeting URL');
      return;
    }

    if (!authUser) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const token = await authUser.getIdToken();
      
      const response = await fetch('/api/meeting-bot/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          meetingUrl: meetingUrl.trim(),
          meetingTitle: meetingTitle.trim() || 'Bot Meeting',
          language
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start meeting bot');
      }

      // Success - close popup and reset
      setMeetingUrl('');
      setMeetingTitle('');
      setLanguage('en');
      onClose();
      onSuccess?.();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Meeting Bot</DialogTitle>
          <DialogDescription>
            Enter your Google Meet URL and select the caption language.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="meeting-url" className="text-sm font-medium">
              Google Meet URL
            </label>
            <Input
              id="meeting-url"
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="mt-1"
            />
          </div>
          
          <div>
            <label htmlFor="meeting-title" className="text-sm font-medium">
              Meeting Title (Optional)
            </label>
            <Input
              id="meeting-title"
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="My Meeting"
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="meeting-language" className="text-sm font-medium">
              Caption Language
            </label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="meeting-language" className="mt-1">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={startMeetingBot} disabled={loading}>
              {loading ? 'Starting...' : 'Start Bot'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MeetingUrlPopup;
