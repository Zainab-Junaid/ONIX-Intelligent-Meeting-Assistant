/**
 * Structured Handlers — deterministic responses for classified intents
 * These NEVER hallucinate — they only return existing data
 */

import { MeetingContext } from './types';

/**
 * Handle summary intent
 */
export function handleSummary(ctx: MeetingContext): string {
  if (ctx.summary) {
    return `📋 **Meeting Summary: ${ctx.title}**\n\n${ctx.summary}`;
  }
  return `No summary is available for "${ctx.title}" yet. The meeting may still be processing.`;
}

/**
 * Handle participants intent
 */
export function handleParticipants(ctx: MeetingContext): string {
  if (ctx.participants.length === 0) {
    return `No participant information is available for "${ctx.title}".`;
  }

  const list = ctx.participants
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');

  return `👥 **Participants in "${ctx.title}"** (${ctx.participants.length}):\n\n${list}`;
}

/**
 * Handle duration intent
 */
export function handleDuration(ctx: MeetingContext): string {
  if (ctx.duration === null || ctx.duration === undefined) {
    return `Duration information is not available for "${ctx.title}".`;
  }

  const hours = Math.floor(ctx.duration / 3600);
  const minutes = Math.floor((ctx.duration % 3600) / 60);
  const seconds = ctx.duration % 60;

  let formatted = '';
  if (hours > 0) formatted += `${hours}h `;
  if (minutes > 0) formatted += `${minutes}m `;
  if (seconds > 0 && hours === 0) formatted += `${seconds}s`;

  return `⏱️ **Meeting Duration:** ${formatted.trim()}\n\nMeeting: "${ctx.title}"`;
}

/**
 * Handle action items intent
 */
export function handleActionItems(ctx: MeetingContext): string {
  if (ctx.actionItems.length === 0) {
    return `No action items were recorded for "${ctx.title}".`;
  }

  const list = ctx.actionItems
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n');

  return `📌 **Action Items from "${ctx.title}"** (${ctx.actionItems.length}):\n\n${list}`;
}

/**
 * Handle decisions intent
 */
export function handleDecisions(ctx: MeetingContext): string {
  if (ctx.decisions.length === 0) {
    return `No specific decisions were documented for "${ctx.title}".`;
  }

  const list = ctx.decisions
    .map((d, i) => `${i + 1}. ${d}`)
    .join('\n');

  return `✅ **Decisions from "${ctx.title}"** (${ctx.decisions.length}):\n\n${list}`;
}

/**
 * Handle transcript intent
 */
export function handleTranscript(ctx: MeetingContext): string {
  if (ctx.transcript.length === 0) {
    return `No transcript is available for "${ctx.title}".`;
  }

  // Return a condensed version (first 50 segments)
  const maxSegments = 50;
  const segments = ctx.transcript.slice(0, maxSegments);
  const lines = segments
    .map((s) => `**${s.speaker}:** ${s.text}`)
    .join('\n\n');

  const truncated = ctx.transcript.length > maxSegments
    ? `\n\n_...showing first ${maxSegments} of ${ctx.transcript.length} segments._`
    : '';

  return `📝 **Transcript: "${ctx.title}"**\n\n${lines}${truncated}`;
}
