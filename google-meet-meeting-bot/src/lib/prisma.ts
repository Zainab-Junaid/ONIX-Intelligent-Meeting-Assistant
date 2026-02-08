/**
 * Singleton Prisma Client
 * 
 * Provides a single shared PrismaClient instance across all modules.
 * Prevents connection pool leaks from multiple instantiations.
 * Includes graceful shutdown handlers.
 */
import { PrismaClient } from "@prisma/client";

// Use global to preserve instance across hot reloads in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

// Graceful shutdown handlers
async function disconnectPrisma() {
    console.log("🔌 Disconnecting Prisma...");
    await prisma.$disconnect();
    console.log("✅ Prisma disconnected");
}

// Handle various shutdown signals
process.on("SIGTERM", async () => {
    await disconnectPrisma();
    process.exit(0);
});

process.on("SIGINT", async () => {
    await disconnectPrisma();
    process.exit(0);
});

process.on("beforeExit", async () => {
    await disconnectPrisma();
});

// Export for testing/manual disconnect
export { disconnectPrisma };
