/**
 * Quick Test - All 3 Databases via localhost
 * 
 * Run: npx tsx tests/quick-test-all.ts
 * 
 * Tests PostgreSQL, MongoDB, and Redis from OUTSIDE Docker
 */

import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import Redis from 'ioredis';

async function main() {
    console.log('\n🧪 QUICK TEST - All 3 Databases (via localhost)\n' + '='.repeat(55));

    // ============ PostgreSQL ============
    console.log('\n📊 1. PostgreSQL (localhost:5432)...');
    const prisma = new PrismaClient({
        datasources: {
            db: { url: 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc' }
        }
    });

    try {
        await prisma.$connect();
        const meetingCount = await prisma.meeting.count().catch(() => 0);
        const jobCount = await prisma.meetingJob.count();
        const summaryCount = await prisma.meetingSummary.count().catch(() => 0);
        console.log(`   ✅ Connected! Meetings: ${meetingCount}, Jobs: ${jobCount}, Summaries: ${summaryCount}`);
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
    } finally {
        await prisma.$disconnect();
    }

    // ============ MongoDB ============
    console.log('\n📦 2. MongoDB (localhost:27017)...');
    try {
        await mongoose.connect('mongodb://localhost:27017/meeting-transcripts', {
            serverSelectionTimeoutMS: 5000
        });

        // Check for transcripts collection
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const transcriptColl = collections.find(c => c.name === 'meetingtranscripts');

        if (transcriptColl) {
            const count = await db.collection('meetingtranscripts').countDocuments();
            console.log(`   ✅ Connected! Transcripts: ${count}`);

            if (count > 0) {
                const sample = await db.collection('meetingtranscripts').findOne();
                console.log(`   📝 Sample: "${sample?.meetingTitle || 'Untitled'}" - ${sample?.segments?.length || 0} segments`);
            }
        } else {
            console.log(`   ✅ Connected! No transcripts collection yet (run a meeting first)`);
        }

        await mongoose.disconnect();
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
    }

    // ============ Redis ============
    console.log('\n⚡ 3. Redis (localhost:6379)...');
    const redis = new Redis({
        host: 'localhost',
        port: 6379,
        connectTimeout: 5000,
        lazyConnect: true
    });

    try {
        await redis.connect();
        const pong = await redis.ping();
        const activeMeetings = await redis.smembers('active_meetings');
        const bufferKeys = await redis.keys('meeting:*:buffer');
        console.log(`   ✅ Connected! Ping: ${pong}`);
        console.log(`   📋 Active meetings: ${activeMeetings.length}, Buffers: ${bufferKeys.length}`);

        if (bufferKeys.length > 0) {
            console.log('   ⚡ LIVE DATA IN REDIS (meeting in progress):');
            for (const key of bufferKeys.slice(0, 3)) {
                const len = await redis.llen(key);
                console.log(`      - ${key}: ${len} items`);
            }
        }

        await redis.quit();
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
    }

    console.log('\n' + '='.repeat(55));
    console.log('✅ TEST COMPLETE!\n');
}

main().catch(console.error);
