/**
 * Semantic Search Quality Inspector
 *
 * Generates a query embedding, runs it against pgvector, and shows:
 * - Top results with cosine similarity scores
 * - The embedding_text that was used to generate each listing's embedding
 * - WHY each result matched (keyword overlap + semantic similarity)
 *
 * Usage: npx tsx src/scripts/inspect-search-quality.ts "sunny room with parking"
 */

import { getCachedQueryEmbedding } from "../lib/embeddings/query-cache";
import { PrismaClient } from "@prisma/client";
import pgvector from "pgvector";

const prisma = new PrismaClient();

interface SearchResult {
  id: string;
  title: string;
  city: string;
  price: number;
  similarity: number;
  keyword_rank: number;
  embedding_text: string;
  amenities: string[];
  room_type: string | null;
}

async function inspectSearchQuality(query: string) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(` Semantic Search Quality Inspector`);
  console.log(`${"═".repeat(70)}`);
  console.log(`\n  Query: "${query}"\n`);

  // Step 1: Generate query embedding
  console.log("  [1/3] Generating query embedding via Gemini...");
  const embedding = await getCachedQueryEmbedding(query);
  const vecSql = pgvector.toSql(embedding);
  console.log(`  ✓ Embedding generated (${embedding.length} dimensions)\n`);

  // Step 2: Run similarity search with scores
  console.log("  [2/3] Running vector similarity search...\n");

  const results = await prisma.$queryRawUnsafe<SearchResult[]>(`
    WITH semantic AS (
      SELECT
        sd.id,
        sd.title,
        sd.city,
        sd.price::float8 as price,
        (1 - (sd.embedding <=> '${vecSql}'::vector)) as similarity,
        sd.embedding_text,
        sd.amenities,
        sd.room_type
      FROM listing_search_docs sd
      WHERE sd.status = 'ACTIVE'
        AND sd.embedding IS NOT NULL
      ORDER BY sd.embedding <=> '${vecSql}'::vector
      LIMIT 20
    ),
    keyword AS (
      SELECT
        sd.id,
        ts_rank_cd(sd.search_tsv, plainto_tsquery('english', $1)) as kw_rank
      FROM listing_search_docs sd
      WHERE sd.search_tsv @@ plainto_tsquery('english', $1)
    )
    SELECT
      s.id,
      s.title,
      s.city,
      s.price,
      s.similarity,
      COALESCE(k.kw_rank, 0) as keyword_rank,
      s.embedding_text,
      s.amenities,
      s.room_type
    FROM semantic s
    LEFT JOIN keyword k ON s.id = k.id
    ORDER BY s.similarity DESC
  `, query);

  // Step 3: Display results with explanation
  console.log("  [3/3] Analyzing result relevance...\n");
  console.log(`  ${"─".repeat(66)}`);
  console.log(`  # │ Similarity │ KW Rank │ Title / Why it matched`);
  console.log(`  ${"─".repeat(66)}`);

  const queryWords = query.toLowerCase().split(/\s+/);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const simPercent = (r.similarity * 100).toFixed(1);
    const simBar = "█".repeat(Math.round(r.similarity * 20)) + "░".repeat(20 - Math.round(r.similarity * 20));

    // Determine relevance tier
    let tier = "❌ IRRELEVANT";
    if (r.similarity >= 0.7) tier = "🟢 EXCELLENT";
    else if (r.similarity >= 0.5) tier = "🟡 GOOD";
    else if (r.similarity >= 0.35) tier = "🟠 MARGINAL";
    else if (r.similarity >= 0.25) tier = "🔴 WEAK";

    // Find keyword matches in embedding text
    const textLower = (r.embedding_text || "").toLowerCase();
    const matchedWords = queryWords.filter(w => w.length > 2 && textLower.includes(w));
    const hasKeyword = r.keyword_rank > 0;

    console.log(`\n  ${String(i + 1).padStart(2)} │ ${simBar} ${simPercent}% │ KW: ${r.keyword_rank > 0 ? r.keyword_rank.toFixed(3) : "none "} │ ${tier}`);
    console.log(`     │ Title: ${r.title}`);
    console.log(`     │ ${r.city} · $${r.price}/mo · ${r.room_type || "N/A"}`);
    console.log(`     │ Amenities: ${r.amenities.slice(0, 5).join(", ") || "none"}`);

    if (matchedWords.length > 0) {
      console.log(`     │ 🔍 Keyword matches: ${matchedWords.join(", ")}`);
    }
    if (!hasKeyword && r.similarity < 0.35) {
      console.log(`     │ ⚠️  No keyword match + low similarity — may be irrelevant`);
    }
  }

  // Summary stats
  console.log(`\n  ${"─".repeat(66)}`);
  const excellent = results.filter(r => r.similarity >= 0.7).length;
  const good = results.filter(r => r.similarity >= 0.5 && r.similarity < 0.7).length;
  const marginal = results.filter(r => r.similarity >= 0.35 && r.similarity < 0.5).length;
  const weak = results.filter(r => r.similarity >= 0.25 && r.similarity < 0.35).length;
  const irrelevant = results.filter(r => r.similarity < 0.25).length;
  const withKeyword = results.filter(r => r.keyword_rank > 0).length;

  console.log(`\n  QUALITY SUMMARY (top ${results.length} results):`);
  console.log(`    🟢 Excellent (≥70%): ${excellent}`);
  console.log(`    🟡 Good (50-70%):    ${good}`);
  console.log(`    🟠 Marginal (35-50%): ${marginal}`);
  console.log(`    🔴 Weak (25-35%):    ${weak}`);
  console.log(`    ❌ Irrelevant (<25%): ${irrelevant}`);
  console.log(`    🔍 With keyword hit: ${withKeyword}/${results.length}`);

  const avgSimilarity = results.reduce((s, r) => s + r.similarity, 0) / results.length;
  console.log(`\n    Average similarity: ${(avgSimilarity * 100).toFixed(1)}%`);

  if (avgSimilarity < 0.35) {
    console.log(`\n  ⚠️  LOW RELEVANCE: Average similarity is below 35%.`);
    console.log(`     This query may not match well with the listing corpus.`);
    console.log(`     Consider: Is this query type expected for a roommate platform?`);
  } else if (avgSimilarity >= 0.5) {
    console.log(`\n  ✅ GOOD RELEVANCE: Results are semantically meaningful.`);
  }

  // Show the embedding text of the #1 result for full transparency
  if (results.length > 0) {
    console.log(`\n  ${"─".repeat(66)}`);
    console.log(`  TOP RESULT EMBEDDING TEXT (what Gemini used to match):`);
    console.log(`  ${"─".repeat(66)}`);
    const top = results[0];
    const text = top.embedding_text || "(no text)";
    // Show first 500 chars
    console.log(`  ${text.substring(0, 500)}${text.length > 500 ? "..." : ""}`);
  }

  console.log(`\n${"═".repeat(70)}\n`);
}

const query = process.argv.slice(2).join(" ") || "sunny room with parking";
inspectSearchQuality(query)
  .catch(e => console.error("Error:", e))
  .finally(() => prisma.$disconnect());
