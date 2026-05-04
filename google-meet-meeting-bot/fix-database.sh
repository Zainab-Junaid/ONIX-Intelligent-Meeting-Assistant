#!/bin/bash

# Add userId columns to the database
docker exec meetingbot-db psql -U meetingbot -d meetingbotpoc -c "ALTER TABLE \"MeetingTranscript\" ADD COLUMN \"userId\" TEXT;"
docker exec meetingbot-db psql -U meetingbot -d meetingbotpoc -c "ALTER TABLE \"MeetingSummary\" ADD COLUMN \"userId\" TEXT;"
docker exec meetingbot-db psql -U meetingbot -d meetingbotpoc -c "ALTER TABLE \"MeetingJob\" ADD COLUMN \"userId\" TEXT;"

# Update existing records with the user's ID
docker exec meetingbot-db psql -U meetingbot -d meetingbotpoc -c "UPDATE \"MeetingTranscript\" SET \"userId\" = '8Prqm4KENpMILEQ1DSdFovJEwZf1' WHERE \"userId\" IS NULL;"
docker exec meetingbot-db psql -U meetingbot -d meetingbotpoc -c "UPDATE \"MeetingSummary\" SET \"userId\" = '8Prqm4KENpMILEQ1DSdFovJEwZf1' WHERE \"userId\" IS NULL;"
docker exec meetingbot-db psql -U meetingbot -d meetingbotpoc -c "UPDATE \"MeetingJob\" SET \"userId\" = '8Prqm4KENpMILEQ1DSdFovJEwZf1' WHERE \"userId\" IS NULL;"

echo "Database schema updated successfully!"
