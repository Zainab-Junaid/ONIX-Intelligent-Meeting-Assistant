import dotenv from "dotenv";

dotenv.config();

async function main() {
  try {
    const combinedSegments = "[Speaker 1]: Let's migrate to the new LLM gateway. [Speaker 2]: Great idea, I'll update the models.";
    const SUMMARY_PROMPT = "Summarize this meeting in one sentence.";
    const transcript = { meetingTitle: "Migration Sync" };

    const makeGatewayCall = async (promptName: string, promptText: string, context: string, maxTokens: number) => {
      console.log(`📋 LLM Gateway Call: ${promptName}...`);
      const response = await fetch("https://llm-gateway.assemblyai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.ASSEMBLYAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          messages: [
            { 
              role: "system", 
              content: `${context}\n\nYou are processing a meeting transcript. The transcript is provided in the user message.` 
            },
            { 
              role: "user", 
              content: `Here is the transcript:\n\n${combinedSegments}\n\nTask:\n${promptText}` 
            }
          ],
          max_tokens: maxTokens,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM Gateway Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    };

    const summaryText = await makeGatewayCall(
      "Generating structured summary",
      SUMMARY_PROMPT,
      `Meeting title: ${transcript.meetingTitle || 'Unknown'}.`,
      4000
    );

    console.log("Success:", summaryText);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
