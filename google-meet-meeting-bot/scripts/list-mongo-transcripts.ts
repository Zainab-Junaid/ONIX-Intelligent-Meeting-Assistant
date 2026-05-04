
import mongoose from 'mongoose';
import { initMongoConnection } from '../src/infrastructure/mongo/transcriptRepo';

async function main() {
    console.log('🔍 Listing all MongoDB transcripts...');

    await initMongoConnection();

    const MeetingTranscript = mongoose.model('MeetingTranscript');

    const transcripts = await MeetingTranscript.find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .select('meetingId meetingTitle createdAt segments.length finalized')
        .lean()
        .exec();

    console.log(`Found ${transcripts.length} transcripts:`);

    transcripts.forEach(t => {
        console.log(` - ID: ${t.meetingId}`);
        console.log(`   Title: ${t.meetingTitle}`);
        console.log(`   Created: ${t.createdAt}`);
        console.log(`   Segments: ${t.segments?.length || 0}`);
        console.log(`   Finalized: ${t.finalized}`);
        console.log('---');
    });

    await mongoose.disconnect();
}

main().catch(console.error);
