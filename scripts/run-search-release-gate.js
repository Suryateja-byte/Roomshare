#!/usr/bin/env node

const path = require("path");
const { spawn } = require("child_process");

const mode = process.argv[2];
const rawArgs = process.argv.slice(3);
const extraArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

if (mode !== "ssr" && mode !== "client") {
  console.error(
    "Usage: node scripts/run-search-release-gate.js <ssr|client> [...playwright args]"
  );
  process.exit(1);
}

const clientSideSearchEnabled = mode === "client" ? "true" : "false";
const projectRoot = path.resolve(__dirname, "..");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const skipBuild = process.env.SEARCH_RELEASE_GATE_SKIP_BUILD === "true";
const sharedEnv = {
  ...process.env,
  ENABLE_SEARCH_TEST_SCENARIOS: "true",
  ENABLE_CLIENT_SIDE_SEARCH: clientSideSearchEnabled,
  NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH: clientSideSearchEnabled,
  SEARCH_RELEASE_GATE_SERVER_MODE:
    process.env.SEARCH_RELEASE_GATE_SERVER_MODE ?? "start",
};

function runProcess(commandName, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, options);

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

function isWslUncPath(input) {
  return typeof input === "string" && input.startsWith("\\\\wsl$\\");
}

function toWslPath(input) {
  const match = input.match(/^\\\\wsl\$\\[^\\]+(\\.*)$/i);
  if (!match) {
    return null;
  }

  return match[1].replace(/\\/g, "/") || "/";
}

function shellEscape(input) {
  return `'${String(input).replace(/'/g, `'\\''`)}'`;
}

if (process.platform === "win32" && isWslUncPath(projectRoot)) {
  const wslProjectRoot = toWslPath(projectRoot);

  if (!wslProjectRoot) {
    console.error(`Unable to convert WSL workspace path: ${projectRoot}`);
    process.exit(1);
  }

  const envPrefix = [
    `ENABLE_SEARCH_TEST_SCENARIOS=${shellEscape("true")}`,
    `ENABLE_CLIENT_SIDE_SEARCH=${shellEscape(clientSideSearchEnabled)}`,
    `NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH=${shellEscape(
      clientSideSearchEnabled
    )}`,
    `SEARCH_RELEASE_GATE_SERVER_MODE=${shellEscape(
      process.env.SEARCH_RELEASE_GATE_SERVER_MODE ?? "start"
    )}`,
  ].join(" ");

  const commandParts = [`cd ${shellEscape(wslProjectRoot)}`];
  if (!skipBuild) {
    commandParts.push("pnpm run build");
  }
  commandParts.push(
    `${envPrefix} pnpm exec playwright test --config=playwright.search-release-gate.config.ts ${extraArgs
      .map(shellEscape)
      .join(" ")}`.trim()
  );
  const commandString = commandParts.join(" && ");

  const wslChild = spawn("wsl.exe", ["bash", "-lc", commandString], {
    stdio: "inherit",
    env: process.env,
  });

  wslChild.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  return;
}

(async () => {
  if (!skipBuild) {
    const buildCode = await runProcess(command, ["run", "build"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: sharedEnv,
    });

    if (buildCode !== 0) {
      process.exit(buildCode);
    }
  }

  const testCode = await runProcess(
    command,
    [
      "exec",
      "playwright",
      "test",
      "--config=playwright.search-release-gate.config.ts",
      ...extraArgs,
    ],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: sharedEnv,
    }
  );

  process.exit(testCode);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
