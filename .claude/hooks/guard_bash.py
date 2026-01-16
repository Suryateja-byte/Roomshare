#!/usr/bin/env python3
import json
import re
import sys

# Hard blocks: things that can wipe disks, exfiltrate, or execute remote code
BLOCK_RULES = [
    (r"\brm\s+-rf\s+/(?:\s|$)", "Blocked: destructive delete of root filesystem."),
    (r"\brm\s+-rf\s+~(?:\s|$)", "Blocked: destructive delete of home directory."),
    (r"\bmkfs(\.\w+)?\b", "Blocked: filesystem formatting command."),
    (r"\bdd\s+if=", "Blocked: raw disk write/read pattern (dd if=...)."),
    (r"\bshutdown\b|\breboot\b", "Blocked: system shutdown/reboot."),
    (r"\bsudo\b", "Blocked: sudo is disabled in Claude Code sessions by policy."),
    (r"\bchmod\s+777\b", "Blocked: insecure chmod 777."),
    (r"\bcurl\b.*\|\s*(sh|bash)\b", "Blocked: remote code execution via curl | sh."),
    (r"\bwget\b.*\|\s*(sh|bash)\b", "Blocked: remote code execution via wget | sh."),
    (r"Invoke-Expression|IEX\b", "Blocked: PowerShell remote execution (IEX)."),
    (r"iwr\s+.*\|\s*iex\b", "Blocked: PowerShell iwr | iex."),
]

# Secret file patterns inside Bash commands (cat/type/etc.)
SECRET_PATH_RULES = [
    (r"(?i)\b(cat|type|more|less|sed|awk|python|node)\b.*\b\.env(\.|$)", "Blocked: reading .env via shell command."),
    (r"(?i)\b(cat|type|more|less)\b.*\bsecrets?/", "Blocked: reading secrets directory via shell command."),
    (r"(?i)\b(cat|type|more|less)\b.*\b(id_rsa|id_ed25519)\b", "Blocked: reading SSH private key via shell command."),
    (r"(?i)\b(cat|type|more|less)\b.*\b\.pem\b", "Blocked: reading PEM key/cert via shell command."),
]

def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        print(f"guard_bash: invalid hook input JSON: {e}", file=sys.stderr)
        return 1

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {}) or {}
    cmd = tool_input.get("command", "") or ""

    # Only validate Bash tool calls
    if tool_name != "Bash" or not cmd.strip():
        return 0

    problems = []
    for pat, msg in BLOCK_RULES:
        if re.search(pat, cmd, flags=re.IGNORECASE):
            problems.append(msg)

    for pat, msg in SECRET_PATH_RULES:
        if re.search(pat, cmd, flags=re.IGNORECASE):
            problems.append(msg)

    if problems:
        for p in problems:
            print(f"• {p}", file=sys.stderr)
        print("• If you truly need this, run it manually outside Claude Code.", file=sys.stderr)
        return 2  # exit code 2 blocks the tool call and shows stderr to Claude Code :contentReference[oaicite:6]{index=6}

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
