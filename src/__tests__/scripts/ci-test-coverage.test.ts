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

describe("CI test coverage", () => {
  // Spawns ~12 short-lived jest --listTests processes in parallel.
  jest.setTimeout(120_000);

  it("runs every test file in at least one build-gated job", async () => {
    const workflow = readWorkflow();
    const buildNeeds = parseBuildNeeds(workflow);
    const gatedInvocations = parseJestInvocations(workflow).filter(
      (invocation) => buildNeeds.includes(invocation.job)
    );

    expect(gatedInvocations.length).toBeGreaterThan(0);

    const [allTests, ...coveredPerJob] = await Promise.all([
      listTestsFor("pnpm jest"),
      ...gatedInvocations.map((invocation) => listTestsFor(invocation.command)),
    ]);

    const covered = new Set(coveredPerJob.flat());
    const uncovered = allTests.filter((file) => !covered.has(file)).sort();

    expect({ count: uncovered.length, files: uncovered }).toEqual({
      count: 0,
      files: [],
    });
  });
});
