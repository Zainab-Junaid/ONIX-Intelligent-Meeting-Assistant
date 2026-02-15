'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';

interface BotMeeting {
  meetingId: string;
  createdAtMs: number;
  userId?: string;
  title?: string;
  meetingUrl?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  totalSpeakers?: number;
  totalDurationSeconds?: number;
  segments: Array<{
    speaker: string;
    text: string;
    start?: number;
    end?: number;
  }>;
}

interface BotSummary {
  meetingId: string;
  summaryText: string;
  generatedAt: string;
  model: string;
}

export const useBotMeetings = () => {
  const { authUser } = useAuth();
  const [meetings, setMeetings] = useState<BotMeeting[]>([]);
  const [summaries, setSummaries] = useState<BotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBotMeetings = async () => {
    if (!authUser?.uid) {
      setMeetings([]);
      setSummaries([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get Firebase token for authentication
      const token = await authUser.getIdToken();

      const [meetingsResponse, summariesResponse] = await Promise.all([
        fetch('/api/meeting-bot/meetings', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }),
        fetch('/api/meeting-bot/summaries', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      ]);

      if (!meetingsResponse.ok || !summariesResponse.ok) {
        const meetingsError = await meetingsResponse.text();
        const summariesError = await summariesResponse.text();
        console.error('API Errors:', { meetingsError, summariesError });
        throw new Error('Failed to fetch bot meeting data');
      }

      const meetingsData = await meetingsResponse.json();
      const summariesData = await summariesResponse.json();
      setMeetings(meetingsData);
      setSummaries(summariesData);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching bot meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBotMeetings();
  }, [authUser?.uid]);

  return { meetings, summaries, loading, error, refetch: fetchBotMeetings };
};
