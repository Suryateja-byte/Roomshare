#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const projectNextDir = `${process.cwd()}/.next`;
const rawArgs = process.argv.slice(2);
const extraArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const shouldFreshStart = extraArgs.includes("--fresh");
const forwardedArgs = extraArgs.filter((arg) => arg !== "--fresh");
const isWindowsMountedWorkspace =
  process.platform === "linux" && process.cwd().startsWith("/mnt/");
const shouldWarmRoutes =
  process.env.ROOMSHARE_DISABLE_DEV_WARMUP !== "1" && isWindowsMountedWorkspace;
const LOGIN_WARMUP_URL = "/login";
const SEARCH_WARMUP_URL =
  "/search?minLat=37.70&maxLat=37.84&minLng=-122.52&maxLng=-122.35";
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function removeIfExists(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures and keep booting.
  }
}

function cleanupNextLocks(nextDir) {
  removeIfExists(path.join(nextDir, "dev", "lock"));
}

function prepareNextDir() {
  if (shouldFreshStart) {
    removeIfExists(projectNextDir);
  }

  cleanupNextLocks(projectNextDir);
}

function logWorkspaceWarning() {
  if (!isWindowsMountedWorkspace) {
    return;
  }

  console.warn(
    [
      "[roomshare] Dev performance warning:",
      `  Workspace is running from ${process.cwd()}`,
      "  WSL repos on /mnt/* are much slower than the Linux filesystem.",
      "  For fast startup and page rendering, move the repo under ~/... and run pnpm dev there.",
    ].join("\n"),
  );
}

function isMigrationStateFailure(output) {
  return (
    output.includes("have not yet been applied") ||
    output.includes("drift detected") ||
    output.includes("not in sync with the migration history") ||
    output.includes("database schema is not in sync") ||
    output.includes("_prisma_migrations") ||
    output.includes("p3005") ||
    output.includes("p3006") ||
    output.includes("p3009") ||
    output.includes("p3014")
  );
}

function formatMigrationGuardOutput(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return lines.slice(-12).map((line) => `  ${line}`).join("\n");
}

// Refuse to boot dev against a database whose migration history is behind the repo.
function verifyMigrationState() {
  const result = spawnSync(command, ["prisma", "migrate", "status"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 15000,
  });

  if (result.error) {
    console.warn(
      `[roomshare] Skipping migration status preflight: ${result.error.message}`,
    );
    return true;
  }

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();
  if (result.status === 0) {
    return true;
  }

  if (!isMigrationStateFailure(combinedOutput)) {
    console.warn(
      "[roomshare] Skipping migration guard after unexpected prisma migrate status failure.",
    );
    return true;
  }

  console.error(
    [
      "[roomshare] Refusing to start dev server: database schema is behind the repo or migration history is inconsistent.",
      "  Run `pnpm prisma migrate deploy` and then `pnpm prisma migrate status`.",
      "  Prisma output:",
      formatMigrationGuardOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`),
    ].join("\n"),
  );
  return false;
}

// Watch prisma/migrations for new directories appearing after dev boot.
// The boot-time guard above only runs once, so a migration generated during a
// running session (the "I just ran prisma migrate diff and forgot to deploy"
// case) silently breaks /search and POST /api/listings until restart.
// This watcher re-runs `prisma migrate status` whenever a new entry appears
// and emits a single loud warning to the terminal. It deliberately does NOT
// kill the dev server, since developers commonly generate then apply within
// a few seconds.
function watchMigrationsDir() {
  if (process.env.ROOMSHARE_DISABLE_MIGRATION_WATCHER === "1") {
    return;
  }
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(dir)) {
    return;
  }

  const isMigrationEntry = (name) =>
    name && name !== "migration_lock.toml" && !name.startsWith(".");

  const snapshot = () => {
    try {
      return new Set(fs.readdirSync(dir).filter(isMigrationEntry));
    } catch {
      return new Set();
    }
  };

  let known = snapshot();
  const warnedFor = new Set();
  let recheckTimer = null;

  const recheck = () => {
    recheckTimer = null;
    const current = snapshot();
    const added = [...current].filter((name) => !known.has(name));
    known = current;
    const unwarned = added.filter((name) => !warnedFor.has(name));
    if (unwarned.length === 0) {
      return;
    }

    const status = spawnSync(command, ["prisma", "migrate", "status"], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      timeout: 15000,
    });
    if (status.error) {
      return;
    }
    const out = `${status.stdout ?? ""}\n${status.stderr ?? ""}`;
    if (status.status === 0 || !isMigrationStateFailure(out.toLowerCase())) {
      // Migration was applied between detection and recheck — nothing to warn about.
      return;
    }

    for (const name of unwarned) {
      warnedFor.add(name);
    }
    console.error(
      [
        "",
        "[roomshare] ⚠️  New migration(s) detected on disk but DB is behind:",
        ...unwarned.map((name) => `    + ${name}`),
        "  Run:  pnpm prisma migrate deploy   (then restart `pnpm dev` to re-arm the guard)",
        "  Until applied, /search list rendering and POST /api/listings will throw 42703.",
        "",
      ].join("\n"),
    );
  };

  try {
    fs.watch(dir, { persistent: false }, () => {
      // Debounce so a single `prisma migrate dev` (which writes README, SQL,
      // and a .gitkeep-style file in quick succession) only triggers once.
      if (recheckTimer) {
        return;
      }
      recheckTimer = setTimeout(recheck, 750);
    });
  } catch (error) {
    console.warn(
      `[roomshare] Migration watcher disabled: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

function buildNextArgs() {
  const args = ["exec", "next", "dev"];
  const hasBundlerFlag = forwardedArgs.includes("--webpack") || forwardedArgs.includes("--turbopack");
  const hasHostnameFlag = forwardedArgs.some(
    (arg, index) =>
      arg === "--hostname" ||
      arg.startsWith("--hostname=") ||
      (index > 0 && forwardedArgs[index - 1] === "--hostname"),
  );

  if (!hasBundlerFlag) {
    args.push("--webpack");
  }

  if (!hasHostnameFlag) {
    args.push("--hostname", "0.0.0.0");
  }

  args.push(...forwardedArgs);
  return args;
}

function getDevPort() {
  for (let index = 0; index < forwardedArgs.length; index += 1) {
    const arg = forwardedArgs[index];

    if ((arg === "--port" || arg === "-p") && forwardedArgs[index + 1]) {
      return forwardedArgs[index + 1];
    }

    if (arg.startsWith("--port=")) {
      return arg.slice("--port=".length);
    }
  }

  return process.env.PORT || "3000";
}

async function fetchWarmup(url) {
  const response = await fetch(url, {
    headers: {
      "x-roomshare-dev-warmup": "1",
    },
  });

  if (!response.ok) {
    throw new Error(`Warmup request failed for ${url}: ${response.status}`);
  }

  return response.text();
}

async function warmDevRoutes() {
  const baseUrl = `http://127.0.0.1:${getDevPort()}`;

  console.warn("[roomshare] Warming login, search, and listing routes in background...");

  try {
    await fetchWarmup(`${baseUrl}${LOGIN_WARMUP_URL}`);
  } catch (error) {
    console.warn(`[roomshare] Login warmup skipped: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  let searchHtml = "";
  try {
    searchHtml = await fetchWarmup(`${baseUrl}${SEARCH_WARMUP_URL}`);
  } catch (error) {
    console.warn(`[roomshare] Search warmup skipped: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const listingMatch = searchHtml.match(/href="(\/listings\/[^"]+)"/);
  const listingPath = listingMatch?.[1] || "/listings/dev-warmup-placeholder";

  try {
    await fetchWarmup(`${baseUrl}${listingPath}`);
  } catch (error) {
    console.warn(`[roomshare] Listing warmup skipped: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

prepareNextDir();
logWorkspaceWarning();
if (!verifyMigrationState()) {
  process.exit(1);
}
watchMigrationsDir();
const child = spawn(command, buildNextArgs(), {
  stdio: ["inherit", "pipe", "pipe"],
  env: {
    ...process.env,
    UV_USE_IO_URING: process.env.UV_USE_IO_URING ?? "0",
  },
});

let warmupStarted = false;
let readyOutput = "";

const handleChildOutput = (chunk, stream) => {
  stream.write(chunk);

  if (!shouldWarmRoutes || warmupStarted) {
    return;
  }

  readyOutput = `${readyOutput}${chunk.toString()}`;
  if (readyOutput.length > 4000) {
    readyOutput = readyOutput.slice(-2000);
  }

  if (readyOutput.includes("Ready in")) {
    warmupStarted = true;
    void warmDevRoutes().catch((error) => {
      console.warn(
        `[roomshare] Route warmup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    });
  }
};

child.stdout?.on("data", (chunk) => handleChildOutput(chunk, process.stdout));
child.stderr?.on("data", (chunk) => handleChildOutput(chunk, process.stderr));

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
