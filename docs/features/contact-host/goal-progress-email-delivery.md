# Contact Host Email Delivery Runtime Verification

Status: blocked / reduced on 2026-05-12.

Outcome: safe local evidence verifies mocked email invocation and provider-client
guard behavior, but actual Contact Host new-message email delivery cannot be
closed locally. A local template render check proves the current Contact Host
`newMessage` payload is incomplete for the real template, so provider delivery
must remain P2 blocked until the product payload/template mismatch is fixed and
then reverified with a mocked transport or approved staging provider path.

## Evidence

| Area | Result | Evidence |
|---|---|---|
| Message send notification path | Source creates a `NEW_MESSAGE` internal notification and calls `sendNotificationEmailWithPreference("newMessage", recipientId, recipientEmail, data)` for other participants with email addresses. | `src/lib/messaging/send-conversation-message.ts:194-223` |
| Mocked API invocation | Existing `/api/messages` test asserts the internal notification payload and mocked preference-aware email call, scoped to the other participant email. | `src/__tests__/api/messages.test.ts:624-650` |
| Provider client safety | `sendEmail` returns success without provider I/O when `RESEND_API_KEY` is absent, uses `fetchWithTimeout("https://api.resend.com/emails", ...)` only when configured, and has retry/circuit-breaker coverage through mocked `fetchWithTimeout`. | `src/lib/email.ts:64-112`; `src/__tests__/lib/email.test.ts:75-206` |
| Template runtime blocker | `emailTemplates.newMessage` requires `listingTitle` and `messagePreview`, but the Contact Host send path passes only `recipientName`, `senderName`, and `conversationId`. Rendering that payload locally fails before any provider call. | `src/lib/email-templates.ts:88-103`; `src/lib/messaging/send-conversation-message.ts:213-221`; local command below |

## Commands

| Command | Result |
|---|---|
| `Set-Location '\\wsl$\Ubuntu\home\surya\roomshare'; pnpm jest src/__tests__/lib/email.test.ts src/__tests__/api/messages.test.ts src/__tests__/actions/chat.test.ts --runInBand` | Failed before tests: Windows Node could not resolve the WSL `node_modules/jest/bin/jest.js` path. |
| `bash -lc "cd /home/surya/roomshare && pnpm jest src/__tests__/lib/email.test.ts src/__tests__/api/messages.test.ts src/__tests__/actions/chat.test.ts --runInBand"` | Passed: 3 suites, 72 tests, 0 snapshots. Console output contained expected mocked warning/error-path logs. |
| `bash -lc 'cd /home/surya/roomshare && pnpm exec ts-node --transpile-only --compiler-options "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" -e "const { emailTemplates } = require(\"./src/lib/email-templates\"); try { const rendered = emailTemplates.newMessage({ recipientName: \"Host\", senderName: \"Guest\", conversationId: \"conv-123\" }); console.log(JSON.stringify({ ok: true, subject: rendered.subject, hasHtml: typeof rendered.html === \"string\" })); } catch (error) { console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })); throw error; }"'` | Failed as expected without provider I/O: `{"ok":false,"error":"Cannot read properties of undefined (reading 'replace')"}`. |

## Classification

This slice reduces the old generic email-delivery P2 from "not verified" to:

- Verified locally: mocked Contact Host notification/email invocation, recipient
  scoping to the other participant, no real provider call in dev mode without
  `RESEND_API_KEY`, retry/circuit-breaker/failure handling at the provider
  abstraction.
- Blocked locally: real Contact Host `newMessage` template rendering for the
  current send-path payload.
- Not verified: real provider acceptance, inbox delivery, bounce/webhook
  behavior, and provider-level observability. These require either a product fix
  plus mocked transport coverage, or approved staging/provider credentials. No
  real email was sent in this slice.
