/**
 * Live Q&A: answer questions from a meeting transcript string.
 * Used by both bot live-ask and extension live-ask API routes.
 * Transcript format: "SpeakerName: text\nSpeakerName: text\n..."
 *
 * Smart answers: use AssemblyAI LeMUR when ASSEMBLYAI_API_KEY is set (concise, inferred).
 * Fallback: keyword-based answers when no API key or LLM fails.
 */

import { AssemblyAI } from 'assemblyai';

export interface LiveQAInput {
  transcript: string;
  meetingTitle?: string;
  question: string;
  /** When true: translate transcript to English and reply in English. When false/undefined: reply in same language as transcript (e.g. Urdu → Urdu). */
  answerInEnglish?: boolean;
}

const MAX_TRANSCRIPT_FOR_LLM = 14000; // chars to stay within model limits

/** Same translation logic as extension generate-summary: transcript → English for QA/summary. */
const TRANSLATE_PROMPT = `You are a professional translator, specialized in technical and business meetings.

Task: Translate the provided transcript into clear, professional English.
- If the text is already in English, output it exactly as is.
- If it is in another language (e.g., Urdu, Hindi, Spanish), translate it to English while preserving the original meaning, tone, and speaker context.
- Keep the same format: each line should be "SpeakerName: spoken text" (preserve speaker labels).
- Do not add any introductory or concluding remarks (like "Here is the translation"). JUST return the English transcript.`;

/**
 * Translate transcript to English using LeMUR (same as generate-summary). Returns original on failure.
 */
async function translateTranscriptToEnglish(
  transcript: string,
  apiKey: string
): Promise<string> {
  if (!transcript.trim()) return transcript;
  try {
    const client = new AssemblyAI({ apiKey });
    const resp = await client.lemur.task({
      input_text: transcript,
      final_model: 'anthropic/claude-sonnet-4-20250514',
      prompt: TRANSLATE_PROMPT,
      context: 'Translate meeting transcript to English for Q&A',
    });
    const translated = (resp?.response ?? '').trim();
    if (translated) return translated;
  } catch (err) {
    console.warn('[live-qa] translate to English failed, using original:', err instanceof Error ? err.message : err);
  }
  return transcript;
}

function parseTranscript(transcript: string): { speaker: string; text: string }[] {
  const lines = transcript.split('\n').filter((l) => l.trim());
  const segments: { speaker: string; text: string }[] = [];
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const speaker = line.slice(0, colonIdx).trim();
      const text = line.slice(colonIdx + 1).trim();
      if (text) segments.push({ speaker, text });
    }
  }
  return segments;
}

function getParticipants(segments: { speaker: string; text: string }[]): string[] {
  const set = new Set<string>();
  segments.forEach((s) => {
    const name = s.speaker.trim();
    if (name && name !== 'Unknown' && name !== 'Unknown Speaker') set.add(name);
  });
  return Array.from(set);
}

/** "What did [X] say about [Y]?" – find lines where speaker matches X and text contains Y */
function findSpeakerAbout(segments: { speaker: string; text: string }[], speakerName: string, topic: string): string[] {
  const lowerTopic = topic.toLowerCase();
  const lowerSpeaker = speakerName.toLowerCase();
  return segments
    .filter((s) => s.speaker.toLowerCase().includes(lowerSpeaker) || lowerSpeaker.includes(s.speaker.toLowerCase()))
    .filter((s) => s.text.toLowerCase().includes(lowerTopic))
    .map((s) => s.text);
}

/** Answer a single question from transcript (sync, no LLM). */
export function answerFromTranscript(input: LiveQAInput): string {
  const { transcript, meetingTitle = 'This meeting', question } = input;
  const trimmed = (transcript || '').trim();
  const segments = parseTranscript(trimmed);

  if (segments.length === 0) {
    return 'No transcript available yet. Start the meeting and speak (or enable captions), then ask again in a moment.';
  }

  const lowerQuestion = question.toLowerCase().trim();
  const transcriptText = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n');

  // —— Participants ——
  const participantKeywords = ['participant', 'attend', 'who', 'people', 'person', 'member', 'present', 'joined'];
  if (participantKeywords.some((k) => lowerQuestion.includes(k))) {
    const participants = getParticipants(segments);
    if (participants.length > 0) {
      const list = participants.map((p, i) => `${i + 1}. ${p}`).join('\n');
      return `People who have spoken so far:\n\n${list}\n\nTotal: ${participants.length}.`;
    }
    return 'No speakers identified in the transcript yet.';
  }

  // —— "What did [X] say about [Y]?" / "What did manager say about documentation?" ——
  const saidMatch = lowerQuestion.match(/what did (.+?) say (?:about|regarding|on) (.+?)\??$/i)
    || lowerQuestion.match(/what (?:did|does) (.+?) say about (.+?)\??$/i)
    || lowerQuestion.match(/(.+?) said about (.+?)\??$/i);
  if (saidMatch) {
    const speakerName = saidMatch[1].trim();
    const topic = saidMatch[2].trim();
    const quotes = findSpeakerAbout(segments, speakerName, topic);
    if (quotes.length > 0) {
      const bullet = quotes.slice(0, 5).map((q) => `• ${q}`).join('\n');
      return `Here's what ${speakerName} said about ${topic}:\n\n${bullet}`;
    }
    return `I didn't find anything in the transcript where ${speakerName} talked about "${topic}". Try rephrasing or check the name/topic.`;
  }

  // —— Summary / what's being discussed / overview ——
  const summaryKeywords = ['summary', 'summarize', 'overview', 'brief', 'gist', 'main point', 'overall', 'discussed', 'discussion', 'being discussed', 'what is being discussed', 'what\'s being discussed'];
  if (summaryKeywords.some((k) => lowerQuestion.includes(k)) || lowerQuestion.includes('what is being discussed')) {
    const lines = segments.slice(-20).map((s) => `${s.speaker}: ${s.text}`);
    const recent = lines.join('\n');
    const highlights: string[] = [];
    segments.forEach((s) => {
      const t = s.text.toLowerCase();
      if (t.includes('decided') || t.includes('agreed') || t.includes('will') && t.length > 15 && t.length < 120) {
        highlights.push(`${s.speaker}: ${s.text}`);
      }
    });
    let out = `**What's being discussed (${meetingTitle}):**\n\n`;
    if (highlights.length > 0) {
      out += highlights.slice(-5).map((h) => `• ${h}`).join('\n');
    } else {
      out += 'Recent discussion:\n' + recent.split('\n').slice(-8).join('\n');
    }
    return out;
  }

  // —— Topics / agenda ——
  const topicKeywords = ['topic', 'discuss', 'about', 'subject', 'agenda', 'talk', 'mention', 'cover'];
  if (topicKeywords.some((k) => lowerQuestion.includes(k))) {
    const topics: string[] = [];
    segments.forEach((s) => {
      const t = s.text;
      if (t.length > 25 && t.length < 150 && !topics.includes(t)) topics.push(t);
    });
    const unique = [...new Set(topics)].slice(-6);
    if (unique.length > 0) {
      return `Topics mentioned so far:\n\n${unique.map((u) => `• ${u}`).join('\n')}`;
    }
    return `So far the discussion is about: ${meetingTitle}. More context will appear as the meeting continues.`;
  }

  // —— Action items ——
  const actionKeywords = ['action', 'task', 'todo', 'follow up', 'next step', 'assignee', 'deadline', 'do'];
  if (actionKeywords.some((k) => lowerQuestion.includes(k))) {
    const actions: string[] = [];
    segments.forEach((s) => {
      const t = s.text.toLowerCase();
      if (t.includes('need to') || t.includes('will ') && t.includes(' by ') || t.includes('follow up') || t.includes('action item')) {
        actions.push(`${s.speaker}: ${s.text}`);
      }
    });
    const unique = [...new Set(actions)].slice(-5);
    if (unique.length > 0) {
      return `Action items / next steps mentioned:\n\n${unique.map((u) => `• ${u}`).join('\n')}`;
    }
    return 'No specific action items or deadlines have been mentioned in the transcript yet.';
  }

  // —— Full transcript (truncated if long) ——
  const transcriptKeywords = ['transcript', 'conversation', 'said', 'full detail', 'complete', 'entire'];
  if (transcriptKeywords.some((k) => lowerQuestion.includes(k))) {
    if (transcriptText.length <= 3000) return `Meeting transcript so far:\n\n${transcriptText}`;
    return `Meeting transcript (recent part):\n\n${transcriptText.slice(-3000)}`;
  }

  // —— Generic search: look for the question words in the transcript ——
  const words = question.replace(/\?/g, '').split(/\s+/).filter((w) => w.length > 2);
  const matches = segments.filter((s) => {
    const line = `${s.speaker} ${s.text}`.toLowerCase();
    return words.some((w) => line.includes(w.toLowerCase()));
  });
  if (matches.length > 0) {
    const excerpt = matches.slice(-5).map((s) => `${s.speaker}: ${s.text}`).join('\n');
    return `From the transcript:\n\n${excerpt}`;
  }

  return `I couldn't find a specific answer to "${question}" in the current transcript. You can ask: "What's being discussed?", "What did [name] say about [topic]?", or "Who is participating?"`;
}

/**
 * Smart answer using AssemblyAI LeMUR (if apiKey is set). Returns concise, inferred answers.
 * Falls back to answerFromTranscript() when no key or on LLM error.
 */
export async function answerFromTranscriptSmart(
  input: LiveQAInput,
  apiKey?: string
): Promise<string> {
  const key = apiKey || process.env.ASSEMBLYAI_API_KEY;
  if (!key || !key.trim()) {
    return answerFromTranscript(input);
  }

  const { transcript, meetingTitle = 'This meeting', question, answerInEnglish } = input;
  const trimmed = (transcript || '').trim();
  if (!trimmed) {
    return 'No transcript available yet. Start the meeting and speak (or enable captions), then ask again in a moment.';
  }

  let transcriptForQA = trimmed.length > MAX_TRANSCRIPT_FOR_LLM
    ? trimmed.slice(-MAX_TRANSCRIPT_FOR_LLM)
    : trimmed;

  // Only translate to English when caller wants English answers (e.g. for consistent reporting).
  // Otherwise reply in same language as transcript (Urdu → Urdu, etc.).
  if (answerInEnglish) {
    transcriptForQA = await translateTranscriptToEnglish(transcriptForQA, key);
  }

  const languageRule = answerInEnglish
    ? `- Answer in English only, in 2-5 sentences or a few short bullet points.`
    : `- Answer in the SAME language as the transcript (e.g. if the transcript is in Urdu, answer in Urdu; if in Hindi, answer in Hindi). Use 2-5 sentences or a few short bullet points.`;

  const prompt = `You are a helpful meeting assistant. Using ONLY the transcript above (from the meeting "${meetingTitle}"), answer this question concisely:

"${question}"

Rules:
${languageRule}
- Do NOT repeat the full transcript.
- If asking what someone said: give only the relevant summary or quote.
- If the exact words aren't there, infer from the discussion and say e.g. "Based on the discussion, ..." or "X mentioned that ...". Do not say "this is not mentioned" unless there is truly nothing related.
- If nothing relevant: say briefly "That wasn't covered yet" and one line on what is being discussed.
- Plain language, no markdown headers.`;

  try {
    const client = new AssemblyAI({ apiKey: key });
    const resp = await client.lemur.task({
      input_text: transcriptForQA,
      final_model: 'anthropic/claude-sonnet-4-20250514',
      prompt,
      context: 'Live meeting Q&A',
    });

    const answer = (resp?.response ?? '').trim();
    if (answer) return answer;
  } catch (err) {
    console.warn('[live-qa] LeMUR fallback:', err instanceof Error ? err.message : err);
  }

  // Fallback: keyword logic works best on English; use translated transcript only when answerInEnglish
  const fallbackTranscript = answerInEnglish ? transcriptForQA : trimmed;
  return answerFromTranscript({ ...input, transcript: fallbackTranscript });
}
