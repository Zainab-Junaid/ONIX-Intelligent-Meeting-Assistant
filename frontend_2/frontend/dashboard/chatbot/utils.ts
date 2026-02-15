import type { ChatMessage } from './types';

export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatMessageTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function createUserMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    timestamp: new Date(),
  };
}

export function createAssistantMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    timestamp: new Date(),
  };
}

