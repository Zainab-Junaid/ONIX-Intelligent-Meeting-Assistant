
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('🔍 Checking recent meetings and analytics status...');

    const meetings = await prisma.meeting.findMany({
        where: { id: 'eb2fe364-9fd6-4039-afb3-1e4374dd8cc3' },
    });

    console.log(`Found ${meetings.length} meetings.`);

    for (const meeting of meetings) {
        console.log(`\n------------------------------------------------`);
        console.log(`ID: ${meeting.id}`);
        console.log(`Title: ${meeting.title}`);
        console.log(`Status: ${meeting.status}`);
        console.log(`Created: ${meeting.createdAt}`);
        console.log(`MongoTranscriptID: ${meeting.mongoTranscriptId}`);

        const speakerStats = await prisma.speakerStats.count({
            where: { meetingId: meeting.id }
        });
        console.log(`SpeakerStats Count: ${speakerStats}`);

        const meetingAnalytics = await prisma.meetingAnalytics.findUnique({
            where: { meetingId: meeting.id }
        });
        console.log(`Has MeetingAnalytics: ${!!meetingAnalytics}`);

        if (meetingAnalytics) {
            console.log(` - Duration: ${meetingAnalytics.totalDurationSeconds}s`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
