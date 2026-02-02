#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from pathlib import Path

# Only run heavier checks if code changed in these areas
TEST_RELEVANT_PREFIXES = (
    "src/",
    "app/",
    "pages/",
    "server/",
    "api/",
    "prisma/",
)

def run(cmd, cwd, timeout=900):
    return subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)

def detect_pm(project_dir: Path) -> list[str]:
    if (project_dir / "pnpm-lock.yaml").exists():
        return ["pnpm"]
    if (project_dir / "yarn.lock").exists():
        return ["yarn"]
    if (project_dir / "bun.lockb").exists():
        return ["bun"]
    return ["npm"]

def has_script(project_dir: Path, script: str) -> bool:
    pkg = project_dir / "package.json"
    if not pkg.exists():
        return False
    try:
        import json as _json
        data = _json.loads(pkg.read_text(encoding="utf-8"))
        scripts = (data.get("scripts") or {})
        return script in scripts
    except Exception:
        return False

def main() -> int:
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

    # If not a JS/TS project, do nothing
    if not (project_dir / "package.json").exists():
        return 0

    # Determine changed files (if not a git repo, skip)
    git_dir = project_dir / ".git"
    if not git_dir.exists():
        return 0

    diff = run(["git", "diff", "--name-only"], cwd=str(project_dir), timeout=30)
    changed = [line.strip().replace("\\", "/") for line in diff.stdout.splitlines() if line.strip()]

    if not changed:
        return 0

    pm = detect_pm(project_dir)
    pm_cmd = pm[0]

    errors = []

    # Lint (if script exists)
    if has_script(project_dir, "lint"):
        r = run([pm_cmd, "run", "lint"], cwd=str(project_dir), timeout=900)
        if r.returncode != 0:
            errors.append("lint failed")
            if r.stderr.strip():
                errors.append(r.stderr.strip()[:2000])
    else:
        # Optional: eslint if present
        eslint_bin = project_dir / "node_modules/.bin/eslint"
        if eslint_bin.exists():
            r = run(["npx", "eslint", "."], cwd=str(project_dir), timeout=900)
            if r.returncode != 0:
                errors.append("eslint failed")
                if r.stderr.strip():
                    errors.append(r.stderr.strip()[:2000])

    # Typecheck (prefer script; fallback to tsc)
    if has_script(project_dir, "typecheck"):
        r = run([pm_cmd, "run", "typecheck"], cwd=str(project_dir), timeout=900)
    else:
        r = run(["npx", "tsc", "--noEmit"], cwd=str(project_dir), timeout=900)
    if r.returncode != 0:
        errors.append("typecheck failed")
        if r.stderr.strip():
            errors.append(r.stderr.strip()[:2000])

    # Run tests only if changes touch core code paths (keeps Stop fast for docs/config edits)
    should_test = any(p.startswith(TEST_RELEVANT_PREFIXES) for p in changed)
    if should_test and has_script(project_dir, "test"):
        r = run([pm_cmd, "test"], cwd=str(project_dir), timeout=900)
        if r.returncode != 0:
            errors.append("tests failed")
            if r.stderr.strip():
                errors.append(r.stderr.strip()[:2000])

    if errors:
        # Exit code 2 blocks stopping and feeds stderr back to Claude Code :contentReference[oaicite:7]{index=7}
        print("QUALITY GATE BLOCKED STOP:", file=sys.stderr)
        for e in errors:
            print(f"- {e}", file=sys.stderr)
        print("\nFix the failures, then continue.", file=sys.stderr)
        return 2

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
