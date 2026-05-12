# Contact Host Email Delivery Runtime Verification

Status: local payload/template blocker fixed; provider delivery still not
verified on 2026-05-12.

Outcome: safe local evidence verifies mocked email invocation and provider-client
guard behavior, but actual Contact Host new-message email delivery cannot be
closed locally. CH-E074 fixes the local Contact Host `newMessage`
payload/template mismatch by passing the complete template data with a safe
listing-title fallback and normalized 160-visible-character message preview.
Real provider acceptance, inbox delivery, bounce/webhook behavior, and
provider-level observability remain P2 not verified until an approved staging
provider path exists.

## Evidence

| Area | Result | Evidence |
|---|---|---|
| Message send notification path | Source creates a `NEW_MESSAGE` internal notification and calls `sendNotificationEmailWithPreference("newMessage", recipientId, recipientEmail, data)` for other participants with email addresses. The email payload now includes `recipientName`, `senderName`, `listingTitle`, `messagePreview`, and `conversationId`. | `src/lib/messaging/send-conversation-message.ts:216-246` |
| Mocked API invocation | `/api/messages` tests assert the internal notification payload and mocked preference-aware email call, scoped to the other participant email, including complete payload, whitespace-normalized preview, 160-visible-character truncation, and fallback listing title. | `src/__tests__/api/messages.test.ts:640-784` |
| Provider client safety | `sendEmail` returns success without provider I/O when `RESEND_API_KEY` is absent, uses `fetchWithTimeout("https://api.resend.com/emails", ...)` only when configured, and has retry/circuit-breaker coverage through mocked `fetchWithTimeout`. | `src/lib/email.ts:64-112`; `src/__tests__/lib/email.test.ts:75-206` |
| Template render safety | `emailTemplates.newMessage` requires and renders `listingTitle` and `messagePreview`; focused template coverage verifies complete payload rendering and HTML escaping for recipient, sender, listing title, preview, and encoded conversation link. | `src/lib/email-templates.ts:88-103`; `src/__tests__/lib/email-templates.test.ts:1-30` |

## Commands

| Command | Result |
|---|---|
| `Set-Location '\\wsl$\Ubuntu\home\surya\roomshare'; pnpm jest src/__tests__/lib/email.test.ts src/__tests__/api/messages.test.ts src/__tests__/actions/chat.test.ts --runInBand` | Failed before tests: Windows Node could not resolve the WSL `node_modules/jest/bin/jest.js` path. |
| `bash -lc "cd /home/surya/roomshare && pnpm jest src/__tests__/lib/email.test.ts src/__tests__/api/messages.test.ts src/__tests__/actions/chat.test.ts --runInBand"` | Passed: 3 suites, 72 tests, 0 snapshots. Console output contained expected mocked warning/error-path logs. |
| `bash -lc 'cd /home/surya/roomshare && pnpm exec ts-node --transpile-only --compiler-options "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" -e "const { emailTemplates } = require(\"./src/lib/email-templates\"); try { const rendered = emailTemplates.newMessage({ recipientName: \"Host\", senderName: \"Guest\", conversationId: \"conv-123\" }); console.log(JSON.stringify({ ok: true, subject: rendered.subject, hasHtml: typeof rendered.html === \"string\" })); } catch (error) { console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })); throw error; }"'` | Failed as expected without provider I/O: `{"ok":false,"error":"Cannot read properties of undefined (reading 'replace')"}`. |
| `bash -lc "cd /home/surya/roomshare && pnpm test -- src/__tests__/api/messages.test.ts src/__tests__/actions/chat.test.ts src/__tests__/lib/email.test.ts src/__tests__/lib/email-templates.test.ts --runInBand"` | Passed after CH-E074: 4 suites, 76 tests, 0 snapshots. Console output contained expected mocked warning/error-path logs from existing failure-path tests. |

## Classification

This slice reduces the old generic email-delivery P2 from "not verified" to:

- Verified locally: mocked Contact Host notification/email invocation, recipient
  scoping to the other participant, no real provider call in dev mode without
  `RESEND_API_KEY`, retry/circuit-breaker/failure handling at the provider
  abstraction.
- Fixed locally: Contact Host `newMessage` payload/template rendering for the
  send path with complete data, fallback title, normalized/truncated preview,
  and template escaping.
- Not verified: real provider acceptance, inbox delivery, bounce/webhook
  behavior, and provider-level observability. These require approved
  staging/provider credentials. No real email was sent in this slice.
