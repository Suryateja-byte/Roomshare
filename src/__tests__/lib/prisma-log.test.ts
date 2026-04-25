import { extractPrismaEventMeta } from "@/lib/prisma-log";

describe("extractPrismaEventMeta", () => {
  it("preserves canonical Prisma event fields and normalizes timestamps", () => {
    const timestamp = new Date("2026-04-18T13:30:52.903Z");

    const meta = extractPrismaEventMeta({
      target: "quaint::core",
      message: "connection refused",
      timestamp,
    });

    expect(meta).toEqual({
      target: "quaint::core",
      message: "connection refused",
      timestamp: "2026-04-18T13:30:52.903Z",
      eventShape: "object",
    });
  });

  it("returns non-empty metadata for empty plain objects", () => {
    const meta = extractPrismaEventMeta({});

    expect(meta.eventShape).toBe("empty-object");
    expect(Object.keys(meta).length).toBeGreaterThan(0);
  });

  it("extracts standard Error fields without throwing", () => {
    expect(() => extractPrismaEventMeta(new TypeError("boom"))).not.toThrow();

    const meta = extractPrismaEventMeta(new TypeError("boom"));

    expect(meta.name).toBe("TypeError");
    expect(meta.message).toBe("boom");
    expect(typeof meta.stack).toBe("string");
    expect(meta.eventShape).toBe("error-instance");
    expect(meta.constructorName).toBe("TypeError");
  });

  it("handles string events", () => {
    expect(extractPrismaEventMeta("disconnected")).toEqual({
      message: "disconnected",
      eventShape: "string",
    });
  });

  it("preserves extra object fields", () => {
    const cause = new Error("root cause");

    const meta = extractPrismaEventMeta({
      code: "P1001",
      clientVersion: "6.19.3",
      cause,
    });

    expect(meta.code).toBe("P1001");
    expect(meta.clientVersion).toBe("6.19.3");
    expect(meta.cause).toBe(cause);
    expect(meta.eventShape).toBe("object");
  });

  it("drops params and query keys from object events", () => {
    const meta = extractPrismaEventMeta({
      params: "secret params",
      query: "SELECT * FROM users",
      message: "failed",
    });

    expect(meta).not.toHaveProperty("params");
    expect(meta).not.toHaveProperty("query");
    expect(meta.message).toBe("failed");
  });

  it("normalizes Date values to ISO strings", () => {
    const meta = extractPrismaEventMeta({
      timestamp: new Date("2026-04-18T00:00:00Z"),
    });

    expect(meta.timestamp).toBe("2026-04-18T00:00:00.000Z");
  });

  it("handles null and undefined without throwing", () => {
    expect(() => extractPrismaEventMeta(null)).not.toThrow();
    expect(() => extractPrismaEventMeta(undefined)).not.toThrow();

    expect(extractPrismaEventMeta(null)).toEqual({
      eventShape: "null-or-undefined",
    });
    expect(extractPrismaEventMeta(undefined)).toEqual({
      eventShape: "null-or-undefined",
    });
  });

  it("includes string error codes on Error instances", () => {
    const error = new Error("database unreachable") as Error & { code?: string };
    error.code = "P1001";

    const meta = extractPrismaEventMeta(error);

    expect(meta.code).toBe("P1001");
    expect(meta.eventShape).toBe("error-instance");
  });
});
