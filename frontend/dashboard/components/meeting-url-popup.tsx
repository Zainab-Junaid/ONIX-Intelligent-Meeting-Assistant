'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Google Meet caption language list — extracted directly from DOM
const CAPTION_LANGUAGES = [
  "Afrikaans (South Africa)", "Albanian (Albania)", "Amharic (Ethiopia)",
  "Arabic (Egypt)", "Arabic (Levant)", "Arabic (Maghrebi)",
  "Arabic (Peninsular Gulf)", "Arabic (United Arab Emirates)",
  "Armenian (Armenia)", "Azerbaijani (Azerbaijan)", "Basque (Spain)",
  "Bengali (Bangladesh)", "Bulgarian (Bulgaria)", "Burmese (Myanmar)",
  "Catalan (Spain)", "Chinese, Cantonese (Traditional)",
  "Chinese, Mandarin (Simplified)", "Chinese, Mandarin (Traditional)",
  "Czech (Czech Republic)", "Dutch", "English", "English (Australia)",
  "English (India)", "English (Philippines)", "English (UK)",
  "Estonian (Estonia)", "Filipino (Philippines)", "Finnish (Finland)",
  "French", "French (Canada)", "Galician (Spain)", "Georgian (Georgia)",
  "German", "Greek (Greece)", "Gujarati (India)", "Hebrew (Israel)",
  "Hindi", "Hungarian (Hungary)", "Icelandic (Iceland)",
  "Indonesian (Indonesia)", "Italian", "Japanese", "Javanese (Indonesia)",
  "Kannada (India)", "Kazakh (Kazakhstan)", "Khmer (Cambodia)",
  "Kinyarwanda (Rwanda)", "Korean", "Lao (Laos)", "Latvian (Latvia)",
  "Lithuanian (Lithuania)", "Macedonian (North Macedonia)", "Malay (Malaysia)",
  "Malayalam (India)", "Marathi (India)", "Mongolian (Mongolia)",
  "Nepali (Nepal)", "Northern Sotho (South Africa)", "Norwegian (Norway)",
  "Persian (Iran)", "Polish (Poland)", "Portuguese (Brazil)",
  "Portuguese (Portugal)", "Romanian (Romania)", "Russian",
  "Serbian (Serbia)", "Sesotho (South Africa)", "Sinhala (Sri Lanka)",
  "Slovak (Slovakia)", "Slovenian (Slovenia)", "Spanish (Mexico)",
  "Spanish (Spain)", "Sundanese (Indonesia)", "Swahili",
  "Swati (South Africa)", "Swedish (Sweden)", "Tamil (India)",
  "Telugu (India)", "Thai (Thailand)", "Tshivenda (South Africa)",
  "Tswana (South Africa)", "Turkish (Turkey)", "Ukrainian (Ukraine)",
  "Urdu (Pakistan)", "Uzbek (Uzbekistan)", "Vietnamese (Vietnam)",
  "Xhosa (South Africa)", "Xitsonga (South Africa)", "Zulu (South Africa)",
] as const;

interface MeetingUrlPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MeetingUrlPopup: React.FC<MeetingUrlPopupProps> = ({ isOpen, onClose, onSuccess }) => {
  const { authUser } = useAuth();
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [captionLanguage, setCaptionLanguage] = useState('English');
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
          language: captionLanguage,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start meeting bot');
      }

      // Success - close popup and reset
      setMeetingUrl('');
      setMeetingTitle('');
      setCaptionLanguage('English');
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
            Enter your Google Meet URL to start a bot that will join and capture the meeting.
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
            <label htmlFor="caption-language" className="text-sm font-medium">
              Caption Language
            </label>
            <select
              id="caption-language"
              value={captionLanguage}
              onChange={(e) => setCaptionLanguage(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {CAPTION_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
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
