/**
 * Test 4: Meeting Lifecycle (PostgreSQL)
 * 
 * Run: npx ts-node tests/04-test-meeting-lifecycle.ts
 */

import { prisma, disconnectPrisma } from '../src/lib/prisma';

async function main() {
    console.log('\n🔄 TEST 4: Meeting Lifecycle\n' + '='.repeat(50));

    try {
        await prisma.$connect();

        // Test 4.1: Check for meetings with 'live' status
        console.log('4.1 Checking for LIVE meetings...');
        const liveMeetings = await prisma.meeting.findMany({
            where: { status: 'live' },
            select: { id: true, title: true, startTime: true },
            take: 5
        });
        console.log(`    ✅ Live meetings: ${liveMeetings.length}`);
        for (const m of liveMeetings) {
            console.log(`      - ${m.id}: "${m.title}" (started: ${m.startTime})`);
        }

        // Test 4.2: Check for meetings with 'completed' status
        console.log('4.2 Checking for COMPLETED meetings...');
        const completedMeetings = await prisma.meeting.findMany({
            where: { status: 'completed' },
            select: { id: true, title: true, startTime: true, endTime: true, mongoTranscriptId: true },
            orderBy: { endTime: 'desc' },
            take: 5
        });
        console.log(`    ✅ Completed meetings: ${completedMeetings.length}`);
        for (const m of completedMeetings) {
            const duration = m.startTime && m.endTime
                ? Math.round((m.endTime.getTime() - m.startTime.getTime()) / 1000 / 60)
                : '?';
            console.log(`      - ${m.id}: "${m.title}" (${duration} mins)`);
            console.log(`        MongoDB ref: ${m.mongoTranscriptId || 'none'}`);
        }

        // Test 4.3: Check Tenant exists
        console.log('4.3 Checking default Tenant...');
        const tenants = await prisma.tenant.findMany({ take: 5 });
        if (tenants.length > 0) {
            console.log(`    ✅ Tenants found: ${tenants.length}`);
            for (const t of tenants) {
                console.log(`      - ${t.id}: "${t.name}"`);
            }
        } else {
            console.log('    ⚠️ No tenants (will be created on first bot start)');
        }

        // Test 4.4: Check lifecycle integrity
        console.log('4.4 Checking lifecycle statistics...');
        const stats = await prisma.meeting.groupBy({
            by: ['status'],
            _count: true
        });
        console.log('    Meeting status distribution:');
        for (const s of stats) {
            console.log(`      - ${s.status}: ${s._count}`);
        }

        // Test 4.5: Check mongoTranscriptId links
        console.log('4.5 Checking MongoDB links...');
        const withLink = await prisma.meeting.count({ where: { mongoTranscriptId: { not: null } } });
        const withoutLink = await prisma.meeting.count({ where: { mongoTranscriptId: null } });
        console.log(`    ✅ With MongoDB link: ${withLink}`);
        console.log(`    ⚠️ Without MongoDB link: ${withoutLink}`);

        await disconnectPrisma();
        console.log('\n✅ ALL MEETING LIFECYCLE TESTS PASSED!\n');

    } catch (error: any) {
        console.error('\n❌ MEETING LIFECYCLE TEST FAILED!');
        console.error('Error:', error.message);
        console.error('\nPossible fixes:');
        console.error('  1. Run: npx prisma generate');
        console.error('  2. Run: npx prisma migrate dev');
        console.error('  3. Start a meeting with the bot to populate data');
        await disconnectPrisma();
        process.exit(1);
    }
}

main();
