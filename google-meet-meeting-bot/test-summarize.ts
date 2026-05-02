import { summarizeTranscript } from "./src/summarize";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const mockTranscript = {
    meetingId: "test-meeting-123",
    userId: "test-user",
    meetingTitle: "Test Meeting",
    segments: [
      { speaker: "Speaker 1", text: "Hello, this is a test.", start: 0, end: 1 },
      { speaker: "Speaker 2", text: "Yes, I can hear you.", start: 1, end: 2 },
      { speaker: "Speaker 1", text: "Let's test the LLM Gateway.", start: 2, end: 3 }
    ]
  };

  try {
    const result = await summarizeTranscript(mockTranscript as any);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Test Error:", err);
  }
}

main();
