/**
 * Tests for SQL safety helpers (sql-safety.ts)
 *
 * These utilities are the security boundary that prevents raw string literals
 * (i.e. user-supplied values) from being interpolated into raw SQL queries.
 * Every function here is critical-path security code.
 */

// server-only is a Next.js compile-time guard; mock it so Jest can import the module.
jest.mock("server-only", () => ({}));

import {
  assertParameterizedWhereClause,
  joinWhereClauseWithSecurityInvariant,
  assertValidSortColumn,
  assertValidSortDirection,
  assertValidEnum,
} from "@/lib/sql-safety";

// ─────────────────────────────────────────────────────────────────────────────
// assertParameterizedWhereClause
// ─────────────────────────────────────────────────────────────────────────────

describe("assertParameterizedWhereClause", () => {
  describe("clauses with no string literals", () => {
    it("does not throw when clause contains only numeric placeholders", () => {
      expect(() =>
        assertParameterizedWhereClause("d.price > $1 AND d.lat IS NOT NULL")
      ).not.toThrow();
    });

    it("does not throw for an empty string clause", () => {
      expect(() => assertParameterizedWhereClause("")).not.toThrow();
    });

    it("does not throw when clause uses only unquoted identifiers and operators", () => {
      expect(() =>
        assertParameterizedWhereClause(
          "d.status IS NOT NULL AND d.price BETWEEN $1 AND $2"
        )
      ).not.toThrow();
    });
  });

  describe("explicitly allowed string literals", () => {
    it.each([
      ["'ACTIVE'", "d.status = 'ACTIVE'"],
      ["'english'", "to_tsquery('english', $1)"],
      ["'%'", "d.title LIKE '%'"],
      ["'HELD'", "b.status = 'HELD'"],
    ])("allows the %s literal", (_label, clause) => {
      expect(() => assertParameterizedWhereClause(clause)).not.toThrow();
    });

    it("allows a clause that combines multiple allowed literals", () => {
      expect(() =>
        assertParameterizedWhereClause(
          "d.status = 'ACTIVE' AND to_tsquery('english', $1) AND d.title LIKE '%' AND b.status = 'HELD'"
        )
      ).not.toThrow();
    });
  });

  describe("disallowed literals — security violations", () => {
    it("throws when clause contains a disallowed string literal", () => {
      expect(() =>
        assertParameterizedWhereClause("d.status = 'PAUSED'")
      ).toThrow("SECURITY");
    });

    it("throws when clause contains an empty string literal", () => {
      // Empty string '' is not in the allow-list
      expect(() =>
        assertParameterizedWhereClause("d.title = ''")
      ).toThrow("SECURITY");
    });

    it("throws on a basic SQL injection attempt with OR clause", () => {
      // Attacker appends OR '1'='1' — '1' is not in the allow-list
      expect(() =>
        assertParameterizedWhereClause("d.status = 'ACTIVE' OR '1'='1'")
      ).toThrow("SECURITY");
    });

    it("throws when clause contains a user-supplied status value", () => {
      expect(() =>
        assertParameterizedWhereClause("d.status = 'ARCHIVED'")
      ).toThrow("SECURITY");
    });

    it("throws when clause contains an arbitrary word literal", () => {
      expect(() =>
        assertParameterizedWhereClause("d.city = 'London'")
      ).toThrow("SECURITY");
    });
  });

  describe("escaped-quote edge case", () => {
    it("matches only the content between the outermost single quotes (no escaped-quote support)", () => {
      // The regex /'([^']*)'/g stops at the first closing quote.
      // For "d.name = 'O''Brien'", it matches 'O' (empty interior before the
      // escaped apostrophe) and then ''Brien' separately.
      // 'O' is not in the allow-list → must throw.
      expect(() =>
        assertParameterizedWhereClause("d.name = 'O''Brien'")
      ).toThrow("SECURITY");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// joinWhereClauseWithSecurityInvariant
// ─────────────────────────────────────────────────────────────────────────────

describe("joinWhereClauseWithSecurityInvariant", () => {
  it("joins multiple conditions with ' AND '", () => {
    const result = joinWhereClauseWithSecurityInvariant([
      "d.lat IS NOT NULL",
      "d.price > $1",
      "d.status = 'ACTIVE'",
    ]);
    expect(result).toBe("d.lat IS NOT NULL AND d.price > $1 AND d.status = 'ACTIVE'");
  });

  it("returns a single condition unchanged when array has one element", () => {
    const result = joinWhereClauseWithSecurityInvariant(["d.lat IS NOT NULL"]);
    expect(result).toBe("d.lat IS NOT NULL");
  });

  it("returns an empty string for an empty conditions array without throwing", () => {
    const result = joinWhereClauseWithSecurityInvariant([]);
    expect(result).toBe("");
  });

  it("throws (via assertParameterizedWhereClause) when joined result contains a disallowed literal", () => {
    expect(() =>
      joinWhereClauseWithSecurityInvariant([
        "d.status = 'ACTIVE'",
        "d.city = 'London'", // disallowed
      ])
    ).toThrow("SECURITY");
  });

  it("calls the security assertion on the joined string, not on individual fragments", () => {
    // Each individual fragment is benign; the joined string would still be checked.
    // Here we verify that a disallowed literal anywhere in the joined output is caught.
    expect(() =>
      joinWhereClauseWithSecurityInvariant([
        "d.status = 'PAUSED'",
      ])
    ).toThrow("SECURITY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assertValidSortColumn
// ─────────────────────────────────────────────────────────────────────────────

describe("assertValidSortColumn", () => {
  const allowedColumns = ["d.price", "d.created_at", "d.title"];

  it("does not throw when column is in the allowed list", () => {
    expect(() =>
      assertValidSortColumn("d.price", allowedColumns)
    ).not.toThrow();
  });

  it("does not throw for every column in the allowed list", () => {
    for (const col of allowedColumns) {
      expect(() => assertValidSortColumn(col, allowedColumns)).not.toThrow();
    }
  });

  it("throws when column is not in the allowed list", () => {
    expect(() =>
      assertValidSortColumn("d.injected", allowedColumns)
    ).toThrow("SECURITY");
  });

  it("error message includes the invalid column name", () => {
    expect(() =>
      assertValidSortColumn("d.bad_column", allowedColumns)
    ).toThrow("d.bad_column");
  });

  it("is case-sensitive — does not allow a differently-cased column name", () => {
    // SQL column names are case-sensitive in Prisma raw queries
    expect(() =>
      assertValidSortColumn("D.PRICE", allowedColumns)
    ).toThrow("SECURITY");
  });

  it("throws for an empty string column name", () => {
    expect(() =>
      assertValidSortColumn("", allowedColumns)
    ).toThrow("SECURITY");
  });

  it("throws when the allowed list itself is empty", () => {
    expect(() =>
      assertValidSortColumn("d.price", [])
    ).toThrow("SECURITY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assertValidSortDirection
// ─────────────────────────────────────────────────────────────────────────────

describe("assertValidSortDirection", () => {
  describe("accepted values (case-insensitive)", () => {
    it.each(["asc", "desc", "ASC", "DESC", "Asc", "Desc"])(
      "accepts direction '%s'",
      (dir) => {
        expect(() => assertValidSortDirection(dir)).not.toThrow();
      }
    );
  });

  describe("rejected values", () => {
    it.each([
      "ascending",
      "descending",
      "random",
      "",
      "ASC; DROP TABLE listings; --",
      "asc desc",
      "1",
      " asc",
      "asc ",
    ])("throws for direction '%s'", (dir) => {
      expect(() => assertValidSortDirection(dir)).toThrow("SECURITY");
    });

    it("error message includes the invalid direction value", () => {
      expect(() => assertValidSortDirection("random")).toThrow("random");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assertValidEnum
// ─────────────────────────────────────────────────────────────────────────────

describe("assertValidEnum", () => {
  const allowedValues = ["ACTIVE", "DRAFT", "ARCHIVED"];

  it("does not throw when value is in the allowed list", () => {
    expect(() =>
      assertValidEnum("ACTIVE", allowedValues)
    ).not.toThrow();
  });

  it("does not throw for every value in the allowed list", () => {
    for (const v of allowedValues) {
      expect(() => assertValidEnum(v, allowedValues)).not.toThrow();
    }
  });

  it("throws when value is not in the allowed list", () => {
    expect(() =>
      assertValidEnum("PAUSED", allowedValues)
    ).toThrow("SECURITY");
  });

  it("error message includes the invalid value", () => {
    expect(() =>
      assertValidEnum("BANNED", allowedValues)
    ).toThrow("BANNED");
  });

  it("error message includes the list of allowed values", () => {
    expect(() =>
      assertValidEnum("BANNED", allowedValues)
    ).toThrow("ACTIVE");
  });

  it("is case-sensitive — does not accept a differently-cased value", () => {
    expect(() =>
      assertValidEnum("active", allowedValues)
    ).toThrow("SECURITY");
  });

  it("throws for an empty string value", () => {
    expect(() =>
      assertValidEnum("", allowedValues)
    ).toThrow("SECURITY");
  });

  it("throws when the allowed list is empty", () => {
    expect(() =>
      assertValidEnum("ACTIVE", [])
    ).toThrow("SECURITY");
  });
});
