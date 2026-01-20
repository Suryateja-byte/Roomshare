#!/usr/bin/env python3
import json
import os
import subprocess
import sys

# Keep this conservative to avoid formatting generated folders
IGNORE_PREFIXES = (
    "node_modules/",
    ".next/",
    "dist/",
    "build/",
    "coverage/",
    ".turbo/",
)

# Prettier handles many formats; restrict to avoid pointless runs.
FORMAT_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss", ".html", ".yml", ".yaml",
}

def run(cmd, cwd, timeout=120):
    return subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)

def main() -> int:
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())

    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0

    tool_input = data.get("tool_input", {}) or {}
    rel_path = tool_input.get("file_path") or ""
    if not rel_path:
        return 0

    rel_path = rel_path.replace("\\", "/")
    if rel_path.startswith(IGNORE_PREFIXES):
        return 0

    _, ext = os.path.splitext(rel_path)
    if ext.lower() not in FORMAT_EXTS:
        return 0

    # Prettier format only the touched file (NOT the whole repo)
    try:
        r = run(["npx", "prettier", "--write", rel_path], cwd=project_dir, timeout=120)
    except Exception as e:
        print(f"post_edit_format: prettier failed to run: {e}", file=sys.stderr)
        return 0

    # If prettier failed, surface in stderr but don't block (PostToolUse happens after the tool ran anyway)
    if r.returncode != 0 and r.stderr.strip():
        print(r.stderr.strip(), file=sys.stderr)

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
