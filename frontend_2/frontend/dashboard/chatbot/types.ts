export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatbotResponse {
  message: string;
  sources?: {
    meetingId?: string;
    meetingTitle?: string;
    type: 'transcript' | 'summary' | 'general';
  }[];
}

