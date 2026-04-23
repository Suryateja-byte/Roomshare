import { EMBEDDING_MODEL } from "./gemini";
import { features } from "@/lib/env";

export const CURRENT_EMBEDDING_VERSION = EMBEDDING_MODEL;

export function getCurrentEmbeddingVersion(): string {
  return CURRENT_EMBEDDING_VERSION;
}

export function getBuildEmbeddingVersion(): string {
  return CURRENT_EMBEDDING_VERSION;
}

export function getReadEmbeddingVersion(): string {
  return features.rollbackEmbeddingVersion ?? CURRENT_EMBEDDING_VERSION;
}
