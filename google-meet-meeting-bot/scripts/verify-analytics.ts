
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const MEETING_ID = '7f48fc00-1b8e-47bb-a56b-a81f858ba4b4';

async function main() {
    console.log(`🔍 Verifying analytics for meeting: ${MEETING_ID}`);

    const meeting = await prisma.meeting.findUnique({
        where: { id: MEETING_ID },
        include: {
            analytics: true,
            speakerStats: {
                orderBy: { speakingTimeSeconds: 'desc' }
            }
        }
    });

    if (!meeting) {
        console.error('❌ Meeting not found in PostgreSQL');
        process.exit(1);
    }

    console.log('\n==================================================');
    console.log(`MEETING: ${meeting.title || 'Untitled'}`);
    console.log(`STATUS: ${meeting.status}`);
    console.log(`CREATED: ${meeting.createdAt}`);
    console.log('==================================================\n');

    if (meeting.analytics) {
        console.log('📊 OVERALL ANALYTICS');
        console.log(`   Duration: ${meeting.analytics.totalDurationSeconds}s`);
        console.log(`   Speakers: ${meeting.analytics.totalSpeakers}`);
        console.log(`   Words: ${meeting.analytics.totalWords}`);
        console.log(`   Avg Speaking Time: ${meeting.analytics.avgSpeakingTimePerPerson?.toFixed(2)}s`);
    } else {
        console.log('⚠️ No MeetingAnalytics record found.');
    }

    console.log('\n🗣️ SPEAKER STATS');
    if (meeting.speakerStats && meeting.speakerStats.length > 0) {
        console.table(meeting.speakerStats.map(s => ({
            Speaker: s.speakerLabel,
            'Time (s)': s.speakingTimeSeconds,
            'Turns': s.turnCount,
            'Words': s.wordCount
        })));
    } else {
        console.log('   No speaker stats found.');
    }

    await prisma.$disconnect();
}

main().catch(console.error);
