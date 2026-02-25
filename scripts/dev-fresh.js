#!/usr/bin/env node

const fs = require("fs");
const { spawn } = require("child_process");

try {
  fs.rmSync(".next", { recursive: true, force: true });
} catch {
  // Ignore cleanup failures and still attempt dev start.
}

const rawArgs = process.argv.slice(2);
const extraArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["exec", "next", "dev", ...extraArgs], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
