export type MeetingTranscript = {
  meetingId: string;
  userId?: string;
  meetingTitle?: string;
  createdAt: Date;
  segments: Segment[];
};

export type Segment = {
  segmentId: string;
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
  assignedTo?: string;
  dueDate?: Date;
  status?: string;
};
/*
    export type MediaAsset = {
    meetingId: string;
    createdAt: Date;
    type: 'audio' | 'video';
    storagePath: string;
    durationSec: number;
    };*/
