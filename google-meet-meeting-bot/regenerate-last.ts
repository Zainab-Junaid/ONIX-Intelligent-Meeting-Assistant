import { summarizeTranscript } from "./src/summarize";
import { PrismaClient } from "@prisma/client";
import mongoose from "mongoose";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL?.replace("postgres:5432", "localhost:5433"),
    },
  },
});

const transcriptSchema = new mongoose.Schema({
  meetingId: String,
  userId: String,
  meetingTitle: String,
  segments: [
    {
      speaker: String,
      text: String,
      start: Number,
      end: Number,
    },
  ],
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'meetingtranscripts' });

const TranscriptModel = mongoose.models.MeetingTranscript || mongoose.model("MeetingTranscript", transcriptSchema);

async function main() {
  try {
    console.log("Connecting to MongoDB...");
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/meeting-transcripts";
    await mongoose.connect(mongoUri);

    console.log("Fetching meeting from PostgreSQL...");
    const meetingId = '8fb8cdff-6ac0-460c-a527-81a6aa170798';
    const lastMeeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!lastMeeting) {
      console.log("No meeting found.");
      process.exit(0);
    }

    console.log(`Found meeting: ${meetingId} - ${lastMeeting.title}`);

    console.log("Fetching transcript from MongoDB...");
    const transcriptId = lastMeeting.mongoTranscriptId || meetingId;
    const transcriptDoc = await TranscriptModel.findOne({ meetingId: transcriptId });

    if (!transcriptDoc) {
      console.log("Transcript not found in MongoDB.");
      process.exit(0);
    }

    const transcript = {
      meetingId: transcriptDoc.meetingId,
      userId: transcriptDoc.userId,
      meetingTitle: transcriptDoc.meetingTitle || lastMeeting.title,
      segments: transcriptDoc.segments.map((s: any) => ({
        speaker: s.speaker,
        text: s.text,
        start: s.start,
        end: s.end
      }))
    };

    console.log(`Generating summary with LLM Gateway...`);
    const { summary, actionItems } = await summarizeTranscript(transcript);
    
    console.log("Updating summary in PostgreSQL...");
    
    // Check if summary exists
    const existingSummary = await prisma.meetingSummary.findFirst({
      where: { meetingId }
    });

    if (existingSummary) {
      await prisma.meetingSummary.update({
        where: { id: existingSummary.id },
        data: {
          summaryText: summary.summaryText,
          model: summary.model,
          isFallback: summary.isFallback,
          generatedAt: new Date(),
        }
      });
      console.log("Updated existing summary.");
    } else {
      await prisma.meetingSummary.create({
        data: {
          meetingId,
          userId: summary.userId,
          meetingTitle: summary.meetingTitle,
          summaryText: summary.summaryText,
          model: summary.model,
          isFallback: summary.isFallback,
        }
      });
      console.log("Created new summary.");
    }

    console.log("✅ Successfully regenerated summary for the last meeting.");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
    await mongoose.disconnect();
  }
}

main();
