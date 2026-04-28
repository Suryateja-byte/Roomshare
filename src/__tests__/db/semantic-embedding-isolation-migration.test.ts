import fs from "fs";
import path from "path";

describe("semantic embedding version isolation migration", () => {
  const migrationSql = () =>
    fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../prisma/migrations/20260515000000_embedding_ga_version_isolation/migration.sql"
      ),
      "utf8"
    );

  it("filters semantic search candidates by embedding version and published status before ranking", () => {
    const sql = migrationSql();

    expect(sql).toContain("required_embedding_version text");
    expect(sql).toContain("sd.embedding_model = required_embedding_version");
    expect(sql).toContain(
      "sd.embedding_status IN ('COMPLETED', 'PARTIAL')"
    );
    expect(sql.indexOf("sd.embedding_model = required_embedding_version")).toBeLessThan(
      sql.indexOf("ORDER BY f.embedding <=> query_embedding")
    );
  });

  it("version-scopes similar listings and the GA HNSW index", () => {
    const sql = migrationSql();

    expect(sql).toContain("get_similar_listings");
    expect(sql).toContain("target_embedding");
    expect(sql).toContain(
      "embedding_model = required_embedding_version"
    );
    expect(sql).toContain("idx_search_docs_embedding_ga_hnsw");
    expect(sql).toContain(
      "gemini-embedding-2.search-result.nosensitive-v1.d768"
    );
  });
});
