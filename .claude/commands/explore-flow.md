---
description: Explore a user flow using Playwright MCP browser
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_console_messages, mcp__playwright__browser_wait_for
---

# 🔍 Explore User Flow

Use Playwright MCP to physically interact with the app and explore a user flow.

## Process

1. **Navigate** to the starting URL
2. **Snapshot** the page to understand the DOM structure
3. **Find stable selectors** for interactive elements
4. **Execute** each step of the flow
5. **Monitor** console for errors (400/500 status codes)
6. **Take screenshots** at key steps
7. **Report** findings including:
   - Successful steps
   - Any errors or issues found
   - Recommended selectors for each interaction
   - Suggested improvements

## Output
Provide a summary with:
- ✅ Working steps
- ❌ Broken steps
- 🔧 Suggested fixes
- 📷 Screenshots taken

## Flow to Explore
$ARGUMENTS
