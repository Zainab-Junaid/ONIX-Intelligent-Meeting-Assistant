/**
 * Database seed script for initializing required base data.
 * 
 * This script creates:
 * - Default tenant (required for single-tenant mode)
 * 
 * Run: npx ts-node scripts/seed-database.ts
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME } from '../src/config/constants';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...\n');

    // ============================================================================
    // 1. Create Default Tenant (if not exists)
    // ============================================================================

    const existingTenant = await prisma.tenant.findUnique({
        where: { id: DEFAULT_TENANT_ID },
    });

    if (existingTenant) {
        console.log(`✅ Default tenant already exists: ${existingTenant.name} (${existingTenant.id})`);
    } else {
        const tenant = await prisma.tenant.create({
            data: {
                id: DEFAULT_TENANT_ID,
                name: DEFAULT_TENANT_NAME,
                planType: 'free',
            },
        });
        console.log(`✅ Created default tenant: ${tenant.name} (${tenant.id})`);
    }

    // ============================================================================
    // 2. Verify tenant count
    // ============================================================================

    const tenantCount = await prisma.tenant.count();
    console.log(`\n📊 Total tenants in database: ${tenantCount}`);

    console.log('\n🎉 Database seeding complete!');
}

main()
    .catch((error) => {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
