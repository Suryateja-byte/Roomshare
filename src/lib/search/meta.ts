import { getCurrentEmbeddingVersion } from "@/lib/embeddings/version";
import { SEARCH_DOC_PROJECTION_VERSION } from "./search-doc-sync";
import type { SearchV2Meta } from "./types";
import { RANKING_VERSION } from "./ranking";

export function getSearchV2VersionMeta(options: {
  useSearchDoc: boolean;
  usedSemanticSearch: boolean;
  rankerEnabled?: boolean;
}): Pick<
  SearchV2Meta,
  "projectionVersion" | "embeddingVersion" | "rankerProfileVersion"
> {
  const projectionVersion =
    options.useSearchDoc || options.usedSemanticSearch
      ? SEARCH_DOC_PROJECTION_VERSION
      : undefined;
  const embeddingVersion = options.usedSemanticSearch
    ? getCurrentEmbeddingVersion()
    : undefined;
  const rankerProfileVersion = options.rankerEnabled
    ? RANKING_VERSION
    : undefined;

  return {
    ...(projectionVersion !== undefined ? { projectionVersion } : {}),
    ...(embeddingVersion ? { embeddingVersion } : {}),
    ...(rankerProfileVersion ? { rankerProfileVersion } : {}),
  };
}
