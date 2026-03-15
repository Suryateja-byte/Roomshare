#!/usr/bin/env node

const { spawn } = require("child_process");

const rawArgs = process.argv.slice(2);
const extraArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["run", "dev", "--", "--fresh", ...extraArgs], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
