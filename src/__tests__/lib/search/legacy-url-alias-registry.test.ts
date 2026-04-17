import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

import {
  LEGACY_URL_ALIASES,
  PARSER_LEGACY_ALIAS_MAP,
} from "@/lib/search-params";

const TRACKED_ROOTS = new Set(["raw", "input", "legacyCompatibleInput"]);
const CANONICAL_TARGETS = new Set<string>(
  Object.values(PARSER_LEGACY_ALIAS_MAP)
);
const SOURCE_FILES = [
  "src/lib/search-params.ts",
  "src/lib/search/search-query.ts",
  "src/app/actions/saved-search.ts",
] as const;

function collectTrackedPropertyNames(node: ts.Node): string[] {
  const names = new Set<string>();

  const visit = (current: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(current) &&
      ts.isIdentifier(current.expression) &&
      TRACKED_ROOTS.has(current.expression.text)
    ) {
      names.add(current.name.text);
    }

    current.forEachChild(visit);
  };

  visit(node);
  return [...names];
}

function collectParserAliasKeysFromSource(): string[] {
  const discoveredAliases = new Set<string>();

  for (const relativeFile of SOURCE_FILES) {
    const absoluteFile = path.join(process.cwd(), relativeFile);
    const sourceText = fs.readFileSync(absoluteFile, "utf8");
    const sourceFile = ts.createSourceFile(
      absoluteFile,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node) => {
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      ) {
        const propertyNames = collectTrackedPropertyNames(node);
        const aliases = propertyNames.filter(
          (name) => !CANONICAL_TARGETS.has(name)
        );

        if (
          aliases.length > 0 &&
          propertyNames.some((name) => CANONICAL_TARGETS.has(name))
        ) {
          aliases.forEach((alias) => discoveredAliases.add(alias));
        }
      }

      node.forEachChild(visit);
    };

    visit(sourceFile);
  }

  return [...discoveredAliases].sort();
}

describe("CFM-604-F1 legacy URL alias registry", () => {
  it("every LEGACY_URL_ALIASES entry has a parser registry mapping", () => {
    const missingFromParserRegistry = LEGACY_URL_ALIASES.filter(
      (alias) => !(alias in PARSER_LEGACY_ALIAS_MAP)
    );

    expect(missingFromParserRegistry).toEqual([]);
  });

  it("every parser registry alias is allowlisted for telemetry", () => {
    const allowlistedAliases = new Set<string>(LEGACY_URL_ALIASES);
    const missingFromAllowlist = Object.keys(PARSER_LEGACY_ALIAS_MAP)
      .sort()
      .filter((alias) => !allowlistedAliases.has(alias));

    expect(missingFromAllowlist).toEqual([]);
  });

  it("keeps the parser registry and telemetry allowlist set-equal", () => {
    expect(Object.keys(PARSER_LEGACY_ALIAS_MAP).sort()).toEqual(
      [...LEGACY_URL_ALIASES].sort()
    );
  });

  it("matches the alias fallbacks implemented in parser source", () => {
    expect(collectParserAliasKeysFromSource()).toEqual(
      Object.keys(PARSER_LEGACY_ALIAS_MAP).sort()
    );
  });
});
