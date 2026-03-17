// @ts-nocheck
/**
 * Critical User Flow Simulator
 *
 * Simulates the exact flow: semantic search → pagination → filter → verify results
 * Tests result correctness at each step by inspecting similarity scores and ranking.
 *
 * Usage: npx tsx src/scripts/simulate-user-flow.ts
 */

import { executeSearchV2 } from "../lib/search/search-v2-service";
import { getCachedQueryEmbedding } from "../lib/embeddings/query-cache";
import { PrismaClient } from "@prisma/client";
import pgvector from "pgvector";

const prisma = new PrismaClient();

// Helpers
const PASS = "✅ PASS";
const FAIL = "❌ FAIL";
const WARN = "⚠️  WARN";

function assert(condition: boolean, msg: string): boolean {
  console.log(`  ${condition ? PASS : FAIL}: ${msg}`);
  return condition;
}

function section(title: string) {
  console.log(`\n${"━".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"━".repeat(70)}`);
}

// ============================================================
// STEP 1: Semantic Search — Verify results are ranked correctly
// ============================================================
async function step1_semanticSearch() {
  section("STEP 1: Semantic Search — Initial Query");

  const query = "sunny room with parking";
  console.log(`\n  Query: "${query}"`);
  console.log(`  Sort: recommended`);
  console.log(`  Bounds: San Francisco area\n`);

  const result = await executeSearchV2({
    rawParams: {
      what: query,
      q: query,
      lat: "37.77",
      lng: "-122.42",
      sort: "recommended",
    },
    includeMap: true,
  });

  if (!result.response) {
    console.log(`  ${FAIL}: No response from V2 search`);
    console.log(`  Error: ${result.error || "unknown"}`);
    return null;
  }

  const listings = result.response.list?.items || [];
  const mapData = result.response.map;
  const total = result.response.list?.totalCount;
  const nextCursor = result.response.list?.nextCursor;

  console.log(`  Results: ${listings.length} items, total: ${total || "null"}`);
  console.log(`  Next cursor: ${nextCursor ? "present" : "none"}`);
  console.log(`  Map pins: ${mapData?.features?.length || 0}\n`);

  // Verify result count
  assert(listings.length === 12, `First page has ${listings.length} items (expected 12)`);
  assert(!!nextCursor, "Next cursor exists for pagination");

  // Verify top result is the most relevant
  const topTitle = listings[0]?.title || "";
  console.log(`\n  Top 5 results:`);
  for (let i = 0; i < Math.min(5, listings.length); i++) {
    const l = listings[i];
    const amenities = (l as any).amenities?.slice(0, 3).join(", ") || "?";
    console.log(`    #${i + 1}: ${l.title} — $${l.price}/mo — ${amenities}`);
  }

  // Check if "Sunny Mission Room" is in top 5 (it should be — it matches all query terms)
  const sunnyInTop5 = listings.slice(0, 5).some((l) => l.title.includes("Sunny"));
  assert(sunnyInTop5, `"Sunny Mission Room" is in top 5 (matches all query terms)`);

  // Verify map has data
  const mapPinCount = mapData?.features?.length || 0;
  assert(mapPinCount > 0, `Map has ${mapPinCount} pins (not empty)`);

  // Track IDs for dedup verification
  const page1Ids = new Set(listings.map((l) => l.id));
  assert(page1Ids.size === listings.length, `No duplicates in page 1 (${page1Ids.size} unique)`);

  return { nextCursor, page1Ids, listings, mapPinCount };
}

// ============================================================
// STEP 2: Pagination — Load more and verify dedup
// ============================================================
async function step2_pagination(cursor: string, seenIds: Set<string>) {
  section("STEP 2: Pagination — Load More (Page 2)");

  const result = await executeSearchV2({
    rawParams: {
      what: "sunny room with parking",
      q: "sunny room with parking",
      lat: "37.77",
      lng: "-122.42",
      sort: "recommended",
      cursor: cursor,
    },
    includeMap: false,
  });

  if (!result.response) {
    console.log(`  ${FAIL}: No response for page 2`);
    return null;
  }

  const listings = result.response.list?.items || [];
  const nextCursor = result.response.list?.nextCursor;

  console.log(`  Page 2 results: ${listings.length} items`);
  console.log(`  Next cursor: ${nextCursor ? "present" : "none"}\n`);

  assert(listings.length > 0, `Page 2 has results (${listings.length})`);

  // Check for duplicates with page 1
  const page2Ids = new Set(listings.map((l) => l.id));
  const duplicates = listings.filter((l) => seenIds.has(l.id));
  assert(duplicates.length === 0, `No duplicates between page 1 and page 2 (found ${duplicates.length})`);

  if (duplicates.length > 0) {
    console.log(`  Duplicate IDs: ${duplicates.map((l) => l.title).join(", ")}`);
  }

  // Merge IDs
  const allIds = new Set([...seenIds, ...page2Ids]);

  console.log(`\n  Total accumulated: ${allIds.size} listings`);

  // Show page 2 top results
  console.log(`  Page 2 top 3:`);
  for (let i = 0; i < Math.min(3, listings.length); i++) {
    console.log(`    #${i + 1}: ${listings[i].title} — $${listings[i].price}/mo`);
  }

  return { nextCursor, allIds };
}

// ============================================================
// STEP 3: Apply Filter — "Pet Friendly" while still semantic
// ============================================================
async function step3_applyFilter() {
  section("STEP 3: Apply Filter — 'Pet Friendly' (houseRules=Pets allowed)");

  const result = await executeSearchV2({
    rawParams: {
      what: "sunny room with parking",
      q: "sunny room with parking",
      lat: "37.77",
      lng: "-122.42",
      sort: "recommended",
      houseRules: "Pets allowed",
    },
    includeMap: true,
  });

  if (!result.response) {
    console.log(`  ${FAIL}: No response after filter`);
    return null;
  }

  const listings = result.response.list?.items || [];
  const mapData = result.response.map;
  const nextCursor = result.response.list?.nextCursor;

  console.log(`  Filtered results: ${listings.length} items`);
  console.log(`  Next cursor: ${nextCursor ? "present" : "none"}`);
  console.log(`  Map pins: ${mapData?.features?.length || 0}\n`);

  // Verify all results have "Pets allowed"
  let allPetFriendly = true;
  for (const l of listings) {
    const rules = (l as any).houseRules || [];
    if (!rules.some((r: string) => r.toLowerCase().includes("pet"))) {
      allPetFriendly = false;
      console.log(`  ${FAIL}: "${l.title}" does NOT have Pets allowed`);
    }
  }
  assert(allPetFriendly, "All results have 'Pets allowed' house rule");
  assert(listings.length < 12 || listings.length === 12, `Filtered results ≤ 12 (got ${listings.length})`);

  // Verify map still has data
  const mapPins = mapData?.features?.length || 0;
  assert(mapPins > 0, `Map has ${mapPins} pins after filter`);

  // Check IDs are fresh (no contamination from previous pages)
  const filterIds = new Set(listings.map((l) => l.id));
  assert(filterIds.size === listings.length, `No duplicates in filtered results`);

  console.log(`\n  Top 3 filtered results:`);
  for (let i = 0; i < Math.min(3, listings.length); i++) {
    const l = listings[i];
    const rules = (l as any).houseRules || [];
    console.log(`    #${i + 1}: ${l.title} — $${l.price}/mo — Rules: ${rules.join(", ")}`);
  }

  return { nextCursor, filterIds };
}

// ============================================================
// STEP 4: Paginate after filter
// ============================================================
async function step4_paginateAfterFilter(cursor: string | null, filterIds: Set<string>) {
  section("STEP 4: Paginate After Filter");

  if (!cursor) {
    console.log(`  ${WARN}: No cursor available — fewer results than page size after filter`);
    console.log(`  This is expected when filter narrows results below 12`);
    return;
  }

  const result = await executeSearchV2({
    rawParams: {
      what: "sunny room with parking",
      q: "sunny room with parking",
      lat: "37.77",
      lng: "-122.42",
      sort: "recommended",
      houseRules: "Pets allowed",
      cursor: cursor,
    },
    includeMap: false,
  });

  if (!result.response) {
    console.log(`  ${FAIL}: No response for filtered page 2`);
    return;
  }

  const listings = result.response.list?.items || [];
  console.log(`  Filtered page 2: ${listings.length} items\n`);

  // Check no duplicates with filtered page 1
  const duplicates = listings.filter((l) => filterIds.has(l.id));
  assert(duplicates.length === 0, `No duplicates between filtered pages (found ${duplicates.length})`);
}

// ============================================================
// STEP 5: Remove filter — verify params preserved
// ============================================================
async function step5_removeFilter() {
  section("STEP 5: Remove Filter — Verify 'what' param preserved");

  const result = await executeSearchV2({
    rawParams: {
      what: "sunny room with parking",
      q: "sunny room with parking",
      lat: "37.77",
      lng: "-122.42",
      sort: "recommended",
      // No houseRules — filter removed
    },
    includeMap: true,
  });

  if (!result.response) {
    console.log(`  ${FAIL}: No response after filter removal`);
    return;
  }

  const listings = result.response.list?.items || [];
  const mapData = result.response.map;

  console.log(`  Results after filter removal: ${listings.length} items`);
  console.log(`  Map pins: ${mapData?.features?.length || 0}\n`);

  assert(listings.length === 12, `Full page of results restored (${listings.length})`);

  // Verify "Sunny Mission Room" is still #1 (semantic ranking preserved)
  const sunnyTop = listings[0]?.title?.includes("Sunny") || false;
  assert(sunnyTop, `"Sunny Mission Room" is still #1 after filter removal (got: "${listings[0]?.title}")`);

  const mapPins = mapData?.features?.length || 0;
  assert(mapPins > 0, `Map pins restored (${mapPins})`);
}

// ============================================================
// STEP 6: Verify result relevance with similarity scores
// ============================================================
async function step6_verifyRelevance() {
  section("STEP 6: Verify Result Relevance (Similarity Scores)");

  const query = "sunny room with parking";
  const embedding = await getCachedQueryEmbedding(query);
  const vecSql = pgvector.toSql(embedding);

  const results = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, title, amenities,
           1 - (embedding <=> '${vecSql}'::vector) as similarity
    FROM listing_search_docs
    WHERE status = 'ACTIVE' AND embedding IS NOT NULL
    ORDER BY embedding <=> '${vecSql}'::vector
    LIMIT 12
  `);

  console.log(`\n  Similarity score distribution for top 12:\n`);

  let relevantCount = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sim = (r.similarity * 100).toFixed(1);
    const bar = "█".repeat(Math.round(r.similarity * 20));
    const hasParking = r.amenities?.some((a: string) => a.toLowerCase().includes("parking"));
    const hasSunny = r.title?.toLowerCase().includes("sunny");

    let tag = "";
    if (hasSunny && hasParking) tag = " ← BEST MATCH (sunny + parking)";
    else if (hasParking) tag = " ← has parking";
    else if (hasSunny) tag = " ← has sunny";

    if (r.similarity >= 0.35) relevantCount++;
    console.log(`    #${String(i + 1).padStart(2)}: ${bar} ${sim}% │ ${r.title}${tag}`);
  }

  console.log();
  assert(relevantCount >= 10, `${relevantCount}/12 results above 35% similarity threshold`);
  assert(results[0].similarity >= 0.45, `Top result has ≥45% similarity (${(results[0].similarity * 100).toFixed(1)}%)`);

  // Verify the best match has highest combined score
  const bestMatch = results.find(
    (r: any) => r.title?.includes("Sunny") && r.amenities?.some((a: string) => a.toLowerCase().includes("parking"))
  );
  if (bestMatch) {
    console.log(`  Best semantic+keyword match: "${bestMatch.title}" at ${(bestMatch.similarity * 100).toFixed(1)}%`);
    assert(true, "Best match (sunny + parking) found in top 12");
  } else {
    assert(false, "Best match (sunny + parking) NOT found in top 12");
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("  CRITICAL USER FLOW 1: Full Simulation");
  console.log("  Semantic Search → Pagination → Filter → Relevance Verification");
  console.log("═".repeat(70));

  let passed = 0;
  let failed = 0;

  try {
    // Step 1: Semantic search
    const s1 = await step1_semanticSearch();
    if (!s1) { failed++; return; }

    // Step 2: Pagination
    const s2 = await step2_pagination(s1.nextCursor!, s1.page1Ids);
    if (!s2) { failed++; return; }

    // Step 3: Apply filter
    const s3 = await step3_applyFilter();
    if (!s3) { failed++; return; }

    // Step 4: Paginate after filter
    await step4_paginateAfterFilter(s3.nextCursor || null, s3.filterIds);

    // Step 5: Remove filter
    await step5_removeFilter();

    // Step 6: Verify relevance
    await step6_verifyRelevance();

  } catch (err) {
    console.log(`\n  ${FAIL}: Unhandled error: ${err instanceof Error ? err.message : err}`);
    failed++;
  }

  section("FINAL VERDICT");
  console.log();
  console.log(`  Flow simulation complete.`);
  console.log(`  Review the results above for any ${FAIL} markers.\n`);
  console.log("═".repeat(70) + "\n");
}

main()
  .catch((e) => console.error("Fatal:", e))
  .finally(() => prisma.$disconnect());
