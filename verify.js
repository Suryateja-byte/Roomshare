const { PrismaClient } = require('@prisma/client');
try {
  require('dotenv').config();
} catch {
  // dotenv not required if env vars are set externally
}

const prisma = new PrismaClient();

async function main() {
  console.log('=== Roomshare DB Verification ===\n');

  // 1. Database connectivity
  console.log('1. Testing database connection...');
  await prisma.$queryRaw`SELECT 1`;
  console.log('   OK: Database connected\n');

  // 2. PostGIS extension
  console.log('2. Testing PostGIS extension...');
  const postgis = await prisma.$queryRaw`SELECT PostGIS_Version() as version`;
  console.log(`   OK: PostGIS ${postgis[0].version}\n`);

  // 3. Spatial data check (read-only)
  console.log('3. Checking spatial data...');
  const locationCount = await prisma.location.count();
  console.log(`   OK: ${locationCount} location(s) in database`);

  if (locationCount > 0) {
    const withCoords = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Location" WHERE coords IS NOT NULL
    `;
    console.log(`   OK: ${withCoords[0].count} location(s) with coordinates\n`);
  } else {
    console.log('   INFO: No locations yet (seed data to populate)\n');
  }

  console.log('=== All checks passed ===');
}

// Export for testing, run when invoked directly
module.exports = { main };

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('\nVERIFICATION FAILED:', error.message || error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
