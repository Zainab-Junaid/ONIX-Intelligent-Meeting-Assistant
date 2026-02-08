import { prisma } from "./lib/prisma";
// Tolerate environments where TS can't see named export; fall back to runtime property
import { MeetingSummaryInput, MeetingTranscript, Segment, ActionItemInput } from "./domain/transcription/models";
import {
  getFirestoreAdmin,
  serverTimestamp as fsServerTs,
  fsCreateOrUpdateMeeting,
  fsAddSegment,
  fsFinalizeMeetingDuration,
  fsSaveSummaryOnce,
  fsSaveActionItemsOnce,
} from "./firestoreAdmin";

// Using singleton prisma client from lib/prisma.ts

// Test database connection
export async function testDatabaseConnection() {
  try {
    if (process.env.ENABLE_FIRESTORE === "1") {
      // Touch Firestore to verify credentials
      const db = getFirestoreAdmin();
      await db.listCollections();
      console.log("✅ Firestore connection successful");
      return true;
    }

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
export async function createMeetingJob(meetingUrl: string, userId?: string, meetingTitle?: string) {
  if (process.env.ENABLE_FIRESTORE === "1") {
    // Firestore stores meeting job details on the meeting doc; still return a stub for server flow
    return { id: "fs-job-" + Date.now(), meetingUrl, userId, meetingTitle } as any;
  }
  return await prisma.meetingJob.create({
    data: {
      meetingUrl,
      userId,
      meetingTitle
    },
  });
}

// fetch meeting job with ID
export async function getMeetingJob(id: string) {
  if (process.env.ENABLE_FIRESTORE === "1") {
    return { id } as any;
  }
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
  userId?: string,
  meetingTitle?: string,
) {
  // if batch is empty, don't save unless forced
  if (batch.length === 0 && !force) return;
  console.log(`[FLUSH] saving ${batch.length} segments for meeting ${meetingId}`);

  try {
    let totalSaved = 0;
    if (process.env.ENABLE_FIRESTORE === "1") {
      // Ensure meeting doc exists with startTime and hostId/title
      await fsCreateOrUpdateMeeting(meetingId, {
        meetingTitle,
        hostId: userId,
        startTime: true,
      });
      // Add segments and append transcript text
      let savedCount = 0;
      for (const seg of batch) {
        await fsAddSegment(meetingId, {
          text: seg.text,
          speaker: seg.speaker,
          timestamp: new Date(createdAt.getTime() + (seg.start || 0) * 1000),
        });
        await fsCreateOrUpdateMeeting(meetingId, { transcriptAppend: `${seg.speaker}: ${seg.text}` });
        savedCount++;
        console.log(`[FLUSH][FS] ✅ Segment stored: "${seg.speaker}: ${seg.text.substring(0, 50)}${seg.text.length > 50 ? '...' : ''}"`);
      }
      console.log(`[FLUSH][FS] ✅ SUCCESS: ${savedCount}/${batch.length} segments saved for meeting ${meetingId}`);
      totalSaved = savedCount;
    } else {
      // make sure transcript exists in Postgres
      await prisma.meetingTranscript.upsert({
        where: { meetingId },
        update: { createdAt, userId, meetingTitle },
        create: { meetingId, createdAt, userId, meetingTitle },
      });
      console.log(`[FLUSH] MeetingTranscript upserted for ${meetingId}`);

      // add segments individually - use composite key of meetingId + speaker + start to prevent overwrites
      let savedCount = 0;
      for (const seg of batch) {
        // Create a unique identifier for this segment to prevent overwrites
        // Use meetingId + speaker + start as composite key
        try {
          // First try to find existing segment with same meetingId, speaker, and start time
          const existing = await prisma.segment.findFirst({
            where: {
              meetingId,
              speaker: seg.speaker,
              start: seg.start,
            },
          });

          if (existing) {
            // Update existing segment if text is different or end time is later
            if (existing.text !== seg.text || existing.end < seg.end) {
              await prisma.segment.update({
                where: { id: existing.id },
                data: {
                  end: seg.end,
                  text: seg.text,
                },
              });
              console.log(`[FLUSH] ✅ Segment updated: "${seg.speaker}: ${seg.text.substring(0, 50)}${seg.text.length > 50 ? '...' : ''}"`);
            } else {
              console.log(`[FLUSH] ⏭️ Segment already exists with same content, skipping`);
            }
          } else {
            // Create new segment
            await prisma.segment.create({
              data: {
                meetingId,
                start: seg.start,
                end: seg.end,
                text: seg.text,
                speaker: seg.speaker,
              },
            });
            console.log(`[FLUSH] ✅ New segment stored: "${seg.speaker}: ${seg.text.substring(0, 50)}${seg.text.length > 50 ? '...' : ''}"`);
          }
          savedCount++;
        } catch (err: any) {
          // If unique constraint violation, try to update instead
          if (err.code === 'P2002') {
            console.log(`[FLUSH] ⚠️ Unique constraint violation, attempting update...`);
            try {
              const existing = await prisma.segment.findFirst({
                where: {
                  meetingId,
                  speaker: seg.speaker,
                  start: seg.start,
                },
              });
              if (existing) {
                await prisma.segment.update({
                  where: { id: existing.id },
                  data: {
                    end: seg.end,
                    text: seg.text,
                  },
                });
                savedCount++;
              }
            } catch (updateErr) {
              console.error(`[FLUSH] ❌ Failed to update segment:`, updateErr);
            }
          } else {
            console.error(`[FLUSH] ❌ Failed to save segment:`, err);
          }
        }
      }

      console.log(`[FLUSH] ✅ SUCCESS: ${savedCount}/${batch.length} segments saved to database for meeting ${meetingId}`);
      totalSaved = savedCount;
    }

    // If this is a final flush (force=true), trigger summary generation with retry
    if (force && totalSaved > 0) {
      console.log(`🚀 Final flush detected - triggering summary generation for meeting ${meetingId}`);
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const summaryRes = await fetch(`http://backend:3001/debug/generate-summary/${meetingId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (summaryRes.ok) {
            console.log(`✅ Summary generation triggered successfully for meeting ${meetingId}`);
            break; // Success, exit retry loop
          } else {
            console.error(`❌ Summary generation failed for meeting ${meetingId} (${summaryRes.status}) - attempt ${retryCount + 1}/${maxRetries}`);
            const errorText = await summaryRes.text().catch(() => 'Unknown error');
            console.error(`❌ Error details: ${errorText}`);
          }
        } catch (summaryErr) {
          console.error(`❌ Summary generation error for meeting ${meetingId} (attempt ${retryCount + 1}/${maxRetries}):`, summaryErr);
        }

        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`🔄 Retrying summary generation in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (retryCount >= maxRetries) {
        console.error(`❌ CRITICAL: Summary generation failed after ${maxRetries} attempts for meeting ${meetingId}`);
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
  if (process.env.ENABLE_FIRESTORE === "1") {
    const db = getFirestoreAdmin();
    const ref = db.collection("meetings").doc(meetingId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error("Meeting not found in Firestore");
    const segSnap = await ref.collection("segments").orderBy("timestamp", "asc").get();
    const segments: any[] = [];
    segSnap.forEach((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const s = d.data() as any;
      segments.push({
        start: 0,
        end: 0,
        text: s.text,
        speaker: s.speaker,
      });
    });
    console.log(`📄[FS] Found transcript with ${segments.length} segments`);
    return {
      meetingId,
      createdAt: doc.get("startTime")?.toDate?.() ?? new Date(),
      segments,
      userId: doc.get("hostId"),
      meetingTitle: doc.get("meetingTitle"),
    } as any;
  }
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
    segments: transcript.segments as any,
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
  if (process.env.ENABLE_FIRESTORE === "1") {
    // Firestore path: update fields on meeting doc for status if needed
    if (meetingId) {
      await fsCreateOrUpdateMeeting(meetingId, { endTime: status === "summarized" });
      if (status === "summarized") {
        await fsFinalizeMeetingDuration(meetingId);
      }
    }
    return { id, status } as any;
  }
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

    if (process.env.ENABLE_FIRESTORE === "1") {
      const saved = await fsSaveSummaryOnce(summary.meetingId, {
        content: summary.summaryText,
        generatedAt: summary.generatedAt,
        isFallback: !!summary.isFallback,
      });
      if (!saved) {
        console.log(`⚠️[FS] Summary not saved (exists or fallback)`);
        return null as any;
      }
      console.log(`✅[FS] Summary saved in meeting document`);
      return { id: "fs-summary" } as any;
    }

    // Check if summary already exists for this meeting (prevent duplicates)
    const existingSummary = await prisma.meetingSummary.findFirst({
      where: {
        meetingId: summary.meetingId,
        isFallback: false // Only check non-fallback summaries
      },
    });

    if (existingSummary) {
      console.log(`⚠️ Summary already exists for meeting ${summary.meetingId}, skipping duplicate`);
      return existingSummary;
    }

    // Only save non-fallback summaries
    if (summary.isFallback) {
      console.log(`⚠️ Skipping fallback summary for meeting ${summary.meetingId}`);
      return null;
    }

    const result = await prisma.meetingSummary.create({
      data: {
        meetingId: summary.meetingId,
        userId: summary.userId,
        meetingTitle: summary.meetingTitle,
        generatedAt: summary.generatedAt,
        summaryText: summary.summaryText,
        model: summary.model,
        isFallback: summary.isFallback || false,
      },
    });

    console.log(`✅ Summary saved successfully with ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to save summary for meeting ${summary.meetingId}:`, error);
    throw error;
  }
}

// save action items to proper ActionItem table (not MeetingJob!)
// Uses hash-based deduplication for idempotency
export async function saveActionItems(actionItems: ActionItemInput[]) {
  try {
    console.log(`💾 Saving ${actionItems.length} action items to ActionItem table`);

    if (process.env.ENABLE_FIRESTORE === "1") {
      const items = actionItems.map((i) => ({
        id: `${i.meetingId}-${hashText(i.item || "")}`,
        text: i.item,
        assignedTo: i.assignedTo,
        dueDate: i.dueDate,
      }));
      await fsSaveActionItemsOnce(actionItems[0]?.meetingId || "", items);
      console.log(`✅[FS] Action items merged into meeting document`);
      return items as any;
    }

    // Get tenantId from meeting, default to constant if not found
    const { DEFAULT_TENANT_ID } = await import('./config/constants');
    const meetingId = actionItems[0]?.meetingId;
    let tenantId = DEFAULT_TENANT_ID;

    if (meetingId) {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { tenantId: true },
      });
      if (meeting?.tenantId) {
        tenantId = meeting.tenantId;
      }
    }

    // De-duplicate within the batch using hash of description
    const results = [] as any[];
    const seenHashes = new Set<string>();

    for (const item of actionItems) {
      const descriptionHash = hashText(item.item || '');
      const dedupeKey = `${item.meetingId}::${descriptionHash}`;

      if (seenHashes.has(dedupeKey)) {
        console.log(`⚠️ Skipping duplicate action item in batch: "${(item.item || '').substring(0, 50)}..."`);
        continue;
      }
      seenHashes.add(dedupeKey);

      // Upsert: insert if not exists, update if exists
      // Uses meetingId + descriptionHash as natural key
      try {
        // Try to find existing by meetingId + similar description
        const existing = await prisma.actionItem.findFirst({
          where: {
            meetingId: item.meetingId,
            description: item.item,
          },
        });

        if (existing) {
          console.log(`⚠️ Action item already exists for meeting ${item.meetingId}, skipping`);
          results.push(existing);
          continue;
        }

        const result = await prisma.actionItem.create({
          data: {
            meetingId: item.meetingId,
            tenantId,
            description: item.item || 'Unnamed action item',
            status: item.status || 'pending',
            priority: 'medium',
            // assignedToUserId requires User lookup, skip for now
          },
        });
        results.push(result);
      } catch (createError: any) {
        // Handle potential race condition with duplicate insert
        if (createError?.code === 'P2002') {
          console.log(`⚠️ Action item already exists (race condition), skipping`);
        } else {
          console.error(`❌ Failed to create action item:`, createError);
        }
      }
    }

    console.log(`✅ ${results.length} action items saved to ActionItem table`);
    return results;
  } catch (error) {
    console.error(`❌ Failed to save action items:`, error);
    throw error;
  }
}

// get action items for a meeting from ActionItem table
export async function getActionItems(meetingId: string) {
  try {
    // Try new ActionItem table first
    const actionItems = await prisma.actionItem.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    });

    if (actionItems.length > 0) {
      console.log(`📋 Found ${actionItems.length} action items in ActionItem table for meeting ${meetingId}`);
      return actionItems.map(item => ({
        id: item.id,
        meetingId: item.meetingId,
        item: item.description,
        status: item.status,
        assignedTo: item.assignedToUserId,
        priority: item.priority,
        createdAt: item.createdAt,
      }));
    }

    // Fallback to legacy MeetingJob table for backward compatibility
    const legacyItems = await prisma.meetingJob.findMany({
      where: {
        meetingId,
        meetingUrl: { startsWith: 'action-item-' }
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`📋 Found ${legacyItems.length} legacy action items in MeetingJob for meeting ${meetingId}`);
    return legacyItems.map(item => ({
      id: item.id,
      meetingId: item.meetingId,
      item: item.meetingTitle,
      status: item.status,
      createdAt: item.createdAt,
    }));
  } catch (error) {
    console.error(`❌ Failed to get action items for meeting ${meetingId}:`, error);
    return [];
  }
}

// Helper: Create a simple hash of text for deduplication
function hashText(text: string): string {
  let hash = 0;
  const str = (text || '').trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
