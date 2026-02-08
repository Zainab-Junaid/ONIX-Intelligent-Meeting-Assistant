/**
 * Test 6: API Endpoints
 * 
 * Run: npx ts-node tests/06-test-api-endpoints.ts
 * 
 * ⚠️ REQUIRES: Backend server running on port 3001
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function testEndpoint(name: string, url: string, options?: RequestInit) {
    try {
        const response = await fetch(url, {
            ...options,
            signal: AbortSignal.timeout(5000)
        });
        const data = await response.json();
        return { success: response.ok, status: response.status, data };
    } catch (error: any) {
        return { success: false, status: 0, error: error.message };
    }
}

async function main() {
    console.log('\n🛜 TEST 6: API Endpoints\n' + '='.repeat(50));
    console.log(`Testing against: ${BACKEND_URL}\n`);

    // Test 6.1: Health check / root
    console.log('6.1 Testing backend is reachable...');
    const root = await testEndpoint('root', `${BACKEND_URL}/`);
    if (root.status === 404 || root.success) {
        console.log('    ✅ Backend is running');
    } else {
        console.log('    ❌ Backend not reachable');
        console.log('    Error:', root.error || 'Connection failed');
        console.log('\n⚠️ Start the backend first: npm run dev\n');
        process.exit(1);
    }

    // Test 6.2: /list/meetings endpoint
    console.log('6.2 Testing /list/meetings...');
    const listMeetings = await testEndpoint('list', `${BACKEND_URL}/list/meetings`);
    if (listMeetings.success) {
        const count = Array.isArray(listMeetings.data) ? listMeetings.data.length : 0;
        console.log(`    ✅ Endpoint works (${count} meetings returned)`);
        if (count > 0) {
            const sample = listMeetings.data[0];
            console.log(`    Sample: ${sample.title || 'Untitled'} - Status: ${sample.status}`);
        }
    } else {
        console.log(`    ❌ Failed (${listMeetings.status}): ${listMeetings.error || JSON.stringify(listMeetings.data)}`);
    }

    // Test 6.3: /meeting-job/:id endpoint
    console.log('6.3 Testing /meeting-job/:id...');
    const jobTest = await testEndpoint('job', `${BACKEND_URL}/meeting-job/test-id`);
    if (jobTest.status === 404) {
        console.log('    ✅ Endpoint works (returned 404 for non-existent ID - expected)');
    } else if (jobTest.success) {
        console.log('    ✅ Endpoint works');
    } else {
        console.log(`    ❌ Failed: ${jobTest.error}`);
    }

    // Test 6.4: /api/meetings/:id/transcript endpoint
    console.log('6.4 Testing /api/meetings/:id/transcript...');
    const transcriptTest = await testEndpoint('transcript', `${BACKEND_URL}/api/meetings/test-id/transcript`);
    if (transcriptTest.status === 404) {
        console.log('    ✅ Endpoint works (returned 404 for non-existent ID - expected)');
    } else if (transcriptTest.success) {
        console.log('    ✅ Endpoint works');
        console.log(`    Segments: ${transcriptTest.data?.segments?.length || 0}`);
    } else {
        console.log(`    ❌ Failed: ${transcriptTest.error}`);
    }

    // Test 6.5: Summary endpoint
    console.log('6.5 Testing /update-summary/:id (PUT)...');
    const summaryTest = await testEndpoint('summary', `${BACKEND_URL}/update-summary/test-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryText: 'Test summary' })
    });
    if (summaryTest.status === 404 || summaryTest.status === 400) {
        console.log('    ✅ Endpoint reachable (returned expected error for test ID)');
    } else if (summaryTest.success) {
        console.log('    ✅ Endpoint works');
    } else {
        console.log(`    ⚠️ Status ${summaryTest.status}: ${summaryTest.error || JSON.stringify(summaryTest.data)}`);
    }

    // Test 6.6: Debug endpoint
    console.log('6.6 Testing /debug/transcripts...');
    const debugTest = await testEndpoint('debug', `${BACKEND_URL}/debug/transcripts`);
    if (debugTest.success) {
        const count = Array.isArray(debugTest.data) ? debugTest.data.length : 0;
        console.log(`    ✅ Debug endpoint works (${count} transcripts)`);
    } else {
        console.log(`    ⚠️ Debug endpoint: ${debugTest.status}`);
    }

    console.log('\n✅ ALL API ENDPOINT TESTS COMPLETE!\n');
}

main().catch(console.error);
