/**
 * Gemini Embedding API wrapper.
 * Uses lazy-initialized singleton (same pattern as prisma.ts).
 * Stores a Roomshare embedding profile version separately from the provider
 * model so persisted vectors never mix across prompt/schema revisions.
 */
import { GoogleGenAI } from "@google/genai";

const PROVIDER_MODEL = "gemini-embedding-2";
const MODEL = "gemini-embedding-2.search-result.nosensitive-v1.d768";
const LEGACY_PREVIEW_MODEL = "gemini-embedding-2-preview";
const DIMENSIONS = 768;
const MAX_RETRIES = 3;
const MAX_INPUT_LENGTH = 8000; // ~2000 tokens, well within 8192 token limit

type EmbeddingTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";
type DocumentEmbeddingOptions = {
  title?: string | null;
  embeddingVersion?: string;
};

type EmbeddingProfile = {
  version: string;
  providerModel: string;
  usesPromptFormatting: boolean;
};

const CURRENT_PROFILE: EmbeddingProfile = {
  version: MODEL,
  providerModel: PROVIDER_MODEL,
  usesPromptFormatting: true,
};

const EMBEDDING_PROFILES: Record<string, EmbeddingProfile> = {
  [CURRENT_PROFILE.version]: CURRENT_PROFILE,
  [LEGACY_PREVIEW_MODEL]: {
    version: LEGACY_PREVIEW_MODEL,
    providerModel: LEGACY_PREVIEW_MODEL,
    usesPromptFormatting: false,
  },
};

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
  globalForGemini.geminiClient = client;
  return client;
}

// --- L2 normalization (required for dims < 3072) ---
function normalizeL2(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

function truncateFormattedContent(value: string): string {
  return value.slice(0, MAX_INPUT_LENGTH);
}

function formatEmbeddingInput(
  text: string,
  taskType: EmbeddingTaskType,
  profile: EmbeddingProfile,
  options: DocumentEmbeddingOptions = {}
): string {
  if (!profile.usesPromptFormatting) {
    return truncateFormattedContent(text);
  }

  if (taskType === "RETRIEVAL_QUERY") {
    return truncateFormattedContent(`task: search result | query: ${text}`);
  }

  const title = options.title?.trim() || "none";
  return truncateFormattedContent(`title: ${title} | text: ${text}`);
}

function getEmbeddingProfile(version = MODEL): EmbeddingProfile {
  const profile = EMBEDDING_PROFILES[version];
  if (!profile) {
    throw new Error(`[embedding] Unsupported embedding version: ${version}`);
  }
  return profile;
}

function buildEmbedConfig(
  taskType: EmbeddingTaskType,
  profile: EmbeddingProfile
) {
  return profile.usesPromptFormatting
    ? { outputDimensionality: DIMENSIONS }
    : { taskType, outputDimensionality: DIMENSIONS };
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
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT",
  options: DocumentEmbeddingOptions = {}
): Promise<number[]> {
  const profile = getEmbeddingProfile(options.embeddingVersion);
  const formatted = formatEmbeddingInput(text, taskType, profile, options);
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.addBreadcrumb({
      category: "embedding",
      message: `Generating embedding (${taskType})`,
      data: { textLength: formatted.length, taskType },
      level: "info",
    });
  } catch {
    /* Sentry unavailable in test */
  }
  const res = await withRetry(() =>
    getClient().models.embedContent({
      model: profile.providerModel,
      contents: formatted,
      config: buildEmbedConfig(taskType, profile),
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
  } catch {
    /* Sentry unavailable in test */
  }
  return normalizeL2(values);
}

/** Generate embedding optimized for search queries */
export async function generateQueryEmbedding(
  query: string,
  options: Pick<DocumentEmbeddingOptions, "embeddingVersion"> = {}
): Promise<number[]> {
  return generateEmbedding(query, "RETRIEVAL_QUERY", options);
}

/** Generate embedding from text + images (multimodal fused vector) */
export async function generateMultimodalEmbedding(
  text: string,
  images: { base64: string; mimeType: string }[],
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT",
  options: DocumentEmbeddingOptions = {}
): Promise<number[]> {
  const profile = getEmbeddingProfile(options.embeddingVersion);
  const formatted = formatEmbeddingInput(text, taskType, profile, options);
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [
    { text: formatted },
    ...images.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    })),
  ];

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.addBreadcrumb({
      category: "embedding",
      message: `Generating multimodal embedding (${taskType})`,
      data: {
        textLength: formatted.length,
        imageCount: images.length,
        taskType,
      },
      level: "info",
    });
  } catch {
    /* Sentry unavailable in test */
  }

  const res = await withRetry(() =>
    getClient().models.embedContent({
      model: profile.providerModel,
      contents: { parts },
      config: buildEmbedConfig(taskType, profile),
    })
  );
  const values = res.embeddings?.[0]?.values;
  if (!values?.length)
    throw new Error("[embedding] No multimodal embedding returned from Gemini");
  return normalizeL2(values);
}

/** Batch embed multiple texts (for backfill script) */
export async function generateBatchEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (!texts.length) return [];
  const embeddings: number[][] = [];
  for (const text of texts) {
    embeddings.push(await generateEmbedding(text, "RETRIEVAL_DOCUMENT"));
  }
  return embeddings;
}

/** Export model name for cache key namespacing */
export {
  MODEL as EMBEDDING_MODEL,
  PROVIDER_MODEL as EMBEDDING_PROVIDER_MODEL,
  DIMENSIONS as EMBEDDING_DIMENSIONS,
};
