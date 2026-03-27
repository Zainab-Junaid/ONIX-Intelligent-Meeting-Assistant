'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';

interface ExtensionMeeting {
  id: string;
  title: string;
  transcript: string;
  createdAt: Date;
  duration?: string;
  meetingURL?: string;
  autosave?: boolean;
  translatedTranscript?: string;
  summary?: {
    text: string;
    generatedAt?: any;
  } | null;
  actionItems?: Array<{
    text?: string;
    assignedTo?: string;
    dueDate?: any;
  } | string>;
  notes?: Array<{
    id: string;
    timestamp?: any;
    createdAt?: any;
    text?: string;
    screenshotUrl?: string;
    screenshotThumbnail?: string;
  }>;
  sessionCount?: number;
  recordingUrl?: string;
  recordingStoragePath?: string;
  source: 'extension';
}

export const useExtensionMeetings = () => {
  const { authUser } = useAuth();
  const [meetings, setMeetings] = useState<ExtensionMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExtensionMeetings = async () => {
    if (!authUser?.uid) {
      setMeetings([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = await authUser.getIdToken();

      const response = await fetch(`/api/extension-meetings?userId=${authUser.uid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch extension meetings');
      }

      const meetingsData = await response.json();
      setMeetings(meetingsData);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching extension meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExtensionMeetings();
  }, [authUser?.uid]);

  return {
    meetings,
    loading,
    error,
    refetch: fetchExtensionMeetings
  };
};

