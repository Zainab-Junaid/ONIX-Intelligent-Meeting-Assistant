/**
 * Intent Router — deterministic keyword classification
 * Routes user questions to structured handlers or LLM fallback
 */

export type Intent =
  | 'summary'
  | 'participants'
  | 'action_items'
  | 'decisions'
  | 'duration'
  | 'transcript'
  | 'fallback';

interface IntentRule {
  intent: Intent;
  keywords: string[];
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'summary',
    keywords: ['summary', 'summarize', 'summarise', 'overview', 'brief', 'gist', 'main point', 'overall', 'what happened', 'recap'],
  },
  {
    intent: 'participants',
    keywords: ['who attended', 'attendees', 'participant', 'who was', 'who were', 'people', 'members', 'joined', 'present'],
  },
  {
    intent: 'action_items',
    keywords: ['action item', 'action point', 'task', 'todo', 'to do', 'to-do', 'follow up', 'follow-up', 'next step', 'assigned', 'deadline'],
  },
  {
    intent: 'decisions',
    keywords: ['decision', 'decided', 'agreed', 'resolution', 'conclude', 'concluded', 'key point', 'outcome'],
  },
  {
    intent: 'duration',
    keywords: ['how long', 'duration', 'length of', 'how much time', 'minutes', 'hours'],
  },
  {
    intent: 'transcript',
    keywords: ['transcript', 'full conversation', 'what was said', 'word for word', 'verbatim', 'complete text'],
  },
];

/**
 * Detect intent from user question using keyword matching
 */
export function detectIntent(question: string): Intent {
  const lower = question.toLowerCase().trim();

  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.intent;
    }
  }

  return 'fallback';
}
