'use client';

import { useEffect, useRef } from 'react';

interface Segment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
  segmentId?: string;
}

interface SpeakerTranscriptProps {
  segments: Segment[];
  meetingEnded?: boolean;
  isLive?: boolean;
}

// Color palette for speakers - assign colors based on speaker name hash
const SPEAKER_COLORS = [
  { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-300 dark:border-blue-800/50', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-500' },
  { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-300 dark:border-orange-800/50', text: 'text-orange-700 dark:text-orange-400', badge: 'bg-orange-500' },
  { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-300 dark:border-green-800/50', text: 'text-green-700 dark:text-green-400', badge: 'bg-green-500' },
  { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-300 dark:border-purple-800/50', text: 'text-purple-700 dark:text-purple-400', badge: 'bg-purple-500' },
  { bg: 'bg-pink-50 dark:bg-pink-900/20', border: 'border-pink-300 dark:border-pink-800/50', text: 'text-pink-700 dark:text-pink-400', badge: 'bg-pink-500' },
  { bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-300 dark:border-indigo-800/50', text: 'text-indigo-700 dark:text-indigo-400', badge: 'bg-indigo-500' },
  { bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-300 dark:border-teal-800/50', text: 'text-teal-700 dark:text-teal-400', badge: 'bg-teal-500' },
  { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-300 dark:border-amber-800/50', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-500' },
];

// Get color for a speaker sequentially to guarantee uniqueness up to palette size
function getSpeakerColor(speakerName: string, speakerIndex: number): typeof SPEAKER_COLORS[0] {
  return SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length];
}

// Format timestamp (seconds) to MM:SS
function formatTimestamp(seconds?: number): string {
  if (seconds === undefined || seconds === null || seconds < 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Detect if text contains Urdu/Arabic/Persian characters (>30% of non-space chars)
function isUrduText(text: string): boolean {
  const arabicChars = text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g);
  if (!arabicChars) return false;
  const nonSpaceChars = text.replace(/\s/g, '').length;
  return nonSpaceChars > 0 && (arabicChars.length / nonSpaceChars) > 0.3;
}

export function SpeakerTranscript({ segments, meetingEnded, isLive }: SpeakerTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new segments arrive (live mode)
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments.length, isLive]);

  // Sort segments chronologically
  const sortedSegments = [...segments].sort((a, b) => {
    if (a.start !== undefined && b.start !== undefined) return a.start - b.start;
    if (a.start !== undefined) return -1;
    if (b.start !== undefined) return 1;
    return 0;
  });

  // Compute base time: first segment's start, so timestamps begin at ~0:00
  const baseTime = sortedSegments.length > 0 && sortedSegments[0].start !== undefined
    ? sortedSegments[0].start
    : 0;

  // Get unique speakers and assign colors
  const uniqueSpeakers = Array.from(new Set(segments.map(s => s.speaker || 'Unknown Speaker')));
  const speakerColors = uniqueSpeakers.reduce((acc, speaker, index) => {
    acc[speaker] = getSpeakerColor(speaker, index);
    return acc;
  }, {} as Record<string, typeof SPEAKER_COLORS[0]>);

  if (segments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No transcript segments available yet.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sortedSegments.map((segment, index) => {
        const speaker = segment.speaker || 'Unknown Speaker';
        const colors = speakerColors[speaker];
        const prevSegment = index > 0 ? sortedSegments[index - 1] : null;
        const isSameSpeakerAsPrev = prevSegment && (prevSegment.speaker || 'Unknown Speaker') === speaker;
        const urdu = isUrduText(segment.text);
        const relativeStart = segment.start !== undefined ? segment.start - baseTime : undefined;

        return (
          <div
            key={segment.segmentId || index}
            className={`flex gap-3 ${!isSameSpeakerAsPrev ? 'mt-4 first:mt-0' : 'mt-1'}`}
          >
            {/* Avatar/Badge */}
            {!isSameSpeakerAsPrev && (
              <div className="flex-shrink-0">
                <div className={`w-8 h-8 rounded-full ${colors.badge} flex items-center justify-center text-white text-xs font-semibold`}>
                  {speaker.charAt(0).toUpperCase()}
                </div>
              </div>
            )}

            {/* Message bubble */}
            <div className={`flex-1 ${!isSameSpeakerAsPrev ? '' : 'ml-11'}`}>
              {/* Speaker name */}
              {!isSameSpeakerAsPrev && (
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold ${colors.text}`}>
                    {speaker}
                  </span>
                  {relativeStart !== undefined && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatTimestamp(relativeStart)}
                    </span>
                  )}
                </div>
              )}

              {/* Message content */}
              <div className={`rounded-lg px-4 py-2.5 ${colors.bg} ${colors.border} border max-w-[85%]`}>
                <p
                  className={`leading-relaxed text-gray-800 dark:text-gray-200 ${urdu ? 'font-urdu text-sm' : 'text-[0.9375rem]'}`}
                  dir={urdu ? 'rtl' : undefined}
                >
                  {segment.text}
                </p>
                {relativeStart !== undefined && isSameSpeakerAsPrev && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {formatTimestamp(relativeStart)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Auto-scroll anchor */}
      <div ref={bottomRef} />

      {/* Meeting Ended indicator */}
      {meetingEnded && (
        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-300 dark:bg-slate-700" />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 px-3 py-1 rounded-full">
            Meeting has ended
          </span>
          <div className="flex-1 h-px bg-gray-300 dark:bg-slate-700" />
        </div>
      )}
    </div>
  );
}
