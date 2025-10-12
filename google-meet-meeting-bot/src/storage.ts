import prismaPkg from "@prisma/client";
// Tolerate environments where TS can't see named export; fall back to runtime property
const PrismaClient: { new(): any } = (prismaPkg as any).PrismaClient;
import { MeetingSummaryInput, MeetingTranscript, Segment } from "./models";

// init prisma client to access db
const prisma = new PrismaClient();

// Test database connection
export async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connection successful");
    
    // Test if tables exist
    const transcriptCount = await prisma.meetingTranscript.count();
    const segmentCount = await prisma.segment.count();
    console.log(`📊 Database status: ${transcriptCount} transcripts, ${segmentCount} segments`);
    
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

// create job record for mtg
export async function createMeetingJob(meetingUrl: string) {
  return await prisma.meetingJob.create({
    data: { meetingUrl },
  });
}

// fetch meeting job with ID
export async function getMeetingJob(id: string) {
  return await prisma.meetingJob.findUnique({
    where: { id },
  });
}

// save batch of segments
export async function saveTranscriptBatch(
  meetingId: string,
  createdAt: Date,
  batch: Segment[],
  force = false,
) {
  // if batch is empty, don't save unless forced
  if (batch.length === 0 && !force) return;
  console.log(`[FLUSH] saving ${batch.length} segments for meeting ${meetingId}`);

  try {
    // make sure transcript exists
    await prisma.meetingTranscript.upsert({
      where: { meetingId },
      update: { createdAt },
      create: { meetingId, createdAt },
    });
    console.log(`[FLUSH] MeetingTranscript upserted for ${meetingId}`);
    
    // add segments individually to allow for updates
    let savedCount = 0;
    for (const seg of batch) {
      await prisma.segment.upsert({
        where: {
          meetingId_start: {
            meetingId,
            start: seg.start,
          },
        },
        update: {
          end: seg.end,
          text: seg.text,
          speaker: seg.speaker,
        },
        create: {
          meetingId,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          speaker: seg.speaker,
        },
      });
      savedCount++;
      console.log(`[FLUSH] ✅ Caption stored: "${seg.speaker}: ${seg.text.substring(0, 50)}${seg.text.length > 50 ? '...' : ''}"`);
    }

    console.log(`[FLUSH] ✅ SUCCESS: ${savedCount}/${batch.length} segments saved to database for meeting ${meetingId}`);
    
    // If this is a final flush (force=true), trigger summary generation
    if (force && savedCount > 0) {
      console.log(`🚀 Final flush detected - triggering summary generation for meeting ${meetingId}`);
      try {
        const summaryRes = await fetch(`http://backend:3001/debug/generate-summary/${meetingId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        
        if (summaryRes.ok) {
          console.log(`✅ Summary generation triggered successfully for meeting ${meetingId}`);
        } else {
          console.error(`❌ Summary generation failed for meeting ${meetingId} (${summaryRes.status})`);
        }
      } catch (summaryErr) {
        console.error(`❌ Summary generation error for meeting ${meetingId}:`, summaryErr);
      }
    }
  } catch (err) {
    console.error(`[FLUSH] ❌ FAILED to save segments for meeting ${meetingId}:`, err);
  }
}

export async function getTranscript(
  meetingId: string,
): Promise<MeetingTranscript> {
  console.log(`🔍 Fetching transcript for meeting ${meetingId}`);
  const transcript = await prisma.meetingTranscript.findUniqueOrThrow({
    where: { meetingId },
    include: {
      segments: true,
    },
  });
  console.log(`📄 Found transcript with ${transcript.segments.length} segments`);
  console.dir(transcript);
  return {
    meetingId: transcript.meetingId,
    createdAt: transcript.createdAt,
    segments: transcript.segments,
  };
}

// Debug function to list all transcripts
export async function listAllTranscripts() {
  try {
    const transcripts = await prisma.meetingTranscript.findMany({
      include: {
        segments: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`📋 Found ${transcripts.length} transcripts in database:`);
    transcripts.forEach((t: any, index: number) => {
      console.log(`${index + 1}. Meeting ${t.meetingId}: ${t.segments.length} segments (${t.createdAt})`);
    });
    
    return transcripts;
  } catch (error) {
    console.error("❌ Failed to list transcripts:", error);
    return [];
  }
}

// update status of job (summarized, transcript_saved, etc)
export async function updateMeetingStatus(
  id: string,
  status: string,
  meetingId?: string,
) {
  return await prisma.meetingJob.update({
    where: { id },
    data: {
      status,
      meetingId,
    },
  });
}

// save summary of mtg
export async function saveSummary(summary: MeetingSummaryInput) {
  try {
    console.log(`💾 Saving summary for meeting ${summary.meetingId}`);
    console.log(`📝 Summary text length: ${summary.summaryText.length} characters`);
    console.log(`🤖 Model used: ${summary.model}`);
    
    const result = await prisma.meetingSummary.create({
      data: {
        meetingId: summary.meetingId,
        generatedAt: summary.generatedAt,
        summaryText: summary.summaryText,
        model: summary.model,
      },
    });
    
    console.log(`✅ Summary saved successfully with ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to save summary for meeting ${summary.meetingId}:`, error);
    throw error;
  }
}
