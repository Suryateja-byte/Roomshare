# Roomshare — Codex Project Rules

This `AGENTS.md` file is the canonical source of truth for project-specific
operating rules, guidelines, and conventions.

Reusable task playbooks may live under [`.agents/workflows`](.agents/workflows).
Those workflow files extend this document, but they do not replace it.

These repo instructions guide Codex behavior inside this workspace. They do not
override higher-priority platform, system, developer, or tool constraints.

## Implementation Triad Workflow

For this repo, `implementation` means any task that mutates repo-tracked files
or otherwise applies repo-tracked changes.

Implementation work uses a phase-gated workflow coordinated by
`Workflow Orchestrator` and these exact role names:

- `Workflow Orchestrator`
- `Planning agent`
- `Generating agent`
- `Critic`

### Required Workflow

- `Workflow Orchestrator` controls the sequence and approves plans for
  normal-risk tasks.
- Require user approval before leaving `Plan` for high-risk changes: schema or
  migration changes, new production dependencies, external API contract changes,
  auth/security-sensitive behavior changes, or destructive operations.
- `Planning agent` runs first. It must scan the local repo first and browse
  primary sources only when external APIs, libraries, standards, security, or
  best-practice choices materially affect the plan.
- `Planning agent` must produce an approved planning artifact before any edits
  begin.
- `Generating agent` is the only role allowed to edit repo-tracked files.
- `Critic` is review-only and may review only after a concrete slice artifact
  exists.
- Do not advance to the next slice until the current slice has explicit
  `Critic` approval.
- Escalate to `Replan` if a slice fails review twice, critique feedback
  conflicts across rounds, or the requested fix would change plan assumptions.
- Use real subagents only when the user explicitly asks for delegation or
  subagents. Otherwise run the same stages sequentially in-thread.
- Optional helper subagents may be used only for read-only research, tests, log
  analysis, security review, or other specialist review. Never run parallel
  writers.
- Follow the detailed procedure in
  [`.agents/workflows/implementation-triad.md`](.agents/workflows/implementation-triad.md)
  and the reusable skill in
  [`.agents/skills/implementation-triad/SKILL.md`](.agents/skills/implementation-triad/SKILL.md).

## Code Navigation

### Tool Selection: LSP vs Grep/Glob

**Use LSP for semantic operations (understanding code):**

- `goToDefinition` — find where a symbol is declared (NEVER use grep for this)
- `findReferences` — find all usages of a function/variable/type (not grep)
- `hover` — check type signatures, return types, and doc comments
- `getDiagnostics` — after EVERY file edit to catch type errors immediately
- `documentSymbol` — list all symbols in a file (functions, classes, types)

**Use Grep/Glob for text operations (finding things):**

- String literals, error messages, config values, comments
- File discovery by name pattern (`**/*.spec.ts`, `src/**/utils.*`)
- Regex pattern matching across files (`TODO:`, `console\.log`)
- Non-code files (JSON, YAML, Markdown, Dockerfile, .env.example)
- Broad exploration when you don't yet know which files are relevant
- Cross-language searching (SQL migrations, Docker configs, CI files)

### Mandatory Workflow

1. **Grep/Glob** to find candidate files and narrow the search space
2. **LSP goToDefinition** to jump to the exact symbol declaration
3. **LSP findReferences** to understand blast radius before making changes
4. **LSP hover** to verify types and signatures
5. **After editing → LSP getDiagnostics** for immediate error feedback

### Hard Rules

- **NEVER grep to find a function/class/type definition** — use `goToDefinition`
- **NEVER grep find-and-replace for symbol renaming** — use LSP rename
- **ALWAYS check LSP diagnostics after editing a file** — catches type errors immediately
- **NEVER read an entire file just to understand one symbol** — use `hover` or `goToDefinition`
- **DO use grep for string literals and comments** — LSP does not index these
- **DO use glob for file discovery** — LSP has no file search equivalent

### Why This Matters

- LSP returns the ONE correct definition; grep returns every text match (imports, comments, string literals, test mocks)
- LSP understands scope; grep conflates a local `config` with a module-level `config`
- LSP catches type errors in ~50ms; `tsc --noEmit` takes 30-60s
- LSP queries consume ~75% fewer tokens than grep-based analysis
- Grep is strictly better for non-code content (configs, docs, string literals)

### Fallback

- If LSP server is not running or still initializing → fall back to grep
- If LSP returns no results (dynamic code, untyped JS) → supplement with grep
- For files LSP doesn't cover (JSON, YAML, Markdown, config) → always use grep
