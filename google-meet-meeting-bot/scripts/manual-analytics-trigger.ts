
import 'dotenv/config';
import mongoose from 'mongoose';
import { prisma } from '../src/lib/prisma'; // Adjust path if needed
import { processMeetingJob } from '../src/infrastructure/workers/meetingProcessingWorker'; // Adjust path
import { MeetingStatus } from '../src/config/constants';

// MongoDB Schema for querying directly if needed, or use repo
import { initMongoConnection } from '../src/infrastructure/mongo/transcriptRepo';

async function main() {
    console.log('🔍 Finding latest finalized meeting in MongoDB...');

    await initMongoConnection();

    // We need to access the model directly to sort by createdAt.
    // The repo doesn't expose a "getLatest" method, so we'll access the model via mongoose.models
    // But we need to ensure models are initialized. initMongoConnection does that.

    // Validating model existence
    const MeetingTranscript = mongoose.model('MeetingTranscript');

    const latestTranscript = await MeetingTranscript.findOne({ meetingId: 'eb2fe364-9fd6-4039-afb3-1e4374dd8cc3' })
        .exec();

    if (!latestTranscript) {
        console.error('❌ No finalized transcripts found in MongoDB.');
        process.exit(1);
    }

    const meetingId = latestTranscript.meetingId;
    console.log(`✅ Found latest finalized meeting:`);
    console.log(`   ID: ${meetingId}`);
    console.log(`   Created: ${latestTranscript.createdAt}`);
    console.log(`   Segments: ${latestTranscript.segments.length}`);
    console.log(`   FinalizedAt: ${latestTranscript.finalizedAt}`);

    // Check Postgres Status
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
    });

    if (!meeting) {
        console.log(`⚠️ Meeting ${meetingId} not found in PostgreSQL. Creating stub...`);

        // Fetch a default tenant or create one
        let defaultTenant = await prisma.tenant.findFirst();
        if (!defaultTenant) {
            console.log('⚠️ No tenant found. Creating default tenant...');
            defaultTenant = await prisma.tenant.create({
                data: {
                    name: 'Personal Workspace',
                    planType: 'free'
                }
            });
            console.log(`✅ Created default tenant: ${defaultTenant.id}`);
        }

        await prisma.meeting.create({
            data: {
                id: meetingId,
                status: MeetingStatus.COMPLETED,
                title: latestTranscript.meetingTitle || 'Untitled Meeting',
                startTime: latestTranscript.createdAt,
                tenantId: defaultTenant.id,
                // Add other required fields if any
            }
        });
        console.log('   ✅ Created stub meeting in Postgres.');
    } else {
        console.log(`   Postgres Status: ${meeting.status}`);

        if (meeting.status === MeetingStatus.PROCESSED) {
            console.log('   Stats is PROCESSED. Resetting to COMPLETED to force re-run...');
            await prisma.meeting.update({
                where: { id: meetingId },
                data: { status: MeetingStatus.COMPLETED }
            });
            console.log('   ✅ Reset status to COMPLETED.');
        } else if (meeting.status === MeetingStatus.PROCESSING) {
            console.log('   Stats is PROCESSING. Resetting to COMPLETED to retry...');
            await prisma.meeting.update({
                where: { id: meetingId },
                data: { status: MeetingStatus.COMPLETED }
            });
            console.log('   ✅ Reset status to COMPLETED.');
        }
    }

    console.log('🚀 Triggering analytics worker manually...');

    // Mock Job
    const mockJob = {
        id: `manual-${Date.now()}`,
        name: 'manual-trigger',
        data: { meetingId },
        updateProgress: async (progress: number) => {
            console.log(`   [Job Progress] ${progress}%`);
        },
    } as any;

    try {
        const result = await processMeetingJob(mockJob);
        console.log('✅ Worker finished successfully!');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Worker failed:', error);
    } finally {
        await mongoose.disconnect();
        await prisma.$disconnect();
    }
}

main().catch(console.error);
