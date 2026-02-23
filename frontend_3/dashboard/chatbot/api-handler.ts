// This file is now simplified - all logic moved to client-side component
// API route can be removed or kept for future server-side processing

export default async function processChatbotQuery({ query, userId, meetingId }: { query: string; userId?: string | null; meetingId?: string | null }) {
  // This is now handled client-side via Anthropic API
  // Keeping this for backward compatibility but it's not used
  return "Chatbot is now handled client-side. Please use the component directly.";
}
