# Runtime Sequences

These diagrams represent source-observed flow and cite later focused runtime
evidence where available. Contact button, `/api/messages`, listing
contactability, focused Chromium listing-detail, Chromium messaging, Mobile
Chrome no-deps messaging, setup-backed Mobile Chrome messaging, and P1 unit/API
follow-up checks pass. Checkout browser return, realtime/RLS, actual email delivery,
suspended/paywall/unavailable listing states, and the full browser matrix remain
gaps.

## Primary Contact Flow

```mermaid
sequenceDiagram
  participant User
  participant Listing as "/listings/{id}"
  participant Button as "ContactHostButton"
  participant Action as "startConversation"
  participant DB as "Database"
  participant Messages as "/messages/{conversationId}"

  User->>Listing: Open listing detail
  Listing->>Listing: Build fallback viewer state
  User->>Button: Click Contact Host
  Button->>Action: listingId, idempotency key, optional unit epoch
  Action->>Action: Auth, rate, suspension, email, listing, block checks
  Action->>DB: Reuse/resurrect or create conversation
  DB-->>Action: conversationId
  Action-->>Button: success
  Button-->>Messages: Navigate to thread
```

Evidence: CH-E001-CH-E011, CH-E032, CH-E034, CH-E040, CH-E045.

## Paywall Unlock Flow

Runtime status: NOT RUNTIME VERIFIED for Stripe checkout execution, checkout
return, and checkout-session polling. Source and component handoff evidence are
documented, but the paid unlock browser/API flow still needs focused runtime
verification.

```mermaid
sequenceDiagram
  participant User
  participant Button as "ContactHostButton"
  participant Checkout as "POST /api/payments/checkout"
  participant Stripe as "Stripe Checkout"
  participant Listing as "/listings/{id}"
  participant Status as "GET /api/payments/checkout-session"

  User->>Button: Click Contact Host while unlock required
  Button-->>User: Open paywall dialog
  User->>Button: Select offer
  Button->>Checkout: listingId, productCode
  Checkout->>Checkout: Auth, CSRF, rate, listing, paywall checks
  Checkout-->>Button: checkoutUrl, sessionId
  Button-->>Stripe: Redirect
  Stripe-->>Listing: Return with checkout params
  Listing->>Status: Poll session status
  Status-->>Listing: Fulfilled/canceled/failed/timeout state
  Listing-->>User: Notice and viewer-state update
```

Evidence: CH-E004, CH-E010; `phase-4/02-api-data-flow.md`.

## Message Send Flow

```mermaid
sequenceDiagram
  participant User
  participant Client as "Messages UI"
  participant Action as "sendMessage"
  participant Helper as "sendConversationMessage"
  participant DB as "Database"
  participant Notify as "Notification/email"

  User->>Client: Submit message
  Client->>Action: conversationId, content
  Action->>Action: Auth, rate, suspension, email, schema checks
  Action->>Helper: Send validated message
  Helper->>Helper: Access, listing, suspension, block, content flag checks
  Helper->>DB: Create message and update conversation
  Helper->>Notify: Internal notification and email send calls
  Helper-->>Action: message result
  Action-->>Client: success or error
```

Evidence: CH-E012-CH-E014, CH-E032, CH-E034, CH-E038, CH-E040.

## Polling / Read Flow

```mermaid
sequenceDiagram
  participant Client as "ChatWindow"
  participant API as "GET /api/messages"
  participant Data as "message helpers"
  participant DB as "Database"

  Client->>API: poll=1, conversationId, lastMessageId
  API->>Data: Verify accessible conversation
  Data->>DB: Read messages and typing users
  DB-->>Data: New messages and typing state
  API-->>Client: Private no-store polling payload
  Client->>Client: Dedupe messages, update cursor, mark incoming read
```

Evidence: CH-E015, CH-E016, CH-E032; `phase-4/01-ui-interaction-census.md`.
