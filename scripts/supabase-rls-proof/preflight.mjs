#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

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

function fail(code, message, details = []) {
  console.error(`supabase-rls-proof preflight failed: ${code}`);
  console.error(message);

  for (const detail of details) {
    console.error(`- ${detail}`);
  }

  process.exit(1);
}

function info(message) {
  console.log(`supabase-rls-proof preflight: ${message}`);
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

function assertLocalUrl(rawValue, source) {
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
    fail(
      "LOCAL_PORT_MISSING",
      `${source} must include an explicit local port.`
    );
  }

  return parsed;
}

function sanitizeUrl(rawValue) {
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

function redactSecrets(output) {
  return output
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
      "Remote Supabase credential/project environment hints are present. Clear them before running local RLS proof preflight.",
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
        ["Only local Supabase/database URLs are allowed for this preflight."]
      );
    }

    assertLocalUrl(value, name);
  }
}

function runCommand(command, args) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

function checkSupabaseCli() {
  const result = runCommand("supabase", ["--version"]);

  if (result.error?.code === "ENOENT") {
    fail("CLI_MISSING", "Supabase CLI is not on PATH.", [
      "Install the Supabase CLI using the approved local developer setup, then rerun this preflight.",
      "This script will not download or install the CLI.",
    ]);
  }

  if (result.error) {
    fail("CLI_UNAVAILABLE", "Unable to execute Supabase CLI.", [
      result.error.message,
    ]);
  }

  if (result.status !== 0) {
    fail(
      "CLI_UNAVAILABLE",
      "Supabase CLI returned a nonzero exit code for --version.",
      [redactSecrets(result.stderr || result.stdout || "No CLI output.")]
    );
  }

  const version = redactSecrets((result.stdout || result.stderr || "").trim());
  info(`Supabase CLI detected (${version || "version unavailable"}).`);
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

    if (!key) {
      continue;
    }

    if (parsed[key]) {
      continue;
    }

    parsed[key] = value;
  }

  return parsed;
}

function checkSupabaseStatus() {
  const result = runCommand("supabase", ["status"]);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const redactedOutput = redactSecrets(output);

  if (result.status !== 0) {
    fail(
      "LOCAL_STACK_UNAVAILABLE",
      "Supabase local stack status is not available.",
      [
        "Run `supabase init` and `supabase start` through the approved local setup when ready.",
        redactedOutput || "No Supabase status output.",
      ]
    );
  }

  const status = parseStatus(output);
  const missingLabels = [...REQUIRED_STATUS_LABELS.values()].filter(
    (key) => !status[key]
  );

  if (missingLabels.length > 0) {
    fail(
      "LOCAL_STATUS_INCOMPLETE",
      "Supabase status did not include the required local endpoints.",
      [
        `Missing: ${missingLabels.join(", ")}`,
        redactedOutput || "No Supabase status output.",
      ]
    );
  }

  const apiUrl = assertLocalUrl(status.apiUrl, "Supabase status API URL");
  const dbUrl = assertLocalUrl(status.dbUrl, "Supabase status DB URL");
  const studioUrl = assertLocalUrl(
    status.studioUrl,
    "Supabase status Studio URL"
  );

  info("local Supabase stack appears safe for later provider proof.");
  console.log(`- API URL: ${sanitizeUrl(apiUrl.toString())}`);
  console.log(`- DB URL: ${sanitizeUrl(dbUrl.toString())}`);
  console.log(`- Studio URL: ${sanitizeUrl(studioUrl.toString())}`);
}

checkEnvironment(process.env);
checkSupabaseCli();
checkSupabaseStatus();
