/**
 * Direct PostgreSQL Test
 * Tests raw pg connection bypassing Prisma
 */

import { Client } from 'pg';

async function testDirectConnection() {
    console.log('\n🔧 Testing Direct PostgreSQL Connection...\n');

    const connectionString = 'postgresql://meetingbot:supersecret@localhost:5432/meetingbotpoc';
    console.log(`📍 Connection string: ${connectionString.replace('supersecret', '***')}`);

    const client = new Client({ connectionString });

    try {
        console.log('⏳ Connecting...');
        await client.connect();
        console.log('✅ Connected successfully!');

        const result = await client.query('SELECT current_database(), current_user, version()');
        console.log('\n📊 Database Info:');
        console.log(`   Database: ${result.rows[0].current_database}`);
        console.log(`   User: ${result.rows[0].current_user}`);
        console.log(`   Version: ${result.rows[0].version.split(',')[0]}`);

        // Test a simple query
        const tables = await client.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
            LIMIT 5
        `);

        console.log(`\n📋 Sample tables (${tables.rows.length}):`);
        tables.rows.forEach(row => console.log(`   - ${row.tablename}`));

        await client.end();
        console.log('\n✅ Test completed successfully!\n');

    } catch (error: any) {
        console.error('\n❌ Connection failed:');
        console.error(`   Error: ${error.message}`);
        console.error(`   Code: ${error.code}`);
        console.error(`   Detail: ${error.detail || 'N/A'}`);
        console.error('\n');
        process.exit(1);
    }
}

testDirectConnection();
