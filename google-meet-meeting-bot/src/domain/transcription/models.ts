export type MeetingTranscript = {
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
  createdAt: Date;
  segments: Segment[];
};

export type Segment = {
  segmentId: string;
  meetingId?: string;  // Optional - used in MongoDB storage
  start: number;
  end: number;
  text: string;
  speaker: string;
};
export type MeetingSummaryInput = {
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
  generatedAt: Date;
  summaryText: string;
  model: "gpt-4-turbo" | string;
  isFallback?: boolean;
};

export type ActionItemInput = {
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
  item: string;
  assignedTo?: string | null;
  dueDate?: Date;
  priority?: 'high' | 'medium' | 'low';
  status?: string;
};

export type KeyTopicsResult = {
  topics: string[];
  keywords: { keyword: string; category: string; relevance: number }[];
};
