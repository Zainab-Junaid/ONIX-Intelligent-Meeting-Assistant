// Main exports from the chatbot module
export { Chatbot } from './component';
export { useMeetings } from './hooks/useMeetings';
export { getAIResponse } from './services/aiService';
export { MeetingCard } from './components/MeetingCard';
export type { ChatMessage, ChatbotResponse } from './types';
export { 
  createUserMessage, 
  createAssistantMessage, 
  formatMessageTimestamp,
  generateMessageId 
} from './utils';
