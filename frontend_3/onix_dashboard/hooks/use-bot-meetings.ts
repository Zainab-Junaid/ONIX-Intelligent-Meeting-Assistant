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

      const meetingsText = await meetingsResponse.text();
      const summariesText = await summariesResponse.text();

      if (!meetingsResponse.ok || !summariesResponse.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[useBotMeetings] API returned non-OK:',
            'meetings status:', meetingsResponse.status,
            'summaries status:', summariesResponse.status,
            'meetings body preview:', meetingsText.slice(0, 150),
            'summaries body preview:', summariesText.slice(0, 150)
          );
        }
        setError('Failed to load meeting data. Check that the meeting bot backend is running.');
        setMeetings([]);
        setSummaries([]);
        return;
      }

      let meetingsData: BotMeeting[] = [];
      let summariesData: BotSummary[] = [];
      try {
        meetingsData = JSON.parse(meetingsText) as BotMeeting[];
      } catch {
        if (process.env.NODE_ENV === 'development') {
          console.error('Meetings response was not valid JSON:', meetingsText.slice(0, 200));
        }
        setError('Invalid response from meetings API.');
        return;
      }
      try {
        summariesData = JSON.parse(summariesText) as BotSummary[];
      } catch {
        if (process.env.NODE_ENV === 'development') {
          console.error('Summaries response was not valid JSON:', summariesText.slice(0, 200));
        }
        setError('Invalid response from summaries API.');
        return;
      }

      setMeetings(Array.isArray(meetingsData) ? meetingsData : []);
      setSummaries(Array.isArray(summariesData) ? summariesData : []);
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
