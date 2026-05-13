import { spawnSync } from "node:child_process";
import process from "node:process";

export const CONTACT_HOST_RLS_TABLES = [
  "Conversation",
  "_ConversationParticipants",
  "Message",
  "ConversationDeletion",
  "TypingStatus",
];

export const CONTACT_HOST_REALTIME_TABLES = ["Message"];

export const CONTACT_HOST_REALTIME_FORBIDDEN_TABLES = [
  "BlockedUser",
  "Conversation",
  "_ConversationParticipants",
  "ConversationDeletion",
  "TypingStatus",
];

const REQUIRED_STATUS_LABELS = new Map([
  ["API URL", "apiUrl"],
  ["DB URL", "dbUrl"],
  ["Studio URL", "studioUrl"],
]);

const REMOTE_HINT_ENV_NAMES = [
  /^SUPABASE_ACCESS_TOKEN$/i,
  /^SUPABASE_PROJECT_REF$/i,
  /^SUPABASE_DB_PASSWORD$/i,
  /^SUPABASE_SERVICE_ROLE_KEY$/i,
  /^SUPABASE_JWT_SECRET$/i,
  /SUPABASE.*(?:ANON|SERVICE_ROLE|SECRET|JWT|TOKEN|PASSWORD|KEY)/i,
];

const URL_ENV_NAMES = [
  /(?:^|_)(?:DATABASE|DB|POSTGRES|SUPABASE).*URL/i,
  /URL.*(?:DATABASE|DB|POSTGRES|SUPABASE)/i,
  /(?:^|_)DIRECT_URL$/i,
  /^POSTGRES_PRISMA_URL$/i,
  /^POSTGRES_URL_NON_POOLING$/i,
];

const NON_LOCAL_TARGET_ENV_PATTERN =
  /(?:^|_)(?:STAGING|PRODUCTION|PROD)(?:_|$)/i;

const SECRET_LINE_PATTERN =
  /\b(secret|anon key|service_role key|service role key|jwt|password|token)\b/i;
const SECRET_VALUE_PATTERN =
  /\b(eyJ[a-zA-Z0-9_-]+?\.[a-zA-Z0-9_-]+?\.[a-zA-Z0-9_-]+|sbp_[a-zA-Z0-9_-]+|sb_secret_[a-zA-Z0-9_-]+)\b/g;
const URL_USERINFO_PATTERN =
  /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi;

export function fail(code, message, details = []) {
  console.error(`supabase-rls-proof failed: ${code}`);
  console.error(message);

  for (const detail of details) {
    console.error(`- ${detail}`);
  }

  process.exit(1);
}

export function info(message) {
  console.log(`supabase-rls-proof: ${message}`);
}

function isLocalHost(hostname) {
  const host = hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  if (host === "::1" || host === "[::1]") {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }

  const octets = ipv4.slice(1).map(Number);
  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  return octets[0] === 127;
}

export function assertLocalUrl(rawValue, source) {
  let parsed;

  try {
    parsed = new URL(rawValue);
  } catch {
    fail("INVALID_URL", `${source} is set but is not a parseable URL.`);
  }

  if (!isLocalHost(parsed.hostname)) {
    fail(
      "UNSAFE_REMOTE_URL",
      `${source} must point at localhost or 127.0.0.0/8.`,
      ["Refusing non-local host."]
    );
  }

  if (!parsed.port) {
    fail("LOCAL_PORT_MISSING", `${source} must include an explicit local port.`);
  }

  return parsed;
}

export function sanitizeUrl(rawValue) {
  try {
    const parsed = new URL(rawValue);
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? "redacted" : "";
      parsed.password = parsed.password ? "redacted" : "";
    }
    return parsed.toString();
  } catch {
    return redactSecrets(rawValue);
  }
}

export function redactSecrets(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => {
      if (line.includes("│")) {
        const cells = line.split("│");
        const hasSecretCell = cells.some((cell) =>
          SECRET_LINE_PATTERN.test(cell)
        );

        if (hasSecretCell) {
          return cells
            .map((cell, index) => {
              if (index === 0 || index === cells.length - 1) {
                return cell;
              }

              return index === 1 ? cell : " [REDACTED] ";
            })
            .join("│");
        }
      }

      if (SECRET_LINE_PATTERN.test(line)) {
        const [label] = line.split(":", 1);
        return label ? `${label}: [REDACTED]` : "[REDACTED]";
      }

      return line
        .replace(URL_USERINFO_PATTERN, "$1redacted:redacted@")
        .replace(SECRET_VALUE_PATTERN, "[REDACTED]");
    })
    .join("\n")
    .trim();
}

export function runCommand(command, args, options = {}) {
  const run = (executable) =>
    spawnSync(executable, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });

  const result = run(command);

  if (
    result.error?.code === "ENOENT" &&
    process.platform === "win32" &&
    !/\.(bat|cmd|exe)$/i.test(command)
  ) {
    return run(`${command}.cmd`);
  }

  return result;
}

export function commandOutput(result) {
  return redactSecrets(`${result.stdout || ""}\n${result.stderr || ""}`.trim());
}

export function splitSqlStatements(sql) {
  const statements = [];
  let statementStart = 0;
  let index = 0;
  let state = "base";
  let dollarTag = null;

  while (index < sql.length) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    if (state === "base") {
      if (char === "'") {
        state = "single-quote";
        index += 1;
        continue;
      }

      if (char === '"') {
        state = "double-quote";
        index += 1;
        continue;
      }

      if (char === "-" && nextChar === "-") {
        state = "line-comment";
        index += 2;
        continue;
      }

      if (char === "/" && nextChar === "*") {
        state = "block-comment";
        index += 2;
        continue;
      }

      if (char === "$") {
        const dollarMatch = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/);
        if (dollarMatch) {
          dollarTag = dollarMatch[0];
          state = "dollar-quote";
          index += dollarTag.length;
          continue;
        }
      }

      if (char === ";") {
        const statement = sql.slice(statementStart, index).trim();
        if (statement) {
          statements.push(statement);
        }
        statementStart = index + 1;
      }

      index += 1;
      continue;
    }

    if (state === "single-quote") {
      if (char === "'" && nextChar === "'") {
        index += 2;
        continue;
      }

      if (char === "'") {
        state = "base";
      }

      index += 1;
      continue;
    }

    if (state === "double-quote") {
      if (char === '"' && nextChar === '"') {
        index += 2;
        continue;
      }

      if (char === '"') {
        state = "base";
      }

      index += 1;
      continue;
    }

    if (state === "line-comment") {
      if (char === "\n") {
        state = "base";
      }

      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && nextChar === "/") {
        state = "base";
        index += 2;
        continue;
      }

      index += 1;
      continue;
    }

    if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        state = "base";
        dollarTag = null;
        continue;
      }

      index += 1;
      continue;
    }
  }

  const finalStatement = sql.slice(statementStart).trim();
  if (finalStatement) {
    statements.push(finalStatement);
  }

  return statements;
}

function relevantUrlEnvEntries(env) {
  return Object.entries(env).filter(([name, value]) => {
    if (!value) {
      return false;
    }

    return URL_ENV_NAMES.some((pattern) => pattern.test(name));
  });
}

function checkEnvironment(env) {
  const remoteHintNames = Object.entries(env)
    .filter(
      ([name, value]) =>
        value && REMOTE_HINT_ENV_NAMES.some((pattern) => pattern.test(name))
    )
    .map(([name]) => name);

  if (remoteHintNames.length > 0) {
    fail(
      "UNSAFE_REMOTE_ENV_HINT",
      "Remote Supabase credential/project environment hints are present. Clear them before running the local RLS proof scripts.",
      remoteHintNames.map((name) => `${name} is set`)
    );
  }

  for (const [name, value] of relevantUrlEnvEntries(env)) {
    if (
      /supabase\.co/i.test(value) ||
      NON_LOCAL_TARGET_ENV_PATTERN.test(name) ||
      /(?:^|[._-])(?:staging|production|prod)(?:[._-]|$)/i.test(value)
    ) {
      fail(
        "UNSAFE_REMOTE_ENV_HINT",
        `${name} looks like a remote provider target.`,
        ["Only local Supabase/database URLs are allowed for these scripts."]
      );
    }

    assertLocalUrl(value, name);
  }
}

function parseStatus(output) {
  const parsed = {};
  let section = null;

  for (const line of output.split(/\r?\n/)) {
    if (line.includes("Development Tools")) {
      section = "developmentTools";
      continue;
    }

    if (line.includes("APIs")) {
      section = "apis";
      continue;
    }

    if (line.includes("Database")) {
      section = "database";
      continue;
    }

    if (line.includes("Authentication Keys")) {
      section = "authenticationKeys";
      continue;
    }

    if (line.includes("Storage")) {
      section = "storage";
      continue;
    }

    const tableCells = line.includes("│")
      ? line
          .split("│")
          .slice(1, -1)
          .map((cell) => cell.trim())
      : [];
    const match =
      tableCells.length >= 2 ? null : line.match(/^\s*([^:]+):\s*(.+?)\s*$/);

    if (!match && tableCells.length < 2) {
      continue;
    }

    const label = match ? match[1].trim() : tableCells[0];
    const value = match ? match[2].trim() : tableCells[1];
    let key = REQUIRED_STATUS_LABELS.get(label);

    if (!key && section === "developmentTools" && label === "Studio") {
      key = "studioUrl";
    }

    if (!key && section === "apis" && label === "Project URL") {
      key = "apiUrl";
    }

    if (!key && section === "database" && label === "URL") {
      key = "dbUrl";
    }

    if (!key || parsed[key]) {
      continue;
    }

    parsed[key] = value;
  }

  return parsed;
}

export function discoverLocalDatabaseUrl() {
  checkEnvironment(process.env);

  const result = runCommand("supabase", ["status"]);
  const output = commandOutput(result);

  if (result.error?.code === "ENOENT") {
    fail("CLI_MISSING", "Supabase CLI is not on PATH.");
  }

  if (result.error) {
    fail("CLI_UNAVAILABLE", "Unable to execute Supabase CLI.", [
      result.error.message,
    ]);
  }

  if (result.status !== 0) {
    fail("LOCAL_STACK_UNAVAILABLE", "Supabase local stack status failed.", [
      output || "No Supabase status output.",
    ]);
  }

  const status = parseStatus(`${result.stdout || ""}\n${result.stderr || ""}`);
  if (!status.dbUrl) {
    fail("LOCAL_STATUS_INCOMPLETE", "Supabase status did not include DB URL.", [
      output || "No Supabase status output.",
    ]);
  }

  const dbUrl = assertLocalUrl(status.dbUrl, "Supabase status DB URL");
  info(`using local DB ${sanitizeUrl(dbUrl.toString())}`);
  return dbUrl.toString();
}
