/**
 * Test 1: PostgreSQL Connection
 * 
 * Run: npx ts-node tests/01-test-postgres.ts
 */

import { prisma, disconnectPrisma } from '../src/lib/prisma';

async function main() {
    console.log('\n📊 TEST 1: PostgreSQL Connection\n' + '='.repeat(50));

    try {
        // Test 1.1: Basic connection
        console.log('1.1 Testing connection...');
        await prisma.$connect();
        console.log('    ✅ PostgreSQL connected successfully');

        // Test 1.2: Meeting table
        console.log('1.2 Testing Meeting table...');
        const meetingCount = await prisma.meeting.count();
        console.log(`    ✅ Meeting table accessible (${meetingCount} rows)`);

        // Test 1.3: MeetingJob table
        console.log('1.3 Testing MeetingJob table...');
        const jobCount = await prisma.meetingJob.count();
        console.log(`    ✅ MeetingJob table accessible (${jobCount} rows)`);

        // Test 1.4: MeetingSummary table
        console.log('1.4 Testing MeetingSummary table...');
        const summaryCount = await prisma.meetingSummary.count();
        console.log(`    ✅ MeetingSummary table accessible (${summaryCount} rows)`);

        // Test 1.5: Tenant table
        console.log('1.5 Testing Tenant table...');
        const tenantCount = await prisma.tenant.count();
        console.log(`    ✅ Tenant table accessible (${tenantCount} rows)`);

        // Test 1.6: Graceful disconnect
        console.log('1.6 Testing graceful disconnect...');
        await disconnectPrisma();
        console.log('    ✅ Prisma disconnected gracefully');

        console.log('\n✅ ALL POSTGRESQL TESTS PASSED!\n');

    } catch (error: any) {
        console.error('\n❌ POSTGRESQL TEST FAILED!');
        console.error('Error:', error.message);
        console.error('\nPossible fixes:');
        console.error('  1. Is PostgreSQL running? Check: netstat -ano | findstr :5432');
        console.error('  2. Is DATABASE_URL correct in .env?');
        console.error('  3. Run: npx prisma generate --schema=src/backend/schema.prisma');
        console.error('  4. Run: npx prisma migrate dev --schema=src/backend/schema.prisma');
        process.exit(1);
    }
}

main();
