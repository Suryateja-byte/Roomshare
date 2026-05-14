#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_PAYLOADS = [
  "scripts/fixtures/public-payload-clean.json",
  "scripts/fixtures/public-payload-search-v2.json",
  "scripts/fixtures/public-payload-search-listings.json",
  "scripts/fixtures/public-payload-map-listings.json",
  "scripts/fixtures/public-payload-listings.json",
];

function assertFilesExist(files) {
  const missing = files.filter((file) => !fs.existsSync(path.resolve(file)));
  if (missing.length > 0) {
    throw new Error(
      `Missing public payload fixture(s): ${missing.join(", ")}`
    );
  }
}

function main(argv) {
  const explicitFiles = argv.filter((arg) => !arg.startsWith("--"));
  const files = explicitFiles.length > 0 ? explicitFiles : DEFAULT_PAYLOADS;
  assertFilesExist(files);

  const scanner = path.join(__dirname, "scan-public-payload-pii.js");
  const result = spawnSync(process.execPath, [scanner, ...files], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_PAYLOADS,
};
