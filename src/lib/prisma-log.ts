const PRISMA_EVENT_DENYLIST = new Set(["params", "query"]);

export function extractPrismaEventMeta(e: unknown): Record<string, unknown> {
  try {
    if (e === null || e === undefined) {
      return { eventShape: "null-or-undefined" };
    }

    if (typeof e === "string") {
      return {
        message: e,
        eventShape: "string",
      };
    }

    if (e instanceof Error) {
      const maybeCode = (e as { code?: unknown }).code;

      return {
        name: e.name,
        message: e.message,
        stack: e.stack,
        ...(typeof maybeCode === "string" ? { code: maybeCode } : {}),
        eventShape: "error-instance",
        constructorName: e.constructor?.name,
      };
    }

    if (typeof e === "object") {
      const src = e as Record<string, unknown>;
      const out: Record<string, unknown> = {};

      for (const key of Object.getOwnPropertyNames(src)) {
        if (PRISMA_EVENT_DENYLIST.has(key)) {
          continue;
        }

        const value = src[key];
        out[key] = value instanceof Date ? value.toISOString() : value;
      }

      if (src.timestamp instanceof Date) {
        out.timestamp = src.timestamp.toISOString();
      }

      if (Object.keys(out).length === 0) {
        out.eventShape = "empty-object";
        out.constructorName =
          (typeof src.constructor === "function" ? src.constructor.name : undefined) ??
          "Object";
      } else {
        out.eventShape = "object";
      }

      return out;
    }

    return {
      message: String(e),
      eventShape: typeof e,
    };
  } catch {
    return {
      eventShape: "unserializable",
    };
  }
}
