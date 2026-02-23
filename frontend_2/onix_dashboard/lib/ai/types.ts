/**
 * AI Chatbot Types
 */

export interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: string;
}

export interface MeetingContext {
  meetingId: string;
  title: string;
  duration: number | null;
  participants: string[];
  summary: string | null;
  actionItems: string[];
  decisions: string[];
  transcript: TranscriptSegment[];
}

export interface ChatRequest {
  meetingId: string;
  question: string;
}

export interface ChatResponse {
  answer: string;
  intent: string;
  source: 'structured' | 'llm';
}
