import {
  redactSensitive,
  sanitizeErrorMessage,
  sanitizeSentryException,
  scrubSentryEvent,
} from "@/lib/privacy-redaction";

describe("privacy-redaction", () => {
  it("scrubs Sentry event payloads without mutating the original event", () => {
    const event = {
      message:
        "Failed for jane@example.com at 123 Main Street with postgres://user:pass@localhost:5432/db",
      exception: {
        values: [
          {
            type: "Error",
            value:
              "Call 555-123-4567 after SELECT email FROM users WHERE id = 1",
            stacktrace: {
              frames: [
                {
                  filename: "/home/surya/roomshare/src/app/api/route.ts",
                  abs_path: "C:\\Users\\surya\\roomshare\\secret.ts",
                  context_line: "const email = 'jane@example.com';",
                },
              ],
            },
          },
        ],
      },
      request: {
        url: "https://roomshare.test/api/messages?email=jane@example.com&token=secret-token&address=123%20Main%20Street",
        headers: {
          authorization:
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature",
          cookie: "session=secret",
          "x-safe": "ok",
        },
        data: {
          phone: "555-123-4567",
          nested: ["123 Main Street"],
        },
      },
      breadcrumbs: [
        {
          message: "User jane@example.com clicked",
          data: {
            address: "123 Main Street",
            token: "secret",
          },
        },
      ],
      tags: {
        route: "/api/messages",
        email: "jane@example.com",
      },
      extra: {
        rawPath: "/home/surya/roomshare/src/lib/file.ts",
        sql: "SELECT email FROM users WHERE id = 1",
      },
      contexts: {
        response: {
          body: "phone 555-123-4567",
        },
      },
      user: {
        id: "user-123",
        email: "jane@example.com",
        username: "jane",
        ip_address: "127.0.0.1",
      },
    };

    const original = JSON.stringify(event);
    const scrubbed = scrubSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);

    expect(JSON.stringify(event)).toBe(original);
    expect(scrubbed).not.toBe(event);
    expect(serialized).not.toContain("jane@example.com");
    expect(serialized).not.toContain("555-123-4567");
    expect(serialized).not.toContain("123 Main Street");
    expect(serialized).not.toContain("123%20Main%20Street");
    expect(serialized).not.toContain("user:pass");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("session=secret");
    expect(serialized).not.toContain("SELECT email");
    expect(serialized).not.toContain("/home/surya");
    expect(serialized).not.toContain("C:\\Users\\surya");
    expect(serialized).not.toContain("user-123");
    expect(scrubbed.request.headers["x-safe"]).toBe("ok");
  });

  it("sanitizes Error instances for Sentry without mutating the original error", () => {
    const error = new TypeError(
      "Failed for jane@example.com at 123 Main Street using postgres://user:pass@localhost/db"
    );
    error.stack =
      "TypeError: jane@example.com\n    at handler (/home/surya/roomshare/src/lib/file.ts:1:1)";

    const sanitized = sanitizeSentryException(error);

    expect(sanitized).toBeInstanceOf(Error);
    expect(sanitized).not.toBe(error);
    expect((sanitized as Error).name).toBe("TypeError");
    expect((sanitized as Error).message).not.toContain("jane@example.com");
    expect((sanitized as Error).message).not.toContain("123 Main Street");
    expect((sanitized as Error).message).not.toContain("user:pass");
    expect((sanitized as Error).stack).not.toContain("/home/surya");
    expect(error.message).toContain("jane@example.com");
    expect(error.stack).toContain("/home/surya");
  });

  it("sanitizes string and unknown exception values", () => {
    expect(sanitizeSentryException("email jane@example.com")).toBe(
      "email [REDACTED]"
    );
    expect(sanitizeSentryException(null)).toBe("Unknown error");
    expect(sanitizeSentryException(42)).toBe("Unknown error");
  });

  it("uses the same redaction helpers exported to the logger", () => {
    expect(redactSensitive("token=secret&email=jane@example.com")).toBe(
      "token=[REDACTED]&email=[REDACTED]"
    );
    expect(
      sanitizeErrorMessage(
        new Error("Failed: UPDATE users SET email = 'jane@example.com'")
      )
    ).toBe("Failed: [SQL_REDACTED]");
  });

  it("caps recursive traversal depth", () => {
    let deep: Record<string, unknown> = { email: "jane@example.com" };
    for (let i = 0; i < 12; i++) {
      deep = { nested: deep };
    }

    const redacted = redactSensitive(deep);

    expect(JSON.stringify(redacted)).toContain("[MAX_DEPTH]");
    expect(JSON.stringify(redacted)).not.toContain("jane@example.com");
  });
});
