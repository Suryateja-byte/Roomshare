# Contact Host Email Payload Fix Approval Plan

Status: planning approval package only.

Date: 2026-05-12.

Role: Planning agent.

No production code or test code is changed by this artifact.

## Goal and Success Criteria

Goal: approve one implementation direction for the Contact Host `newMessage`
email payload so the message-send path and email template contract are aligned
without increasing privacy, authorization, or logging risk.

Success criteria:

- The approved implementation makes Contact Host `newMessage` template rendering
  deterministic before provider I/O.
- The implementation preserves existing message-send authorization,
  participant scoping, listing contactability, block, suspension, and email
  preference checks.
- The outbound email payload contains only approved fields for the recipient:
  recipient display name, sender display name, conversation id, listing title or
  approved fallback copy, and either a bounded safe preview or no preview.
- Message preview behavior is explicitly tested, including truncation boundary
  cases if preview remains in the contract.
- The email template continues to HTML-escape untrusted text and build links from
  the app URL helper.
- No message body, recipient email, listing title, or raw template payload is
  added to application logs.
- Focused mocked tests pass with no real email provider call.

## Current Evidence

| Evidence | Source |
|---|---|
| `sendMessage` validates auth, rate limit, suspension, schema, and email verification before delegating to `sendConversationMessage` with `conversationId`, `senderId`, `senderName`, and `content`. | `src/app/actions/chat.ts:392-454`, especially `src/app/actions/chat.ts:432-437` |
| `POST /api/messages` delegates the direct API send path to `sendConversationMessage` with the same data plus API-specific options. | `src/app/api/messages/route.ts:378-405`, especially `src/app/api/messages/route.ts:387-395` |
| `sendConversationMessage` loads participants and listing state, but the selected listing fields currently omit `title`. | `src/lib/messaging/send-conversation-message.ts:76-99` |
| `sendConversationMessage` checks participant access, listing contactability, suspended recipient/owner, blocks, outbound content flags, then persists the message. | `src/lib/messaging/send-conversation-message.ts:110-192` |
| After persistence, `sendConversationMessage` sends internal notifications and calls `sendNotificationEmailWithPreference("newMessage", ...)` for other participants with only `recipientName`, `senderName`, and `conversationId` in the template data. | `src/lib/messaging/send-conversation-message.ts:194-223`, especially `src/lib/messaging/send-conversation-message.ts:213-221` |
| `emailTemplates.newMessage` requires `recipientName`, `senderName`, `listingTitle`, `messagePreview`, and `conversationId`, and renders both `listingTitle` and `messagePreview`. | `src/lib/email-templates.ts:87-103`, especially `src/lib/email-templates.ts:88-99` |
| Template helpers escape HTML and sanitize subject newlines. | `src/lib/email-templates.ts:12-23`, `src/lib/email-templates.ts:60-84` |
| `sendNotificationEmail` renders the selected template before calling `sendEmail`; a missing required template field can fail before provider I/O. | `src/lib/email.ts:188-205` |
| `sendEmail` skips provider I/O when `RESEND_API_KEY` is absent, otherwise posts subject/html/text to Resend. | `src/lib/email.ts:64-74`, `src/lib/email.ts:95-118` |
| `newMessage` is preference-gated through the `emailMessages` setting, and preference skip logs use a hashed user id rather than raw email. | `src/lib/email.ts:208-265`, especially `src/lib/email.ts:213-259` |
| Existing `/api/messages` test source asserts the current mocked email payload without `listingTitle` or `messagePreview`. | `src/__tests__/api/messages.test.ts:624-650` |
| Existing provider-client tests cover retry, non-retry, circuit-breaker, timeout retry, and no-key dev mode. | `src/__tests__/lib/email.test.ts:75-206` |
| Existing Contact Host docs record CH-E072: mocked invocation/provider-client behavior is verified, but template rendering fails with the current payload. | `docs/features/contact-host/goal-progress-email-delivery.md:1-41`; `docs/features/contact-host/evidence-register.md:100` |

## Privacy and Security Considerations

- Message preview length: if the preview remains in the contract, it must be
  derived from the already-validated message content, normalized to avoid
  whitespace surprises, and capped to a short fixed limit. Recommended cap:
  `160` visible characters plus an ellipsis only when truncation occurs. Tests
  should cover `0`, `1`, `159`, `160`, `161`, and current maximum message length
  inputs. The current outbound message max is `1000` characters in
  `src/lib/messaging/message-limits.ts:1-5`.
- HTML/template handling: sender name, recipient name, listing title, and
  message preview are untrusted display text. The existing template path uses
  `escapeHtml` for those fields and `sanitizeSubject` for the subject at
  `src/lib/email-templates.ts:12-23` and `src/lib/email-templates.ts:95-99`.
  Regression tests should include HTML/script-like input to prove escaped output.
- Logs: do not log recipient email, raw message content, message preview,
  listing title, full template data, or provider payload. Existing preference
  skip telemetry uses `hashIdForLog(userId)` at `src/lib/email.ts:256-259`; the
  fix should preserve this pattern and should not add new PII-bearing logs.
- Recipient authorization/scoping: email must remain scoped to
  `otherParticipants`, after participant authorization, listing contactability,
  suspension, and block checks. The relevant scoping path is
  `src/lib/messaging/send-conversation-message.ts:110-152` and
  `src/lib/messaging/send-conversation-message.ts:195-223`.
- Listing title exposure: the title may be shown only to the already-authorized
  message participant receiving the email. Do not expose private listing data,
  owner-only fields, or unavailable/moderated listing details beyond the existing
  conversation context.
- Fallback behavior: if the listing title is unexpectedly unavailable, the send
  path should not pass `undefined` to the template. Approved fallbacks should be
  explicit and non-identifying, such as `this listing`, or the email should be
  skipped with a non-PII operational result. Do not log the missing title with
  conversation content or recipient email.
- Abuse constraints: do not loosen rate limiting, block checks, suspension
  checks, listing contactability checks, or notification preferences while fixing
  the email contract.

## Options

### Option A: Enrich Send Payload With Listing Title and Safe Message Preview

Change `sendConversationMessage` to select the listing title and pass
`listingTitle` plus a bounded safe `messagePreview` into the existing
`newMessage` template.

Implementation shape if approved:

- Add `title` to the listing select in
  `src/lib/messaging/send-conversation-message.ts`.
- Build a small preview helper close to the send path, or a focused shared helper
  if tests justify it.
- Use the validated persisted/send content, trim/collapse whitespace for preview
  display, cap at the approved preview length, and append an ellipsis only when
  truncated.
- Pass `recipientName`, `senderName`, `listingTitle`, `messagePreview`, and
  `conversationId` to `sendNotificationEmailWithPreference("newMessage", ...)`.
- Use an explicit listing-title fallback instead of passing `undefined`.

Pros:

- Aligns the send payload with the current template contract.
- Preserves the user value of an email that identifies the relevant listing and
  gives a short context preview.
- Keeps the template contract stable for other callers and tests.

Cons:

- Includes a portion of message content in email, which is higher privacy risk
  than an app-only notification.
- Requires a product/security decision on the preview length and whether message
  content belongs in email at all.

### Option B: Change Template to Avoid `listingTitle` / `messagePreview`

Change `emailTemplates.newMessage` so it no longer requires or renders
`listingTitle` and `messagePreview`. The email would say a message was received
and direct the recipient to the conversation.

Pros:

- Lowest message-content exposure.
- Fixes the runtime template error with a smaller payload surface.
- Matches a privacy-minimized transactional email model.

Cons:

- Changes the existing template contract and visible email content.
- Removes listing context from the email, which may reduce usefulness for hosts
  with multiple conversations.
- Requires updating any tests or docs that expect listing/message context.

### Option C: Suppress Contact Host `newMessage` Email Until Contract Is Decided

Disable or skip the Contact Host new-message email side effect while preserving
internal notifications and in-app messaging.

Pros:

- Avoids sending incomplete or privacy-ambiguous email.
- Lowest implementation risk if product/security cannot decide now.

Cons:

- Reduces host/guest notification reliability.
- Leaves email delivery confidence blocked and creates a product-visible
  behavior gap.
- Requires clear docs and likely follow-up work to avoid silent regression.

## Recommendation

Recommended option: Option A, pending explicit product/security approval for a
short message preview in outbound email.

Rationale: the current template already represents the intended contract by
requiring `listingTitle` and `messagePreview`; the send path already has
authorization, participant scoping, contactability, suspension, block,
preference, and provider no-key guards. Option A fixes the mismatch at the
source, preserves the useful email experience, and can be bounded with focused
privacy controls: a short preview, HTML escaping, no PII-bearing logs, and a
safe listing-title fallback.

If product/security does not approve including message content in email, choose
Option B instead of Option A. Option C should be reserved for a temporary
release-risk decision.

## Exact Files Likely To Change If Approved

For recommended Option A:

- `src/lib/messaging/send-conversation-message.ts`: select listing title, build
  safe preview, pass complete `newMessage` payload, preserve recipient scoping.
- `src/__tests__/api/messages.test.ts`: update mocked email payload assertion
  and add truncation/escaping-relevant payload cases where practical.
- `src/__tests__/actions/chat.test.ts`: update send-message fixtures/assertions
  if the shared send helper expectations require listing title or preview.
- `src/__tests__/lib/email-templates.test.ts` or an existing email-template test
  file if present: add direct `newMessage` render tests for required data,
  escaped title/preview, subject sanitization, and conversation link.
- `docs/features/contact-host/goal-progress-email-delivery.md`: update CH-E072
  status after implementation and mocked verification.
- `docs/features/contact-host/evidence-register.md`: add a new evidence row for
  the approved fix and verification commands.
- `docs/features/contact-host/verification.json` and related Contact Host docs
  only if the implementation changes the current gap/status claims.

For Option B:

- `src/lib/email-templates.ts`
- `src/__tests__/lib/email-templates.test.ts` or existing email tests
- Existing mocked send-path tests only if expected payload shape changes
- Contact Host feature docs listed above

For Option C:

- `src/lib/messaging/send-conversation-message.ts`
- Existing message API/action tests that assert email invocation
- Contact Host feature docs listed above

No schema, migration, dependency, external API contract, or provider credential
changes are expected for any option.

## Test Plan

Run the narrowest tests first, using mocked transports and no real provider:

1. Focused template tests:
   - `newMessage` renders with all approved fields.
   - Sender name, recipient name, listing title, and message preview are escaped.
   - Conversation CTA uses encoded `conversationId`.
   - Subject remains sanitized and does not include listing title or preview
     unless separately approved.
2. Preview boundary tests if Option A is approved:
   - No truncation below the cap.
   - Exact cap remains unchanged.
   - Cap plus one truncates and appends ellipsis.
   - Current maximum `1000` character message content produces the approved
     preview length.
   - Whitespace-only or oddly spaced content is handled consistently with
     message validation and does not create empty/undefined template fields.
3. Send-path tests:
   - `/api/messages` mocked email invocation includes `listingTitle` and
     `messagePreview` for the other participant only.
   - `sendMessage` action path remains authorized, rate-limited, verified, and
     preference-aware.
   - Blocked, suspended, nonparticipant, unavailable listing, and missing
     conversation paths do not send email.
   - Missing listing title uses the approved fallback or skips email according
     to the chosen option.
4. Provider/no-provider tests:
   - Existing `sendEmail` mocked retry/circuit/no-key tests remain passing.
   - No test uses real `RESEND_API_KEY` or hits Resend.
   - Mocked `fetchWithTimeout` assertions prove provider payload construction
     only after template rendering succeeds.
5. Suggested commands after implementation:
   - `pnpm test -- src/__tests__/api/messages.test.ts src/__tests__/actions/chat.test.ts --runInBand`
   - `pnpm test -- src/__tests__/lib/email.test.ts src/__tests__/lib/email-templates.test.ts --runInBand` if a new template test file is added.
   - `pnpm test -- src/__tests__/api/messages.test.ts src/__tests__/actions/chat.test.ts src/__tests__/lib/email.test.ts --runInBand` if no separate template test file exists.

## Documentation Update Plan

After implementation and verification:

- Update `docs/features/contact-host/goal-progress-email-delivery.md` from
  blocked to fixed/reduced with exact commands and results.
- Add a new `CH-E073` or next available evidence row in
  `docs/features/contact-host/evidence-register.md` describing the approved
  option, changed files, tests, and remaining provider-delivery gap.
- Update `docs/features/contact-host/12-gaps-unknowns-and-questions.md` to
  remove or narrow the payload/template blocker.
- Update `docs/features/contact-host/verification.json` if its email-delivery
  claim still says the payload/template mismatch is current.
- Leave real provider acceptance, inbox delivery, bounce/webhook behavior, and
  provider observability marked not verified unless approved staging/provider
  verification is separately run.

## Rollback Notes

- Option A rollback: remove the added listing-title select, preview helper, and
  new fields from the `newMessage` payload; revert related test/doc updates.
- Option B rollback: restore the previous template contract requiring
  `listingTitle` and `messagePreview`; revert related template tests/docs.
- Option C rollback: re-enable the `newMessage` email call and restore mocked
  invocation tests/docs.
- Do not roll back unrelated working-tree changes. This repository currently has
  many unrelated modified and untracked files, so the implementation slice must
  use scoped diffs and avoid broad checkout/reset operations.

## Approval Question

Product/security owner: do you approve Option A, enriching Contact Host
`newMessage` email payloads with the listing title and a `160` visible-character
HTML-escaped message preview, with no PII-bearing logs and a safe title fallback?

If not, choose Option B to remove listing title/message preview from the email
template, or Option C to suppress Contact Host new-message emails until the
contract is decided.
