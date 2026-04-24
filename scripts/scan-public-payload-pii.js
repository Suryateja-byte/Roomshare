#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const FORBIDDEN_KEY_PATTERNS = [
  /exact_?address/i,
  /raw_?address/i,
  /street_?address/i,
  /address_?line_?1/i,
  /unit_?(number|no|id)$/i,
  /apartment_?(number|no)$/i,
  /^phone$/i,
  /raw_?phone/i,
  /private_?phone/i,
  /exact_?point/i,
  /hidden_?coordinates/i,
  /^lat(itude)?$/i,
  /^lng|longitude$/i,
];

const PHONE_PATTERN =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;
const EXACT_ADDRESS_PATTERN =
  /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Court|Ct)\b/i;
const UNIT_PATTERN = /\b(?:apt|apartment|unit|#)\s*[A-Za-z0-9-]{1,8}\b/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathJoin(parent, key) {
  return parent ? `${parent}.${key}` : String(key);
}

function scanPublicPayloadForPii(payload, options = {}) {
  const violations = [];
  const allowedKeys = new Set(options.allowedKeys || []);

  function scan(value, currentPath) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, pathJoin(currentPath, index)));
      return;
    }

    if (isPlainObject(value)) {
      for (const [key, nested] of Object.entries(value)) {
        const nextPath = pathJoin(currentPath, key);
        if (
          !allowedKeys.has(nextPath) &&
          FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))
        ) {
          violations.push({
            path: nextPath,
            reason: "forbidden_public_key",
          });
        }
        scan(nested, nextPath);
      }
      return;
    }

    if (typeof value !== "string") {
      return;
    }

    if (PHONE_PATTERN.test(value)) {
      violations.push({ path: currentPath, reason: "raw_phone_value" });
    }
    if (EXACT_ADDRESS_PATTERN.test(value)) {
      violations.push({ path: currentPath, reason: "exact_address_value" });
    }
    if (UNIT_PATTERN.test(value)) {
      violations.push({ path: currentPath, reason: "unit_number_value" });
    }
  }

  scan(payload, "");
  return violations;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function main(argv) {
  const files = argv.filter((arg) => !arg.startsWith("--"));
  if (files.length === 0) {
    throw new Error(
      "Usage: node scripts/scan-public-payload-pii.js <payload.json> [more.json]"
    );
  }

  const allViolations = [];
  for (const file of files) {
    const payload = readJson(file);
    const violations = scanPublicPayloadForPii(payload).map((violation) => ({
      file: path.relative(process.cwd(), file),
      ...violation,
    }));
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    console.error(JSON.stringify({ ok: false, violations: allViolations }, null, 2));
    return 1;
  }

  console.log(JSON.stringify({ ok: true, scannedFiles: files.length }));
  return 0;
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
  FORBIDDEN_KEY_PATTERNS,
  scanPublicPayloadForPii,
};
