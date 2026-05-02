process.env.DATABASE_URL = "postgresql://meetingbot:supersecret@localhost:5433/meetingbotpoc";
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.meeting.findFirst({ orderBy: { createdAt: 'desc' } }).then(m => {
  console.log("LATEST_MEETING_ID:", m?.id);
  console.log("LATEST_MEETING_TITLE:", m?.title);
}).finally(() => prisma.$disconnect());
