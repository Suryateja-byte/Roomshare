# Goal Progress: Uniform 1000-Character Message Limit

Status date: 2026-05-12.

Goal: implement the approved Contact Host Option A decision: one uniform
1000-character outbound message limit across thread, inbox, server action,
direct API, tests, and docs.

## Status

Closed. Implementation is complete in source and focused test sources, and the
required Linux-side WSL focused Jest verification passed. The historical
message-length product-decision blocker is resolved in favor of the approved
1000-character policy, and the message-length P1 is closed.

## Surfaces Inspected

| Surface | Result | Evidence |
|---|---|---|
| Thread composer | Uses shared `OUTBOUND_MESSAGE_MAX_LENGTH`; `maxLength`, counter, and client over-limit toast are 1000. | `src/app/messages/[id]/ChatWindow.tsx:36-37`, `563-566`, `1053`, `1075` |
| Inbox composer | Uses shared `OUTBOUND_MESSAGE_MAX_LENGTH`; `maxLength`, counter, and client over-limit toast are 1000. | `src/components/MessagesPageClient.tsx:37-38`, `571-574`, `1259`, `1276` |
| Server action | `sendMessage` schema trims, rejects empty/whitespace, accepts up to 1000, and returns 1000-specific over-limit copy. | `src/app/actions/chat.ts:43-70`, `416-418` |
| `/api/messages` POST | Direct send schema trims, rejects empty/whitespace, accepts up to 1000, and returns 1000-specific over-limit copy. | `src/app/api/messages/route.ts:22-51`, `378-382` |
| Start conversation | Inspected; it does not accept outbound message content, so no length limit applies. | `src/app/actions/chat.ts:48-386` |
| Shared constant | Single shared 1000 limit and copy constants added. | `src/lib/messaging/message-limits.ts:1-7` |
| Focused tests | Boundary test source now covers 1000 accepted, 1001 rejected, and empty/whitespace rejection where applicable. | `src/__tests__/components/ChatWindow.test.tsx:578-688`; `src/__tests__/components/MessagesPageClient.test.tsx:534-661`; `src/__tests__/actions/chat.test.ts:511-543`; `src/__tests__/api/messages.test.ts:359-375`; `src/__tests__/api/messages-pagination.test.ts:520-595` |

## Commands

| Command | Result | Notes |
|---|---|---|
| `pnpm --dir '\\wsl$\\Ubuntu\\home\\surya\\roomshare' exec jest src/__tests__/actions/chat.test.ts src/__tests__/api/messages.test.ts src/__tests__/api/messages-pagination.test.ts src/__tests__/components/ChatWindow.test.tsx src/__tests__/components/MessagesPageClient.test.tsx --runInBand` | Failed before tests | Windows pnpm could not resolve WSL symlinked `node_modules/jest/bin/jest.js`. |
| `pnpm exec jest src/__tests__/actions/chat.test.ts src/__tests__/api/messages.test.ts src/__tests__/api/messages-pagination.test.ts src/__tests__/components/ChatWindow.test.tsx src/__tests__/components/MessagesPageClient.test.tsx --runInBand` from the UNC workspace | Failed before tests | Same WSL symlink resolution failure. |
| Direct `node` invocation of pnpm package Jest/Jest CLI paths | Failed before tests | Bypassed the first shim, then failed resolving pnpm-linked dependencies such as `import-local` or `jest-util`. |
| `pnpm test -- src/__tests__/components/ChatWindow.test.tsx src/__tests__/components/MessagesPageClient.test.tsx src/__tests__/actions/chat.test.ts src/__tests__/api/messages.test.ts src/__tests__/api/messages-pagination.test.ts --runInBand` from `/home/surya/roomshare` in WSL | Passed | 5 suites passed, 97 tests passed. Console output included expected mocked error-path logs. |

## Final Gate Result

The focused command was rerun from the Linux-side WSL repo shell where pnpm
symlinks resolve:

```sh
pnpm test -- src/__tests__/components/ChatWindow.test.tsx src/__tests__/components/MessagesPageClient.test.tsx src/__tests__/actions/chat.test.ts src/__tests__/api/messages.test.ts src/__tests__/api/messages-pagination.test.ts --runInBand
```

Result: passed, 5 suites and 97 tests. No product bug, test bug, fixture/setup
issue, or unknown failure remains for this message-length gate.
