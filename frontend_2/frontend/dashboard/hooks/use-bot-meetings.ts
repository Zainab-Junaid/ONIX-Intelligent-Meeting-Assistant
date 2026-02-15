"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";

interface BotMeeting {
  meetingId: string;
  createdAtMs: number;
  userId?: string;
  title?: string;
  meetingUrl?: string;
  status?: string;
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

  const fetchBotMeetings = useCallback(async () => {
    if (!authUser?.uid) return; // ⛔ wait for auth

    setLoading(true);
    setError(null);

    try {
      let meetingsResponse, summariesResponse;
      let meetingsErrorText = "No error details";
      let summariesErrorText = "No error details";

      try {
        meetingsResponse = await fetch("/api/meeting-bot/meetings", {
          credentials: "include",
        });
      } catch (fetchErr: any) {
        console.error("Meetings API fetch error:", fetchErr.message);
        throw new Error(`Failed to fetch meetings: ${fetchErr.message}`);
      }

      try {
        summariesResponse = await fetch("/api/meeting-bot/summaries", {
          credentials: "include",
        });
      } catch (fetchErr: any) {
        console.error("Summaries API fetch error:", fetchErr.message);
        throw new Error(`Failed to fetch summaries: ${fetchErr.message}`);
      }

      if (!meetingsResponse.ok || !summariesResponse.ok) {
        try {
          meetingsErrorText = await meetingsResponse.text();
        } catch (e) {
          meetingsErrorText = "Could not read response body";
        }

        try {
          summariesErrorText = await summariesResponse.text();
        } catch (e) {
          summariesErrorText = "Could not read response body";
        }

        console.error(
          `Meetings API error: status=${meetingsResponse.status}, statusText='${meetingsResponse.statusText}', url='${meetingsResponse.url}', body='${meetingsErrorText}'`
        );

        console.error(
          `Summaries API error: status=${summariesResponse.status}, statusText='${summariesResponse.statusText}', url='${summariesResponse.url}', body='${summariesErrorText}'`
        ); 

        throw new Error(
          `Failed to fetch bot meeting data: Meetings(${meetingsResponse.status}), Summaries(${summariesResponse.status})`
        );
      }

      const meetingsData = await meetingsResponse.json();
      const summariesData = await summariesResponse.json();

      setMeetings(meetingsData);
      setSummaries(summariesData);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [authUser?.uid]);

  useEffect(() => {
    fetchBotMeetings();
  }, [fetchBotMeetings]);

  return {
    meetings,
    summaries,
    loading,
    error,
    refetch: fetchBotMeetings,
  };
};
