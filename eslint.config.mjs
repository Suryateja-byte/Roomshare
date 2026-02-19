import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Dependencies
    "node_modules/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated files - should not be linted
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // CommonJS config files (Next.js/Jest require CommonJS format)
    "jest.config.js",
    "jest.setup.js",
    "verify.js",
    // Static assets (service workers, map workers)
    "public/**",
    // Utility scripts (CommonJS, not part of app bundle)
    "scripts/**",
    // Internal scripts
    "src/scripts/**",
    // Test code has different ergonomics and rule expectations
    "src/__tests__/**",
    // Local multi-worktree metadata (can contain full duplicate trees)
    ".worktrees/**",
    // Local agent/editor metadata
    ".claude/**",
    // Next compiler cache
    ".swc/**",
    // E2E tests (Playwright, not React components - causes false positive hook errors)
    "tests/**",
  ]),
  // Keep this limited to core ESLint rules so plugin scoping in flat config
  // doesn't break lint execution.
  {
    rules: {
      // Style rules
      "prefer-const": "warn",
      // Keep these as warnings while we burn down legacy backlog.
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-namespace": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
