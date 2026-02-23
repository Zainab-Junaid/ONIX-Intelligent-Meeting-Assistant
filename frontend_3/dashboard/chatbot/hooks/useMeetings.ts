"use client"

import { useState, useEffect } from 'react';
import { getDatabase, onValue, ref, off } from 'firebase/database';
import { useAuth } from '@/components/auth-provider';

export interface Meeting {
  id: string;
  meetingId?: string;
  title: string;
  date: string;
  time: string;
  duration?: string;
  participants?: string[];
  summary?: string;
  transcript?: string;
  keyPoints?: string[];
  actionItems?: string[];
  createdAt?: string | Date;
}

export const useMeetings = (userId?: string) => {
  const { authUser } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }

    const db = getDatabase();
    // If userId is provided, scope to that node; otherwise use uid
    const targetUserId = userId || authUser.uid;
    const meetingsRef = ref(db, targetUserId ? `meetings/${targetUserId}` : 'meetings');

    setLoading(true);
    const unsubscribe = onValue(meetingsRef, (snapshot) => {
      try {
        const data = snapshot.val();
        if (!data) {
          setMeetings([]);
          setError(null);
          setLoading(false);
          return;
        }

        const parsed: Meeting[] = Object.entries<any>(data).map(([id, meeting]) => {
          const createdAt = meeting.createdAt
            ? new Date(meeting.createdAt)
            : new Date();

          const dateStr = createdAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          const timeStr = createdAt.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          });

          const transcript = Array.isArray(meeting.transcript)
            ? meeting.transcript.join('\n')
            : meeting.transcript || '';

          const participants = Array.isArray(meeting.participants)
            ? meeting.participants
            : meeting.participants
            ? Object.values(meeting.participants)
            : [];

          return {
            id: meeting.meetingId || meeting.id || id,
            meetingId: meeting.meetingId || meeting.id || id,
            title: meeting.title || meeting.meetingTitle || 'Untitled Meeting',
            date: meeting.date || dateStr,
            time: meeting.time || timeStr,
            duration: meeting.duration || '',
            participants,
            summary: meeting.summary || meeting.summaryText || '',
            transcript,
            keyPoints: meeting.keyPoints || [],
            actionItems: meeting.actionItems || [],
            createdAt: meeting.createdAt,
          };
        });

        // Sort newest first by createdAt if available
        parsed.sort((a, b) => {
          const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bd - ad;
        });

        setMeetings(parsed);
        setError(null);
      } catch (err: any) {
        console.error('Error parsing meetings:', err);
        setError(err.message || 'Failed to load meetings');
        setMeetings([]);
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error('Error fetching meetings:', err);
      setError(err.message || 'Failed to load meetings');
      setMeetings([]);
      setLoading(false);
    });

    return () => {
      off(meetingsRef);
      unsubscribe();
    };
  }, [authUser, userId]);

  return { meetings, loading, error };
};
