/**
 * Full-Text Search (FTS) Database Assertions
 *
 * Self-contained tests that verify FTS infrastructure directly against PostgreSQL.
 * These tests create their own test data and clean up after themselves.
 *
 * Gate: RUN_DB_ASSERTIONS=1 pnpm test src/__tests__/lib/search/fts-db.test.ts
 *
 * FK Chain: User → Listing → listing_search_docs
 * Cleanup order: listing_search_docs → Listing → User (reverse FK order)
 *
 * @see prisma/migrations/20260116000000_search_doc_fts/migration.sql
 */

import { prisma } from "@/lib/prisma";

const runDbTests = process.env.RUN_DB_ASSERTIONS === "1";
const describeDb = runDbTests ? describe : describe.skip;

// Unique prefix to identify test rows for cleanup
const TEST_PREFIX = `fts-test-${Date.now()}`;

describeDb("FTS Database Assertions", () => {
  // Track created IDs for cleanup
  const createdListingIds: string[] = [];
  const createdUserIds: string[] = [];

  /**
   * Helper: Create a test User (Listing requires ownerId FK)
   */
  async function createTestUser(suffix: string): Promise<string> {
    const userId = `${TEST_PREFIX}-user-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO "User" ("id", "email", "name", "createdAt")
      VALUES (${userId}, ${`${userId}@test.local`}, ${"Test User"}, NOW())
    `;
    createdUserIds.push(userId);
    return userId;
  }

  /**
   * Helper: Create a test Listing (listing_search_docs requires id FK)
   */
  async function createTestListing(
    suffix: string,
    ownerId: string,
    overrides: { title?: string; description?: string } = {}
  ): Promise<string> {
    const listingId = `${TEST_PREFIX}-listing-${suffix}`;
    const title = overrides.title ?? "Test Listing Title";
    const description = overrides.description ?? "Test listing description";

    await prisma.$executeRaw`
      INSERT INTO "Listing" (
        "id", "ownerId", "title", "description", "price",
        "amenities", "houseRules", "totalSlots", "availableSlots",
        "createdAt", "updatedAt"
      ) VALUES (
        ${listingId}, ${ownerId}, ${title}, ${description}, ${1000},
        ARRAY[]::TEXT[], ARRAY[]::TEXT[], ${1}, ${1},
        NOW(), NOW()
      )
    `;
    createdListingIds.push(listingId);
    return listingId;
  }

  /**
   * Helper: Create a listing_search_docs row (trigger will populate search_tsv)
   */
  async function createTestSearchDoc(
    listingId: string,
    ownerId: string,
    fields: {
      title: string;
      description: string;
      city: string;
      state: string;
    }
  ): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO "listing_search_docs" (
        "id", "owner_id", "title", "description", "price",
        "images", "amenities", "house_rules", "household_languages",
        "total_slots", "available_slots", "address", "city", "state", "zip",
        "listing_created_at", "doc_created_at", "doc_updated_at"
      ) VALUES (
        ${listingId}, ${ownerId}, ${fields.title}, ${fields.description}, ${1000},
        ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[],
        ${1}, ${1}, ${"123 Test St"}, ${fields.city}, ${fields.state}, ${"12345"},
        NOW(), NOW(), NOW()
      )
    `;
  }

  /**
   * Cleanup: Delete in reverse FK order
   */
  afterAll(async () => {
    // 1. Delete listing_search_docs (child of Listing)
    if (createdListingIds.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM "listing_search_docs"
        WHERE "id" = ANY(${createdListingIds})
      `;
    }

    // 2. Delete Listings (child of User)
    if (createdListingIds.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM "Listing"
        WHERE "id" = ANY(${createdListingIds})
      `;
    }

    // 3. Delete Users (root)
    if (createdUserIds.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM "User"
        WHERE "id" = ANY(${createdUserIds})
      `;
    }

    await prisma.$disconnect();
  });

  // ============================================================
  // CHECK 1: Backfill Verification (trigger populates search_tsv)
  // ============================================================
  describe("CHECK 1: Trigger populates search_tsv on INSERT", () => {
    it("search_tsv is NOT NULL after INSERT", async () => {
      const userId = await createTestUser("backfill-1");
      const listingId = await createTestListing("backfill-1", userId);

      await createTestSearchDoc(listingId, userId, {
        title: "Downtown Apartment",
        description: "Cozy place near transit",
        city: "Seattle",
        state: "WA",
      });

      const result = await prisma.$queryRaw<{ has_tsv: boolean }[]>`
        SELECT "search_tsv" IS NOT NULL AS has_tsv
        FROM "listing_search_docs"
        WHERE "id" = ${listingId}
      `;

      expect(result).toHaveLength(1);
      expect(result[0].has_tsv).toBe(true);
    });
  });

  // ============================================================
  // CHECK 2: Verify GIN Index Exists
  // ============================================================
  describe("CHECK 2: GIN index exists on search_tsv", () => {
    it("search_doc_tsv_gin_idx exists and uses GIN", async () => {
      const result = await prisma.$queryRaw<
        { indexname: string; indexdef: string }[]
      >`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'listing_search_docs'
          AND indexname = 'search_doc_tsv_gin_idx'
      `;

      expect(result).toHaveLength(1);
      expect(result[0].indexdef).toContain("USING gin");
      expect(result[0].indexdef).toContain("search_tsv");
    });
  });

  // ============================================================
  // CHECK 3: Null-Safe tsvector Build (COALESCE protection)
  // ============================================================
  describe("CHECK 3: Null-safe tsvector build", () => {
    it("row with empty description still has valid search_tsv", async () => {
      const userId = await createTestUser("nullsafe-1");
      const listingId = await createTestListing("nullsafe-1", userId, {
        description: "",
      });

      await createTestSearchDoc(listingId, userId, {
        title: "Sunny Beach House",
        description: "", // Empty string (description is NOT NULL)
        city: "Miami",
        state: "FL",
      });

      const result = await prisma.$queryRaw<{ has_tsv: boolean }[]>`
        SELECT "search_tsv" IS NOT NULL AS has_tsv
        FROM "listing_search_docs"
        WHERE "id" = ${listingId}
      `;

      expect(result).toHaveLength(1);
      expect(result[0].has_tsv).toBe(true);
    });

    it("row with empty description matches on title", async () => {
      const userId = await createTestUser("nullsafe-2");
      const listingId = await createTestListing("nullsafe-2", userId, {
        title: "Cozy Mountain Cabin",
        description: "",
      });

      await createTestSearchDoc(listingId, userId, {
        title: "Cozy Mountain Cabin",
        description: "",
        city: "Denver",
        state: "CO",
      });

      const result = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "listing_search_docs"
        WHERE "id" = ${listingId}
          AND "search_tsv" @@ plainto_tsquery('english', 'cozy mountain')
      `;

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(listingId);
    });
  });

  // ============================================================
  // CHECK 4: Query Normalization (plainto_tsquery behavior)
  // ============================================================
  describe("CHECK 4: plainto_tsquery AND semantics", () => {
    it("multi-word query requires ALL terms (AND semantics)", async () => {
      const userId = await createTestUser("query-1");

      // Listing A: has both "cozy" and "downtown"
      const listingA = await createTestListing("query-both", userId, {
        title: "Cozy Downtown Loft",
      });
      await createTestSearchDoc(listingA, userId, {
        title: "Cozy Downtown Loft",
        description: "Great location",
        city: "Portland",
        state: "OR",
      });

      // Listing B: has only "cozy", not "downtown"
      const listingB = await createTestListing("query-partial", userId, {
        title: "Cozy Suburban Home",
      });
      await createTestSearchDoc(listingB, userId, {
        title: "Cozy Suburban Home",
        description: "Quiet neighborhood",
        city: "Salem",
        state: "OR",
      });

      // Query for "cozy downtown" should only match Listing A
      const result = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "listing_search_docs"
        WHERE "id" IN (${listingA}, ${listingB})
          AND "search_tsv" @@ plainto_tsquery('english', 'cozy downtown')
      `;

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(listingA);
    });

    it("case-insensitive matching", async () => {
      const userId = await createTestUser("query-case");
      const listingId = await createTestListing("query-case", userId, {
        title: "Luxury Penthouse Suite",
      });

      await createTestSearchDoc(listingId, userId, {
        title: "Luxury Penthouse Suite",
        description: "Top floor views",
        city: "Chicago",
        state: "IL",
      });

      // Query with different case should still match
      const result = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "listing_search_docs"
        WHERE "id" = ${listingId}
          AND "search_tsv" @@ plainto_tsquery('english', 'LUXURY PENTHOUSE')
      `;

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(listingId);
    });
  });

  // ============================================================
  // CHECK 6: Trigger is Column-Specific
  // ============================================================
  describe("CHECK 6: Trigger is column-specific", () => {
    it("trigger definition includes UPDATE OF clause", async () => {
      const result = await prisma.$queryRaw<{ definition: string }[]>`
        SELECT pg_get_triggerdef(oid) AS definition
        FROM pg_trigger
        WHERE tgrelid = 'listing_search_docs'::regclass
          AND tgname = 'search_doc_tsv_trigger'
      `;

      expect(result).toHaveLength(1);
      const definition = result[0].definition;

      // Verify column-specific UPDATE (not all columns)
      expect(definition).toContain("UPDATE OF");
      // Trigger only fires for these 4 columns
      expect(definition.toLowerCase()).toContain("title");
      expect(definition.toLowerCase()).toContain("description");
      expect(definition.toLowerCase()).toContain("city");
      expect(definition.toLowerCase()).toContain("state");
    });
  });
});
