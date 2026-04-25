const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFiles: ["<rootDir>/jest.env.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Stub Next.js 16 node-environment-extensions that cause stack overflow during Jest teardown
    "next/dist/server/node-environment-extensions/(.*)":
      "<rootDir>/src/__tests__/utils/empty-module.js",
    // Stub @google/genai ESM module — tests that need it mock via jest.mock("@google/genai").
    // Tests that transitively import it (via search-doc-queries → query-cache → gemini.ts)
    // get this no-op stub instead of the real ESM .mjs file that Jest can't parse.
    "^@google/genai$": "<rootDir>/src/__tests__/utils/google-genai-stub.js",
    // Stub server-only — it throws at import time in non-server environments.
    // All tests that transitively import modules using `import "server-only"` need this.
    "^server-only$": "<rootDir>/src/__tests__/utils/empty-module.js",
    // Map @electric-sql/pglite to its explicit CJS build to avoid ESM dynamic-import
    // errors when Jest runs without --experimental-vm-modules.
    "^@electric-sql/pglite$":
      "<rootDir>/node_modules/@electric-sql/pglite/dist/index.cjs",
  },
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/.worktrees/",
    "<rootDir>/.claude/worktrees/",
    "<rootDir>/src/__tests__/utils/",
    "<rootDir>/src/__tests__/fixtures/",
    "<rootDir>/src/__tests__/lib/listings/collision-detector-test-utils.ts",
    "<rootDir>/tests/e2e/",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/.worktrees/",
    "<rootDir>/.claude/worktrees/",
  ],
  watchPathIgnorePatterns: [
    "<rootDir>/.worktrees/",
    "<rootDir>/.claude/worktrees/",
  ],
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
    "!src/app/layout.tsx",
    "!src/app/global-error.tsx",
  ],
  coverageThreshold: {
    "src/lib/identity/**/*.ts": {
      statements: 90,
      functions: 90,
      lines: 90,
    },
    "src/lib/validation/category/**/*.ts": {
      statements: 90,
      functions: 90,
      lines: 90,
    },
    "src/lib/db/**/*.ts": {
      statements: 90,
      functions: 90,
      lines: 90,
    },
    "src/lib/outbox/**/*.ts": {
      statements: 90,
      functions: 90,
      lines: 90,
    },
    "src/lib/audit/**/*.ts": {
      statements: 90,
      functions: 90,
      lines: 90,
    },
    "src/lib/flags/**/*.ts": {
      statements: 90,
      functions: 90,
      lines: 90,
    },
  },
  forceExit: process.env.CI === "true",
  workerIdleMemoryLimit: "512MB",
  moduleDirectories: ["node_modules", "<rootDir>/"],
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
  transformIgnorePatterns: [
    // Allow next-auth, @auth, jose, and styled-jsx packages to be transformed (ESM modules)
    "node_modules/(?!(next-auth|@auth|jose|oauth4webapi|preact|preact-render-to-string|styled-jsx|@google/genai|p-retry)/)",
    "^.+\\.module\\.(css|sass|scss)$",
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
