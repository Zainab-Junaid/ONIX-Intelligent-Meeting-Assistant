const AssemblyAI = require("assemblyai");
const dotenv = require("dotenv");
dotenv.config();

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY,
});

async function summarizeTranscript(transcript) {
  const combinedSegments = transcript.segments
    .map((segment) => segment.text)
    .join(" ");
  const meetingId = transcript.meetingId;

  try {
    console.log(`about to call AssemblyAI LeMUR with ${combinedSegments}`);
    const resp = await client.lemur.summary({
      input_text: combinedSegments,
      answer_format: "paragraph", // or "bulleted_list"
      max_output_size: 2000,
    });

    console.log(`generated text is: ${resp.response}`);
    return {
      meetingId,
      generatedAt: new Date(),
      summaryText: resp.response,
      model: "assemblyai-lemur",
    };
  } catch (err) {
    console.error(`Failed to summarize transcript ${err}`);
    throw new Error(`AssemblyAI Error`);
  }
}

module.exports = { summarizeTranscript };
