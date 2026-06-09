type RedactPattern = {
  pattern: RegExp;
  replacement: string;
};

const REDACTED_VALUE = "[REDACTED]";

// Fields to redact from logs and monitoring payloads (case-insensitive).
const REDACTED_FIELDS = new Set([
  "password",
  "token",
  "secret",
  "apikey",
  "api_key",
  "x-api-key",
  "authorization",
  "cookie",
  "set-cookie",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "bearer",
  "credential",
  "private_key",
  "privatekey",
  "csrf",
  "csrftoken",
  "ssn",
  "creditcard",
  "credit_card",
  "cardnumber",
  "cvv",
  "cvc",
]);

const SENTRY_USER_FIELDS = new Set([
  "id",
  "email",
  "username",
  "name",
  "ip_address",
]);

const REDACT_PATTERNS: RedactPattern[] = [
  {
    pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
    replacement: REDACTED_VALUE,
  },
  {
    pattern:
      /(^|[?&])((?:access[_-]?token|api[_-]?key|apikey|auth|authorization|code|cookie|email|password|phone|secret|session(?:token)?|token|address|username|name)=)[^&#\s]*/gi,
    replacement: `$1$2${REDACTED_VALUE}`,
  },
  {
    // Host part written as dot-separated atoms (no `.` inside a +-quantified
    // class) to keep backtracking linear on adversarial inputs.
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    replacement: REDACTED_VALUE,
  },
  {
    pattern: /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    pattern: /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    pattern: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    pattern:
      /\b\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Circle|Cir|Way|Place|Pl|Terrace|Ter|Trail|Trl|Parkway|Pkwy|Highway|Hwy|Alley|Aly)\.?(?:\s*,?\s*(?:Apt|Apartment|Suite|Ste|Unit|#|No\.?)\s*\w+)?\b/gi,
    replacement: "[REDACTED_ADDRESS]",
  },
  {
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d{1,5})?\b/g,
    replacement: "[REDACTED_HOST]",
  },
  {
    pattern:
      /(?:postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^\s,;)}\]]+/gi,
    replacement: "[REDACTED_URL]",
  },
  {
    pattern:
      /(?:\/(?:usr|home|var|tmp|etc|app|src|node_modules)\/[^\s,;)}\]]+)|(?:[A-Z]:\\[^\s,;)}\]]+)/gi,
    replacement: "[REDACTED_PATH]",
  },
  {
    pattern:
      /password authentication failed(?:\s+for\s+user\s+[^\s,;)}\]]+)?/gi,
    replacement: "[REDACTED_AUTH]",
  },
  {
    pattern:
      /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b\s+[^]*?(?=;|\s*$)/gi,
    replacement: "[SQL_REDACTED]",
  },
];

// Cap regex input size so a pathological payload (huge message body, data URI
// in a stack frame) cannot stall the event loop inside a serverless function.
const MAX_REDACT_INPUT_LENGTH = 10_000;

function redactString(input: string): string {
  let result =
    input.length > MAX_REDACT_INPUT_LENGTH
      ? input.slice(0, MAX_REDACT_INPUT_LENGTH) + "...[truncated]"
      : input;

  for (const { pattern, replacement } of REDACT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

function redactObject(
  obj: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    redacted[key] = REDACTED_FIELDS.has(lowerKey)
      ? REDACTED_VALUE
      : redactSensitive(value, depth + 1);
  }

  return redacted;
}

function redactSentryUser(
  user: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(user)) {
    redacted[key] = SENTRY_USER_FIELDS.has(key.toLowerCase())
      ? REDACTED_VALUE
      : redactSensitive(value, 1);
  }

  return redacted;
}

function sanitizedStackFor(
  error: Error,
  name: string,
  message: string
): string {
  if (!error.stack) {
    return `${name}: ${message}`;
  }

  const [, ...frames] = error.stack.split("\n");
  return [`${name}: ${message}`, ...frames.map(redactString)].join("\n");
}

export function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 10) return "[MAX_DEPTH]";

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return redactString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, depth + 1));
  }

  if (typeof obj === "object") {
    return redactObject(obj as Record<string, unknown>, depth);
  }

  return obj;
}

export function sanitizeErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return "Unknown error";

  let errorName = "Error";
  let rawMessage = "Unknown error";

  if (error instanceof Error) {
    errorName = error.constructor.name || "Error";
    rawMessage = error.message || "Unknown error";
  } else if (typeof error === "string") {
    rawMessage = error;
  } else {
    return "Unknown error";
  }

  const truncated =
    rawMessage.length > 200
      ? rawMessage.slice(0, 200) + "...[truncated]"
      : rawMessage;
  const sanitized = redactString(truncated);

  return errorName !== "Error" ? `${errorName}: ${sanitized}` : sanitized;
}

export function sanitizeSentryException(error: unknown): unknown {
  if (error instanceof Error) {
    const name = error.name || error.constructor.name || "Error";
    const message = sanitizeErrorMessage(error);
    const sanitized = new Error(message);

    sanitized.name = name;
    sanitized.stack = sanitizedStackFor(error, name, message);

    return sanitized;
  }

  return sanitizeErrorMessage(error);
}

export function scrubSentryEvent<T extends object>(event: T): T {
  const scrubbed = redactSensitive(event) as T;
  const scrubbedWithUser = scrubbed as T & { user?: unknown };

  if (
    scrubbedWithUser.user &&
    typeof scrubbedWithUser.user === "object" &&
    !Array.isArray(scrubbedWithUser.user)
  ) {
    scrubbedWithUser.user = redactSentryUser(
      scrubbedWithUser.user as Record<string, unknown>
    );
  }

  return scrubbed;
}
