const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://meetingbot:supersecret@localhost:5433/meetingbotpoc');
  await client.connect();
  const res = await client.query('SELECT COUNT(*) FROM "Meeting"');
  console.log('Meetings in Postgres:', res.rows[0].count);
  await client.end();
}

main().catch(console.error);
