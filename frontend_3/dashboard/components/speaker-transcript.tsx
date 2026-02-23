'use client';

interface Segment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
}

interface SpeakerTranscriptProps {
  segments: Segment[];
}

// Color palette for speakers - assign colors based on speaker name hash
const SPEAKER_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-500' },
  { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-500' },
  { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', badge: 'bg-green-500' },
  { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', badge: 'bg-purple-500' },
  { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700', badge: 'bg-pink-500' },
  { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700', badge: 'bg-indigo-500' },
  { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700', badge: 'bg-teal-500' },
  { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', badge: 'bg-amber-500' },
];

// Get color for a speaker based on their name
function getSpeakerColor(speakerName: string, speakerIndex: number): typeof SPEAKER_COLORS[0] {
  // Use a simple hash of the speaker name to consistently assign colors
  let hash = 0;
  for (let i = 0; i < speakerName.length; i++) {
    hash = speakerName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[colorIndex];
}

// Format timestamp (seconds) to MM:SS
function formatTimestamp(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SpeakerTranscript({ segments }: SpeakerTranscriptProps) {
  // Sort segments chronologically by start time (or by array index if no timestamp)
  const sortedSegments = [...segments].sort((a, b) => {
    // If both have start times, sort by start time
    if (a.start !== undefined && b.start !== undefined) {
      return a.start - b.start;
    }
    // If only one has a start time, prioritize it
    if (a.start !== undefined) return -1;
    if (b.start !== undefined) return 1;
    // If neither has a start time, maintain original order
    return 0;
  });

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
        
        return (
          <div
            key={index}
            className={`flex gap-3 ${!isSameSpeakerAsPrev ? 'mt-4 first:mt-0' : 'mt-1'}`}
          >
            {/* Avatar/Badge - only show if different speaker from previous */}
            {!isSameSpeakerAsPrev && (
              <div className="flex-shrink-0">
                <div className={`w-8 h-8 rounded-full ${colors.badge} flex items-center justify-center text-white text-xs font-semibold`}>
                  {speaker.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            
            {/* Message bubble */}
            <div className={`flex-1 ${!isSameSpeakerAsPrev ? '' : 'ml-11'}`}>
              {/* Speaker name - only show if different speaker from previous */}
              {!isSameSpeakerAsPrev && (
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold ${colors.text}`}>
                    {speaker}
                  </span>
                  {segment.start !== undefined && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatTimestamp(segment.start)}
                    </span>
                  )}
                </div>
              )}
              
              {/* Message content */}
              <div className={`rounded-lg px-4 py-2.5 ${colors.bg} ${colors.border} border max-w-[85%]`}>
                <p className="text-sm leading-relaxed text-gray-800">
                  {segment.text}
                </p>
                {segment.start !== undefined && segment.end !== undefined && isSameSpeakerAsPrev && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {formatTimestamp(segment.start)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


