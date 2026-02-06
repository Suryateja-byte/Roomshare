import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
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
    // E2E tests (Playwright, not React components - causes false positive hook errors)
    "tests/**",
  ]),
  // Rule overrides for pre-existing issues (to be fixed in follow-up PRs)
  {
    rules: {
      // Downgrade to warnings - many pre-existing occurrences
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-namespace": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      // React rules - common in JSX text content
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",
      // Next.js rules - some valid uses of <a> for external links
      "@next/next/no-html-link-for-pages": "warn",
      // TypeScript rules
      "@typescript-eslint/ban-ts-comment": "warn",
      // Style rules
      "prefer-const": "warn",
      // setState in useEffect is common pattern for hydration/sync with external systems
      // This rule is overly strict for legitimate use cases
      "react-hooks/set-state-in-effect": "off",
      // React hooks memoization - has false positives on valid patterns
      "react-hooks/preserve-manual-memoization": "warn",
      // React Compiler rules - has false positives on valid patterns
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
