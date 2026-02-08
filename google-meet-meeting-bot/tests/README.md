# Test Suite - Run Commands

## Individual Tests (Run in Order)

Each test is isolated so you can identify exactly where failures occur.

```bash
cd google-meet-meeting-bot

# Test 1: PostgreSQL Connection
npx ts-node tests/01-test-postgres.ts

# Test 2: MongoDB Connection  
npx ts-node tests/02-test-mongodb.ts

# Test 3: Redis Connection
npx ts-node tests/03-test-redis.ts

# Test 4: Meeting Lifecycle (requires PostgreSQL)
npx ts-node tests/04-test-meeting-lifecycle.ts

# Test 5: Full Data Pipeline (requires all 3 DBs + some data)
npx ts-node tests/05-test-data-pipeline.ts

# Test 6: API Endpoints (requires backend running)
# First: npm run dev (in another terminal)
npx ts-node tests/06-test-api-endpoints.ts

# Run ALL tests at once
npx ts-node tests/integration-test-suite.ts
```

## Expected Results

### If No Meetings Yet:
- Tests 1-3: Should PASS (connections work)
- Tests 4-5: Will show "0 meetings" or "No data yet"
- Test 6: Requires backend running

### After Running a Meeting:
- All tests should show data
- PostgreSQL: Meeting records with status
- MongoDB: Transcripts with segments
- Redis: May be empty (data flushed)

## Troubleshooting

| Test | Common Error | Fix |
|------|--------------|-----|
| 01 | "Connection refused" | Start PostgreSQL, check port 5432 |
| 02 | "Connection refused" | Start MongoDB, check port 27017 |
| 03 | "Connection refused" | Start Redis, check port 6379 |
| 04 | "'meeting' does not exist" | Run `npx prisma generate` |
| 05 | "No data" | Run a meeting with the bot first |
| 06 | "Backend not reachable" | Run `npm run dev` first |
