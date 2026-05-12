# Runtime Sequences

These diagrams represent source-observed flow and cite later focused runtime
evidence where available. Contact button, `/api/messages`, listing
contactability, focused Chromium listing-detail, Chromium messaging, Mobile
Chrome no-deps messaging, and setup-backed Mobile Chrome messaging checks pass.
Mocked checkout browser return and paywall/unavailable/migration/moderation
listing-detail states also pass, CH-E063 adds focused WebKit/Mobile
Chrome/Mobile Safari listing-detail plus messaging passes, CH-E064 confirms
Firefox browser availability and reproduces focused Firefox test/setup failures,
and CH-E065 passes the focused Firefox listing-detail and messaging specs after
narrow test/helper fixes. CH-E068 implements suspended/blocked listing-detail
pre-click contract, UI, fixture, and focused test source; CH-E073 closes the
historical CH-E068 execution gap with focused four-state Chromium proof and a
full listing-detail Contact Host Chromium spec rerun. Provider-level Supabase
realtime/RLS remains the only current Contact Host P1; email delivery and real
provider fulfillment remain P2 confidence gaps.

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

Runtime status: partially runtime verified. Source and component handoff
evidence are documented, checkout-session route/status tests passed, and CH-E058
verified mocked Chromium checkout return / paid-unlock runtime. Real Stripe
redirect and webhook/provider fulfillment remain not verified.

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
