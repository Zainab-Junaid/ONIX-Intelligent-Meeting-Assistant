/**
 * Database Seed Script - CommonJS Version
 * Creates the default tenant if it doesn't exist.
 * Run: npm run db:seed
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Default tenant configuration
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default-tenant-001';
const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || 'Default Organization';

async function seedDatabase() {
    console.log('🌱 Starting database seed...');

    try {
        // Create or update default tenant
        const tenant = await prisma.tenant.upsert({
            where: { id: DEFAULT_TENANT_ID },
            create: {
                id: DEFAULT_TENANT_ID,
                name: DEFAULT_TENANT_NAME,
                planType: 'free',
                domain: 'localhost',
            },
            update: {
                name: DEFAULT_TENANT_NAME,
            },
        });

        console.log(`✅ Default tenant ready: ${tenant.id} (${tenant.name})`);

        // Verify tenant count
        const tenantCount = await prisma.tenant.count();
        console.log(`📊 Total tenants in database: ${tenantCount}`);

    } catch (error) {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seedDatabase()
    .then(() => {
        console.log('✅ Database seed completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Seed error:', error);
        process.exit(1);
    });
