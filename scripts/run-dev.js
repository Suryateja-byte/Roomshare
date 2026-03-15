#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
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
