#!/usr/bin/env bash
# =============================================================================
# Skip Count Dashboard — tracks test.skip() usage across E2E test files
# Usage: ./scripts/count-test-skips.sh [--threshold N] [--ci]
# =============================================================================
set -euo pipefail

THRESHOLD="${1:-9999}"
CI_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --ci) CI_MODE=true; shift ;;
    *) shift ;;
  esac
done

E2E_DIR="tests/e2e"

echo "═══════════════════════════════════════════════════"
echo "  Test Skip Dashboard"
echo "═══════════════════════════════════════════════════"
echo ""

# Total skip count
TOTAL_SKIPS=$(grep -r 'test\.skip' "$E2E_DIR" --include="*.spec.ts" --include="*.ts" -c 2>/dev/null | awk -F: '{sum += $2} END {print sum}')
TOTAL_FILES=$(grep -rl 'test\.skip' "$E2E_DIR" --include="*.spec.ts" --include="*.ts" 2>/dev/null | wc -l)

echo "  Total test.skip():  $TOTAL_SKIPS across $TOTAL_FILES files"
echo ""

# Category breakdown
echo "  ── By Category ──────────────────────────────────"
HARDCODED=$(grep -r 'test\.skip(true' "$E2E_DIR" --include="*.spec.ts" -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')
echo "  Hardcoded (test.skip(true)):  $HARDCODED"

MAP_SKIPS=$(grep -r 'test\.skip.*[Mm]ap\|test\.skip.*marker\|test\.skip.*isMapAvailable\|test\.skip.*getFirstMarker' "$E2E_DIR" --include="*.spec.ts" -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')
echo "  Map-related:                  $MAP_SKIPS"

AUTH_SKIPS=$(grep -r 'test\.skip.*[Aa]uth.*expired\|test\.skip.*!ready\|test\.skip.*session' "$E2E_DIR" --include="*.spec.ts" -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')
echo "  Auth session expired:         $AUTH_SKIPS"

CI_SKIPS=$(grep -r 'test\.skip(!!process\.env\.CI' "$E2E_DIR" --include="*.spec.ts" -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')
echo "  CI-environment:               $CI_SKIPS"

PRECONDITION=$(grep -r 'test\.skip(!listing\|test\.skip(!canBook\|test\.skip(!submitted\|test\.skip(!.*Url' "$E2E_DIR" --include="*.spec.ts" -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')
echo "  Precondition (missing data):  $PRECONDITION"

echo ""
echo "  ── Threshold Check ────────────────────────────────"
echo "  Current: $TOTAL_SKIPS  |  Threshold: $THRESHOLD"

if [ "$TOTAL_SKIPS" -gt "$THRESHOLD" ]; then
  echo "  ❌ OVER THRESHOLD by $((TOTAL_SKIPS - THRESHOLD))"
  if [ "$CI_MODE" = true ]; then
    echo ""
    echo "::error::Test skip count ($TOTAL_SKIPS) exceeds threshold ($THRESHOLD)"
    exit 1
  fi
else
  echo "  ✅ Within threshold"
fi

echo ""
echo "═══════════════════════════════════════════════════"
