const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://meetingbot:supersecret@localhost:5433/meetingbotpoc');
  await client.connect();
  const meetingId = '8fb8cdff-6ac0-460c-a527-81a6aa170798';
  console.log('Deleting old summary...');
  await client.query('DELETE FROM "MeetingSummary" WHERE "meetingId" = $1', [meetingId]);
  console.log('Deleted old summary');
  await client.end();
  
  console.log('Calling generate-summary API...');
  const res = await fetch(`http://127.0.0.1:3001/debug/generate-summary/${meetingId}`, { method: 'POST' });
  const data = await res.json();
  console.log('API Response:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
