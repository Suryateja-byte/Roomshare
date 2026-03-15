/**
 * Gemini Embedding API wrapper.
 * Uses lazy-initialized singleton (same pattern as prisma.ts).
 * L2 normalizes truncated 768-dim embeddings per Google's guidance.
 */
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;
const MAX_RETRIES = 3;
const MAX_INPUT_LENGTH = 2000; // ~500 tokens, well within 2048 token limit

// --- Lazy singleton (survives HMR in dev, fresh in production) ---
const globalForGemini = globalThis as unknown as {
  geminiClient: GoogleGenAI | undefined;
};

function getClient(): GoogleGenAI {
  if (globalForGemini.geminiClient) return globalForGemini.geminiClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("[embedding] GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenAI({ apiKey });
  if (process.env.NODE_ENV !== "production") {
    globalForGemini.geminiClient = client;
  }
  return client;
}

// --- L2 normalization (required for dims < 3072) ---
function normalizeL2(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

// --- Retry with exponential backoff + jitter ---
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      // Non-retryable: 400, 401, 403, 404
      if (status && [400, 401, 403, 404].includes(status)) throw err;
      if (attempt === MAX_RETRIES) throw err;
      // Exponential backoff: 1s, 2s, 4s + jitter
      const delay = Math.min(
        1000 * Math.pow(2, attempt) + Math.random() * 500,
        16000
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Generate embedding for a single text (document indexing) */
export async function generateEmbedding(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const truncated = text.slice(0, MAX_INPUT_LENGTH);
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.addBreadcrumb({
      category: "embedding",
      message: `Generating embedding (${taskType})`,
      data: { textLength: truncated.length, taskType },
      level: "info",
    });
  } catch { /* Sentry unavailable in test */ }
  const res = await withRetry(() =>
    getClient().models.embedContent({
      model: MODEL,
      contents: truncated,
      config: { taskType, outputDimensionality: DIMENSIONS },
    })
  );
  const values = res.embeddings?.[0]?.values;
  if (!values?.length)
    throw new Error("[embedding] No embedding returned from Gemini");
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.addBreadcrumb({
      category: "embedding",
      message: "Embedding generated successfully",
      data: { dimensions: values.length, taskType },
      level: "info",
    });
  } catch { /* Sentry unavailable in test */ }
  return normalizeL2(values);
}

/** Generate embedding optimized for search queries */
export async function generateQueryEmbedding(
  query: string
): Promise<number[]> {
  return generateEmbedding(query, "RETRIEVAL_QUERY");
}

/** Batch embed multiple texts (for backfill script) */
export async function generateBatchEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (!texts.length) return [];
  const truncated = texts.map((t) => t.slice(0, MAX_INPUT_LENGTH));
  // embedContent accepts string[] via contents parameter
  const res = await withRetry(() =>
    getClient().models.embedContent({
      model: MODEL,
      contents: truncated,
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: DIMENSIONS,
      },
    })
  );
  if (!res.embeddings) throw new Error("[embedding] No embeddings returned");
  return res.embeddings.map((e) => {
    if (!e?.values?.length)
      throw new Error("[embedding] Empty embedding in batch");
    return normalizeL2(e.values);
  });
}
