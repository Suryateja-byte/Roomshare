/**
 * Injection Prevention Tests
 *
 * Comprehensive tests for SQL injection, XSS, and CSRF protection.
 * Replaces placeholder CSRF tests with real assertions.
 */

jest.mock("server-only", () => ({}));

// ─────────────────────────────────────────────────────────────────────────────
// 1. CSRF Protection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CSRF Protection (validateCsrf)", () => {
  let validateCsrf: typeof import("@/lib/csrf").validateCsrf;

  beforeEach(async () => {
    jest.resetModules();
    // Force production mode for strict CSRF enforcement
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      writable: true,
    });
    const mod = await import("@/lib/csrf");
    validateCsrf = mod.validateCsrf;
  });

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "test",
      writable: true,
    });
  });

  describe("safe methods are allowed without Origin", () => {
    it.each(["GET", "HEAD", "OPTIONS"])(
      "allows %s without Origin header",
      (method) => {
        const request = new Request("http://example.com/api/listings", {
          method,
        });
        expect(validateCsrf(request)).toBeNull();
      }
    );
  });

  describe("mutation methods require Origin", () => {
    it.each(["POST", "PUT", "PATCH", "DELETE"])(
      "rejects %s without Origin header (403)",
      (method) => {
        const request = new Request("http://example.com/api/listings", {
          method,
          headers: { host: "example.com" },
        });
        const response = validateCsrf(request);
        expect(response).not.toBeNull();
        expect(response!.status).toBe(403);
      }
    );
  });

  describe("Origin mismatch is rejected", () => {
    it("rejects POST with wrong Origin (403)", () => {
      const request = new Request("http://example.com/api/listings", {
        method: "POST",
        headers: {
          host: "example.com",
          origin: "https://evil.com",
        },
      });
      const response = validateCsrf(request);
      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
    });

    it("rejects POST with malformed Origin (403)", () => {
      const request = new Request("http://example.com/api/listings", {
        method: "POST",
        headers: {
          host: "example.com",
          origin: "not-a-url",
        },
      });
      const response = validateCsrf(request);
      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
    });
  });

  describe("matching Origin is accepted", () => {
    it("accepts POST with correct Origin matching Host", () => {
      const request = new Request("http://example.com/api/listings", {
        method: "POST",
        headers: {
          host: "example.com",
          origin: "https://example.com",
        },
      });
      expect(validateCsrf(request)).toBeNull();
    });

    it("accepts DELETE with correct Origin matching Host", () => {
      const request = new Request("http://example.com/api/listings/123", {
        method: "DELETE",
        headers: {
          host: "example.com",
          origin: "https://example.com",
        },
      });
      expect(validateCsrf(request)).toBeNull();
    });

    it("accepts PUT with correct Origin matching Host (with port)", () => {
      const request = new Request("http://example.com:3000/api/reviews", {
        method: "PUT",
        headers: {
          host: "example.com:3000",
          origin: "http://example.com:3000",
        },
      });
      expect(validateCsrf(request)).toBeNull();
    });
  });

  describe("development mode localhost handling", () => {
    beforeEach(async () => {
      jest.resetModules();
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        writable: true,
      });
      const mod = await import("@/lib/csrf");
      validateCsrf = mod.validateCsrf;
    });

    it("allows POST from localhost to localhost in development", () => {
      const request = new Request("http://localhost:3000/api/listings", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      });
      expect(validateCsrf(request)).toBeNull();
    });

    it("allows POST from 127.0.0.1 to localhost in development", () => {
      const request = new Request("http://localhost:3000/api/listings", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://127.0.0.1:3000",
        },
      });
      expect(validateCsrf(request)).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SQL Injection Prevention Tests (via sql-safety module)
// ─────────────────────────────────────────────────────────────────────────────

describe("SQL Injection Prevention", () => {
  let assertParameterizedWhereClause: typeof import("@/lib/sql-safety").assertParameterizedWhereClause;
  let assertValidSortColumn: typeof import("@/lib/sql-safety").assertValidSortColumn;
  let assertValidSortDirection: typeof import("@/lib/sql-safety").assertValidSortDirection;

  beforeAll(async () => {
    const mod = await import("@/lib/sql-safety");
    assertParameterizedWhereClause = mod.assertParameterizedWhereClause;
    assertValidSortColumn = mod.assertValidSortColumn;
    assertValidSortDirection = mod.assertValidSortDirection;
  });

  it("rejects SQL injection in search query parameter (UNION SELECT)", () => {
    expect(() =>
      assertParameterizedWhereClause(
        "d.title LIKE ''; DROP TABLE listings; --'"
      )
    ).toThrow("SECURITY");
  });

  it("rejects SQL injection via OR 1=1 tautology", () => {
    expect(() =>
      assertParameterizedWhereClause("d.status = 'ACTIVE' OR '1'='1'")
    ).toThrow("SECURITY");
  });

  it("rejects SQL injection in sort column parameter", () => {
    const allowedColumns = ["d.price", "d.created_at", "d.title"];
    expect(() =>
      assertValidSortColumn(
        "d.price; DROP TABLE listings; --",
        allowedColumns
      )
    ).toThrow("SECURITY");
  });

  it("rejects SQL injection in sort direction parameter", () => {
    expect(() =>
      assertValidSortDirection("ASC; DELETE FROM listings; --")
    ).toThrow("SECURITY");
  });

  it("rejects user-supplied string literal injected into WHERE clause", () => {
    expect(() =>
      assertParameterizedWhereClause("d.city = 'San Francisco'")
    ).toThrow("SECURITY");
  });

  it("allows properly parameterized WHERE clause", () => {
    expect(() =>
      assertParameterizedWhereClause(
        "d.price > $1 AND d.status = 'ACTIVE' AND d.lat IS NOT NULL"
      )
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. XSS Prevention Tests (Zod noHtmlTags validation)
// ─────────────────────────────────────────────────────────────────────────────

describe("XSS Prevention", () => {
  let noHtmlTags: typeof import("@/lib/schemas").noHtmlTags;

  beforeAll(async () => {
    const mod = await import("@/lib/schemas");
    noHtmlTags = mod.noHtmlTags;
  });

  it("rejects script tags in listing title", () => {
    const result = noHtmlTags('<script>alert("xss")</script>');
    expect(result).toBe(false);
  });

  it("rejects img onerror XSS in review content", () => {
    const result = noHtmlTags('<img src=x onerror="alert(1)">');
    expect(result).toBe(false);
  });

  it("rejects iframe injection", () => {
    const result = noHtmlTags('<iframe src="https://evil.com"></iframe>');
    expect(result).toBe(false);
  });

  it("rejects svg onload XSS", () => {
    const result = noHtmlTags("<svg onload=alert(1)>");
    expect(result).toBe(false);
  });

  it("rejects uppercase SCRIPT tags", () => {
    const result = noHtmlTags("<SCRIPT>document.cookie</SCRIPT>");
    expect(result).toBe(false);
  });

  it("allows plain text without HTML", () => {
    const result = noHtmlTags("A cozy room in downtown San Francisco");
    expect(result).toBe(true);
  });

  it("allows special characters that are not HTML tags", () => {
    const result = noHtmlTags(
      'Room & Board - "Best Deal" in Town ($800/mo)'
    );
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Origin Guard Tests (API-level origin enforcement)
// ─────────────────────────────────────────────────────────────────────────────

describe("Origin Guard (API-level enforcement)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("rejects unknown origins in production", async () => {
    process.env.ALLOWED_ORIGINS = "https://roomshare.app";
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { isOriginAllowed } = await import("@/lib/origin-guard");
    expect(isOriginAllowed("https://evil.com")).toBe(false);
  });

  it("rejects null origin", async () => {
    process.env.ALLOWED_ORIGINS = "https://roomshare.app";
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { isOriginAllowed } = await import("@/lib/origin-guard");
    expect(isOriginAllowed(null)).toBe(false);
  });

  it("accepts configured allowed origin", async () => {
    process.env.ALLOWED_ORIGINS = "https://roomshare.app";
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { isOriginAllowed } = await import("@/lib/origin-guard");
    expect(isOriginAllowed("https://roomshare.app")).toBe(true);
  });
});
