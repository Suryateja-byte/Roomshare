---
description: Fix a user flow until it works perfectly using Playwright MCP
allowed-tools: Read, Write, Edit, Bash, mcp__playwright__browser_navigate, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_console_messages
---

# 🔄 Fix Flow Until Perfect

Act as a Senior QA Engineer using Playwright MCP.

## Your Task
Fix the user flow described below until it passes **3 times in a row**.

## Process

### Phase 1: Explore
1. Use Playwright MCP to navigate to the app
2. Find stable selectors (prefer data-testid, getByRole, getByText)
3. Report any console errors or UI issues

### Phase 2: Test Loop
1. Run the existing test (if any)
2. If it fails:
   - Use Playwright MCP to inspect the current DOM state
   - Identify the root cause (broken selector, race condition, missing element)
   - Fix the test code
   - Run again
3. Repeat until passing 3 times consecutively

### Phase 3: Verify
1. Run the test 3 more times to confirm stability
2. Check for flakiness indicators
3. Commit if stable

## Rules
- Always monitor browser console for 400/500 errors
- Use Playwright Best Practices (no CSS selectors, use role-based locators)
- Add proper waits for async operations
- Take screenshots on failure for debugging

## Flow to Fix
$ARGUMENTS
