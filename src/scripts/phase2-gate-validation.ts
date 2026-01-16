// @ts-nocheck - Uses sleepingSpot Prisma model not yet in schema
/**
 * Phase 2: Go/No-Go Gate Validation Script
 *
 * Validates that Phase 1 migration was applied correctly before backfill.
 *
 * Gates:
 * 1. Catalog checks - verify indexes, constraints, FKs exist
 * 2. Behavioral proofs - rollback-only tests that prove constraints work
 *
 * Usage:
 *   npx ts-node src/scripts/phase2-gate-validation.ts           # Catalog checks only
 *   npx ts-node src/scripts/phase2-gate-validation.ts --behavior # Include behavioral proofs
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface GateResult {
  gate: string;
  passed: boolean;
  details: string;
}

const results: GateResult[] = [];

function log(message: string): void {
  console.log(`[Gate Validation] ${message}`);
}

function pass(gate: string, details: string): void {
  results.push({ gate, passed: true, details });
  console.log(`  ✅ ${gate}: ${details}`);
}

function fail(gate: string, details: string): void {
  results.push({ gate, passed: false, details });
  console.log(`  ❌ ${gate}: ${details}`);
}

// ============================================================
// GATE 1: Verify Backstop Partial Unique Indexes Exist
// ============================================================
async function verifyBackstopIndexes(): Promise<void> {
  log("Gate 1: Verifying backstop partial unique indexes...");

  const indexes = await prisma.$queryRaw<
    Array<{ indexname: string; indexdef: string }>
  >`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('SleepingSpot', 'Booking')
      AND indexdef ILIKE '%WHERE%'
  `;

  const indexNames = indexes.map((i) => i.indexname);

  // Check for SleepingSpot active hold per booking
  if (indexNames.some((n) => n.includes("active_hold_per_booking"))) {
    pass("Backstop Index", "SleepingSpot_active_hold_per_booking_uniq exists");
  } else {
    fail("Backstop Index", "Missing SleepingSpot_active_hold_per_booking_uniq");
  }

  // Check for Booking one active v2 per tenant listing
  if (indexNames.some((n) => n.includes("one_active_v2_per_tenant"))) {
    pass(
      "Backstop Index",
      "Booking_one_active_v2_per_tenant_listing_uniq exists",
    );
  } else {
    fail(
      "Backstop Index",
      "Missing Booking_one_active_v2_per_tenant_listing_uniq",
    );
  }

  // Log all partial unique indexes for visibility
  log("  Found partial unique indexes:");
  for (const idx of indexes) {
    console.log(`    - ${idx.indexname}`);
  }
}

// ============================================================
// GATE 2: Verify CHECK Constraints Exist
// ============================================================
async function verifyCheckConstraints(): Promise<void> {
  log("Gate 2: Verifying CHECK constraints...");

  const constraints = await prisma.$queryRaw<
    Array<{ conname: string; conrelid: string }>
  >`
    SELECT c.conname, r.relname as conrelid
    FROM pg_constraint c
    JOIN pg_class r ON c.conrelid = r.oid
    WHERE c.contype = 'c'
      AND r.relname IN ('SleepingSpot', 'SpotWaitlist', 'Booking')
  `;

  const constraintNames = constraints.map((c) => c.conname);

  // SleepingSpot shape constraints
  const spotShapes = [
    "spot_available_shape",
    "spot_held_shape",
    "spot_under_offer_shape",
    "spot_filled_shape",
    "spot_maintenance_shape",
  ];
  for (const shape of spotShapes) {
    if (constraintNames.includes(shape)) {
      pass("CHECK Constraint", `${shape} exists`);
    } else {
      fail("CHECK Constraint", `Missing ${shape}`);
    }
  }

  // SpotWaitlist shape constraints
  const waitlistShapes = [
    "waitlist_queued_shape",
    "waitlist_notified_shape",
    "waitlist_converted_shape",
  ];
  for (const shape of waitlistShapes) {
    if (constraintNames.includes(shape)) {
      pass("CHECK Constraint", `${shape} exists`);
    } else {
      fail("CHECK Constraint", `Missing ${shape}`);
    }
  }

  // Booking v2 shape constraints
  const bookingShapes = [
    "booking_hold_offered_shape",
    "booking_under_offer_shape",
    "booking_move_in_confirmed_shape",
  ];
  for (const shape of bookingShapes) {
    if (constraintNames.includes(shape)) {
      pass("CHECK Constraint", `${shape} exists`);
    } else {
      fail("CHECK Constraint", `Missing ${shape}`);
    }
  }

  // Positive value constraints
  const positiveConstraints = [
    "spot_number_positive",
    "spot_version_positive",
    "waitlist_position_positive",
    "booking_version_positive",
  ];
  for (const constraint of positiveConstraints) {
    if (constraintNames.includes(constraint)) {
      pass("CHECK Constraint", `${constraint} exists`);
    } else {
      fail("CHECK Constraint", `Missing ${constraint}`);
    }
  }
}

// ============================================================
// GATE 3: Verify ON DELETE RESTRICT Foreign Keys
// ============================================================
async function verifyRestrictForeignKeys(): Promise<void> {
  log("Gate 3: Verifying ON DELETE RESTRICT foreign keys...");

  // confdeltype: 'r' = RESTRICT, 'c' = CASCADE, 'n' = SET NULL, 'a' = NO ACTION
  const fks = await prisma.$queryRaw<
    Array<{ conname: string; confdeltype: string }>
  >`
    SELECT c.conname, c.confdeltype
    FROM pg_constraint c
    JOIN pg_class r ON c.conrelid = r.oid
    WHERE c.contype = 'f'
      AND r.relname IN ('SleepingSpot', 'SpotWaitlist', 'Booking')
      AND c.conname LIKE '%Booking%'
  `;

  // Expected RESTRICT FKs
  const expectedRestrict = [
    "SleepingSpot_heldByBookingId_fkey",
    "SleepingSpot_filledByBookingId_fkey",
    "SpotWaitlist_bookingId_fkey",
    "Booking_spotId_fkey",
  ];

  for (const fkName of expectedRestrict) {
    const fk = fks.find((f) => f.conname === fkName);
    if (fk) {
      if (fk.confdeltype === "r") {
        pass("FK RESTRICT", `${fkName} is ON DELETE RESTRICT`);
      } else {
        fail(
          "FK RESTRICT",
          `${fkName} has confdeltype='${fk.confdeltype}' (expected 'r' for RESTRICT)`,
        );
      }
    } else {
      fail("FK RESTRICT", `Missing foreign key ${fkName}`);
    }
  }
}

// ============================================================
// GATE 4: Verify Enums Exist
// ============================================================
async function verifyEnums(): Promise<void> {
  log("Gate 4: Verifying enums...");

  const enums = await prisma.$queryRaw<Array<{ typname: string }>>`
    SELECT typname
    FROM pg_type
    WHERE typtype = 'e'
      AND typname IN ('SpotStatus', 'BookingStatusV2', 'WaitlistStatus')
  `;

  const enumNames = enums.map((e) => e.typname);

  for (const enumName of ["SpotStatus", "BookingStatusV2", "WaitlistStatus"]) {
    if (enumNames.includes(enumName)) {
      pass("Enum", `${enumName} exists`);
    } else {
      fail("Enum", `Missing ${enumName}`);
    }
  }
}

// ============================================================
// BEHAVIORAL PROOFS (Rollback-Only)
// These tests prove constraints work, then roll back
// ============================================================

async function behavioralProofs(): Promise<void> {
  log("Running behavioral proofs (rollback-only)...");

  // Proof 1: CHECK constraint rejects invalid spot shape
  await proofSpotCheckConstraint();

  // Proof 2: CHECK constraint rejects invalid waitlist shape
  await proofWaitlistCheckConstraint();

  // Proof 3: Backstop index prevents double-hold
  await proofBackstopIndex();
}

async function proofSpotCheckConstraint(): Promise<void> {
  log(
    "  Proof 1: Spot CHECK constraint rejects HELD without required fields...",
  );

  try {
    await prisma.$transaction(
      async (tx) => {
        // First create a listing to reference
        const listing = await tx.listing.create({
          data: {
            ownerId: "test-owner-gate-check",
            title: "Gate Test Listing",
            description: "For gate validation",
            price: 100,
            totalSlots: 1,
            availableSlots: 1,
          },
        });

        // Attempt to create spot with HELD status but missing heldByBookingId
        // This should fail due to spot_held_shape CHECK constraint
        try {
          await tx.$executeRaw`
            INSERT INTO "SleepingSpot" (id, "listingId", "spotNumber", status, version, "createdAt", "updatedAt")
            VALUES ('test-spot-gate', ${listing.id}, 1, 'HELD', 1, NOW(), NOW())
          `;
          fail(
            "Spot CHECK Proof",
            "INSERT succeeded but should have failed (HELD without heldByBookingId)",
          );
        } catch (error: unknown) {
          const err = error as { message?: string };
          if (err.message?.includes("spot_held_shape")) {
            pass(
              "Spot CHECK Proof",
              "CHECK constraint rejected HELD without required fields",
            );
          } else {
            fail("Spot CHECK Proof", `Unexpected error: ${err.message}`);
          }
        }

        // Force rollback
        throw new Error("ROLLBACK_PROOF");
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err.message !== "ROLLBACK_PROOF") {
      fail("Spot CHECK Proof", `Transaction error: ${err.message}`);
    }
  }
}

async function proofWaitlistCheckConstraint(): Promise<void> {
  log(
    "  Proof 2: Waitlist CHECK constraint rejects NOTIFIED without expiresAt...",
  );

  try {
    await prisma.$transaction(
      async (tx) => {
        // Create test data hierarchy
        const user = await tx.user.create({
          data: { email: "gate-test@example.com", name: "Gate Test" },
        });

        const listing = await tx.listing.create({
          data: {
            ownerId: user.id,
            title: "Gate Test Listing 2",
            description: "For gate validation",
            price: 100,
            totalSlots: 1,
            availableSlots: 1,
          },
        });

        const spot = await tx.sleepingSpot.create({
          data: {
            listingId: listing.id,
            spotNumber: 1,
            status: "AVAILABLE",
          },
        });

        // Attempt to create waitlist entry with NOTIFIED but no expiresAt
        // This should fail due to waitlist_notified_shape CHECK constraint
        try {
          await tx.$executeRaw`
            INSERT INTO "SpotWaitlist" (id, "spotId", "userId", status, position, "notifiedAt", "createdAt")
            VALUES ('test-waitlist-gate', ${spot.id}, ${user.id}, 'NOTIFIED', 1, NOW(), NOW())
          `;
          fail(
            "Waitlist CHECK Proof",
            "INSERT succeeded but should have failed (NOTIFIED without expiresAt)",
          );
        } catch (error: unknown) {
          const err = error as { message?: string };
          if (err.message?.includes("waitlist_notified_shape")) {
            pass(
              "Waitlist CHECK Proof",
              "CHECK constraint rejected NOTIFIED without expiresAt",
            );
          } else {
            fail("Waitlist CHECK Proof", `Unexpected error: ${err.message}`);
          }
        }

        throw new Error("ROLLBACK_PROOF");
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err.message !== "ROLLBACK_PROOF") {
      fail("Waitlist CHECK Proof", `Transaction error: ${err.message}`);
    }
  }
}

async function proofBackstopIndex(): Promise<void> {
  log(
    "  Proof 3: Backstop index prevents duplicate active bookings per tenant/listing...",
  );

  try {
    await prisma.$transaction(
      async (tx) => {
        // Create test user and listing
        const user = await tx.user.create({
          data: { email: "gate-backstop@example.com", name: "Backstop Test" },
        });

        const listing = await tx.listing.create({
          data: {
            ownerId: user.id,
            title: "Gate Backstop Test",
            description: "For backstop validation",
            price: 100,
            totalSlots: 2,
            availableSlots: 2,
          },
        });

        // Create two spots
        const spot1 = await tx.sleepingSpot.create({
          data: { listingId: listing.id, spotNumber: 1, status: "AVAILABLE" },
        });

        const spot2 = await tx.sleepingSpot.create({
          data: { listingId: listing.id, spotNumber: 2, status: "AVAILABLE" },
        });

        const startDate = new Date();
        const endDate = new Date(
          startDate.getTime() + 30 * 24 * 60 * 60 * 1000,
        );

        // Create first booking with active v2 status
        await tx.booking.create({
          data: {
            listingId: listing.id,
            tenantId: user.id,
            startDate,
            endDate,
            status: "PENDING",
            totalPrice: 100,
            spotId: spot1.id,
            statusV2: "HOLD_OFFERED",
            holdOfferedAt: new Date(),
            holdExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        // Attempt second booking with active v2 status (same tenant, same listing)
        // This should fail due to Booking_one_active_v2_per_tenant_listing_uniq
        try {
          await tx.booking.create({
            data: {
              listingId: listing.id,
              tenantId: user.id,
              startDate: new Date(startDate.getTime() + 1000), // Different dates to avoid unique constraint
              endDate: new Date(endDate.getTime() + 1000),
              status: "PENDING",
              totalPrice: 100,
              spotId: spot2.id,
              statusV2: "UNDER_OFFER",
              offerAcceptedAt: new Date(),
              offerExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });
          fail(
            "Backstop Index Proof",
            "Second booking succeeded but should have failed (duplicate active v2)",
          );
        } catch (error: unknown) {
          const err = error as { message?: string; code?: string };
          if (err.code === "P2002" || err.message?.includes("unique")) {
            pass(
              "Backstop Index Proof",
              "Backstop index prevented duplicate active booking per tenant/listing",
            );
          } else {
            fail("Backstop Index Proof", `Unexpected error: ${err.message}`);
          }
        }

        throw new Error("ROLLBACK_PROOF");
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err.message !== "ROLLBACK_PROOF") {
      fail("Backstop Index Proof", `Transaction error: ${err.message}`);
    }
  }
}

// ============================================================
// MAIN
// ============================================================
async function main(): Promise<void> {
  const runBehavior = process.argv.includes("--behavior");

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" Phase 2: Go/No-Go Gate Validation");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log();

  // Catalog checks (always run)
  await verifyEnums();
  await verifyBackstopIndexes();
  await verifyCheckConstraints();
  await verifyRestrictForeignKeys();

  // Behavioral proofs (optional)
  if (runBehavior) {
    console.log();
    await behavioralProofs();
  } else {
    console.log();
    log("Skipping behavioral proofs (use --behavior to run)");
  }

  // Summary
  console.log();
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" SUMMARY");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log();

  if (failed > 0) {
    console.log("❌ GATES FAILED - Do NOT proceed with backfill");
    console.log();
    console.log("Failed gates:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.gate}: ${r.details}`);
    }
    process.exit(1);
  } else {
    console.log("✅ ALL GATES PASSED - Safe to proceed with backfill");
    process.exit(0);
  }
}

main()
  .catch((error) => {
    console.error("Gate validation failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
