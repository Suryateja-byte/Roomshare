/**
 * @jest-environment node
 *
 * CI coverage guard (P1-7 regression).
 *
 * CI used to gate on an enumerated `--testPathPatterns` allow-list, so 78 test
 * files were never executed by any workflow: every suite under
 * src/__tests__/{security,middleware,db,schema,edge-cases,scripts,launch} plus
 * the colocated suites under src/lib. A PR could reintroduce an IDOR, break the
 * suspension middleware, or regress messaging RLS and still go green.
 *
 * This test guards the *class* of bug rather than the instance: it asks Jest
 * itself which files each CI invocation would run (via --listTests, so the real
 * matcher semantics are used rather than a reimplementation of them) and asserts
 * their union is every test file in the repo. A new test directory can therefore
 * never again be silently excluded — it is covered by default, or this fails.
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const REPO_ROOT = process.cwd();
const CI_WORKFLOW = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");

interface JestInvocation {
  job: string;
  command: string;
}

/**
 * ci.yml is checked in with CRLF terminators. Read it normalised: `.` does not
 * match `\r` in JS regexes, so a trailing CR silently breaks every end-anchored
 * pattern below.
 */
function readWorkflow(): string {
  return fs.readFileSync(CI_WORKFLOW, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Extract every `pnpm jest` invocation from ci.yml, tagged with the job it
 * belongs to. Deliberately a small line scanner rather than a YAML dependency:
 * the only structure needed is "which job is this run: line inside", and adding
 * a parser dependency for one test is not justified.
 */
function parseJestInvocations(workflow: string): JestInvocation[] {
  const invocations: JestInvocation[] = [];
  let currentJob = "";

  for (const line of workflow.split("\n")) {
    // Job keys sit at exactly two spaces of indentation: "  test-unit:"
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      currentJob = jobMatch[1];
      continue;
    }

    const runMatch = /^\s*(?:- )?run:\s*(pnpm jest\s.*)$/.exec(line);
    if (runMatch) {
      invocations.push({ job: currentJob, command: runMatch[1].trim() });
    }
  }

  return invocations;
}

/** Read the job names the `build` gate depends on. */
function parseBuildNeeds(workflow: string): string[] {
  const match = /^ {2}build:\s*$[\s\S]*?^\s*needs:\s*\[([^\]]+)\]/m.exec(
    workflow
  );
  if (!match) {
    throw new Error("Could not locate `needs:` for the build job in ci.yml");
  }
  return match[1].split(",").map((name) => name.trim());
}

/**
 * Split a shell command into argv. Handles the double-quoted values used for
 * --testPathPatterns / --testPathIgnorePatterns; no other quoting form appears
 * in these commands.
 */
function toArgv(command: string): string[] {
  const tokens = command.match(/"[^"]*"|\S+/g) ?? [];
  return tokens.map((token) => token.replace(/"/g, ""));
}

/**
 * Extract each job's raw text block, keyed by job name. Same deliberate
 * line-scanner tradeoff as parseJestInvocations. Top-level keys under `on:` land
 * in here too ("push"), which is harmless: lookups only ever use real job names
 * taken from the build gate's `needs`.
 */
function parseJobBlocks(workflow: string): Map<string, string> {
  const blocks = new Map<string, string>();
  let currentJob = "";
  let buffer: string[] = [];

  const flush = () => {
    if (currentJob) blocks.set(currentJob, buffer.join("\n"));
  };

  for (const line of workflow.split("\n")) {
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      flush();
      currentJob = jobMatch[1];
      buffer = [];
      continue;
    }
    if (currentJob) buffer.push(line);
  }
  flush();

  return blocks;
}

/** Does this job's block define `VAR:` anywhere (job-level or step-level env)? */
function jobProvidesEnv(block: string, varName: string): boolean {
  return new RegExp(`^\\s+${varName}:`, "m").test(block);
}

/**
 * Env vars a suite reads to decide whether to run at all. Matched on the
 * assignment form these gates use — `const X = process.env.FOO`, optionally
 * wrapped (`Boolean(...)`) or compared (`=== "1"`) — and only for files that
 * actually contain a `describe.skip`, so an ordinary `process.env` read is not
 * mistaken for a gate.
 *
 * A bare `describe.skip` with no env var (a deliberately retired suite, e.g.
 * create-listing.test.ts) yields no gates and is intentionally not flagged.
 */
const ENV_GATE_ASSIGNMENT = /(?:const|let)\s+\w+\s*=\s*[^;\n]*process\.env\.([A-Za-z0-9_]+)/g;
const NON_GATE_ENV = new Set(["NODE_ENV", "CI"]);

/**
 * Comments are stripped before scanning: a gate that only appears in prose is
 * not a gate. (Without this, this very file self-reports, because the doc above
 * spells out the pattern it looks for.) The `[^:]` guard keeps `https://` URLs
 * from being read as line comments.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function envGatesFor(file: string): string[] {
  const source = stripComments(
    fs.readFileSync(path.join(REPO_ROOT, file), "utf8")
  );
  if (!source.includes("describe.skip")) return [];

  const gates = new Set<string>();
  for (const match of source.matchAll(ENV_GATE_ASSIGNMENT)) {
    if (!NON_GATE_ENV.has(match[1])) gates.add(match[1]);
  }
  return [...gates];
}

async function listTestsFor(command: string): Promise<string[]> {
  // Drop the `pnpm` prefix and run jest directly; --listTests resolves the file
  // set without executing anything.
  const argv = toArgv(command).slice(1);
  const { stdout } = await execFileAsync(
    "node",
    [
      path.join(REPO_ROOT, "node_modules", "jest", "bin", "jest.js"),
      ...argv.filter((arg) => arg !== "jest" && arg !== "--coverage"),
      "--listTests",
    ],
    {
      cwd: REPO_ROOT,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "--experimental-vm-modules" },
    }
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((absolute) => path.relative(REPO_ROOT, absolute));
}

interface Resolution {
  buildNeeds: string[];
  gatedInvocations: JestInvocation[];
  /** Files each gated invocation would run, positionally aligned with it. */
  perInvocation: string[][];
  allTests: string[];
  jobBlocks: Map<string, string>;
}

/**
 * Resolving the file set costs ~12 jest processes; both tests need the same
 * answer, so do it once.
 */
let resolution: Promise<Resolution> | undefined;

function resolveCiCoverage(): Promise<Resolution> {
  resolution ??= (async () => {
    const workflow = readWorkflow();
    const buildNeeds = parseBuildNeeds(workflow);
    const gatedInvocations = parseJestInvocations(workflow).filter(
      (invocation) => buildNeeds.includes(invocation.job)
    );

    const [allTests, ...perInvocation] = await Promise.all([
      listTestsFor("pnpm jest"),
      ...gatedInvocations.map((invocation) => listTestsFor(invocation.command)),
    ]);

    return {
      buildNeeds,
      gatedInvocations,
      perInvocation,
      allTests,
      jobBlocks: parseJobBlocks(workflow),
    };
  })();

  return resolution;
}

describe("CI test coverage", () => {
  // Spawns ~12 short-lived jest --listTests processes in parallel.
  jest.setTimeout(120_000);

  it("runs every test file in at least one build-gated job", async () => {
    const { gatedInvocations, perInvocation, allTests } =
      await resolveCiCoverage();

    expect(gatedInvocations.length).toBeGreaterThan(0);

    const covered = new Set(perInvocation.flat());
    const uncovered = allTests.filter((file) => !covered.has(file)).sort();

    expect({ count: uncovered.length, files: uncovered }).toEqual({
      count: 0,
      files: [],
    });
  });

  /**
   * Enumeration is not execution (FL-4 regression).
   *
   * The assertion above proves every file is *listed* by some build-gated job.
   * It cannot see that a suite gated on `process.env.REAL_DB_URL` resolves to
   * `describe.skip` in every one of those jobs, because no workflow set that
   * variable — so the real-Postgres proofs for the contact-paywall idempotency
   * scope, the alert-bounds PostGIS predicate and the Stripe webhook concurrency
   * lock contributed nothing to the merge gate while appearing covered.
   *
   * This asserts the stronger property: a suite that gates itself on an env var
   * must be run by a build-gated job that actually provides it.
   */
  it("provides the env gate for every suite that would otherwise skip entirely", async () => {
    const { gatedInvocations, perInvocation, allTests, jobBlocks } =
      await resolveCiCoverage();

    const dark: Array<{ file: string; gate: string }> = [];

    for (const file of allTests) {
      for (const gate of envGatesFor(file)) {
        const runsWithGate = gatedInvocations.some(
          (invocation, index) =>
            perInvocation[index].includes(file) &&
            jobProvidesEnv(jobBlocks.get(invocation.job) ?? "", gate)
        );
        if (!runsWithGate) dark.push({ file, gate });
      }
    }

    expect(dark.sort((a, b) => a.file.localeCompare(b.file))).toEqual([]);
  });
});
