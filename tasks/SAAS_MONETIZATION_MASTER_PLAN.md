# SAAS MONETIZATION MASTER PLAN

**Document Version**: 1.0
**Date**: 2026-02-26
**Status**: Final — Ready for Execution

---

## 1. Executive Summary

Roomshare is a production-ready room rental marketplace with a mature feature set: full-text search with faceted filtering, real-time messaging via Supabase Realtime, AI-powered neighborhood chat (Groq LLM), nearby places discovery (Radar + Google Places UI Kit), map-based browsing (MapLibre + Stadia tiles), identity verification, booking management, and admin tooling. The current infrastructure cost at 10,000 users is approximately $100/month. There are no revenue streams.

This plan introduces a freemium SaaS model with two paid tiers (Plus at $9.99/month, Pro at $24.99/month) designed to capture the market gap below SpareRoom ($56/month effective) and above free-only platforms. Roomshare's unique advantages -- AI neighborhood chat, intelligent neighborhood exploration, and a modern mobile-first UX -- become the primary conversion levers. The messaging paywall is the #1 conversion trigger, gating continued conversations after the first introductory message per listing.

Conservative projections at 10,000 users with 5% conversion yield $6,500 MRR ($78,000 ARR). At 50,000 users with 8% conversion, MRR reaches $52,000 ($624,000 ARR). The technical implementation requires 4 weeks: database schema and Stripe integration (Week 1), server-side access guards (Week 2), client-side gating UX (Week 3), and launch polish with analytics (Week 4). The entire system is built on a static TypeScript feature flag configuration -- no feature flag SaaS dependency, no additional infrastructure cost.

---

## 2. Complete Feature Inventory

### Search & Discovery
| Feature | Current State | External Dependency |
|---------|--------------|-------------------|
| Full-text search (V2 keyset pagination) | Production | PostgreSQL + PostGIS |
| Faceted filtering (price, room type, amenities, lease, gender, language, move-in date) | Production | PostgreSQL |
| Map-based browsing (markers, clusters, bounds search) | Production | MapLibre GL + Stadia tiles |
| Saved searches with email alerts (instant/daily/weekly) | Production | PostgreSQL + Resend |
| Search count API (area counts on map) | Production | PostgreSQL |
| Recently viewed listings | Production | PostgreSQL |
| Saved/favorited listings | Production | PostgreSQL |

### Listings
| Feature | Current State | External Dependency |
|---------|--------------|-------------------|
| Listing CRUD (create, edit, pause, delete) | Production | PostgreSQL |
| Image upload (multi-image) | Production | Supabase Storage |
| Geocoding (address to coordinates) | Production | Nominatim |
| Listing status management (Active/Paused/Rented) | Production | PostgreSQL |
| View count tracking | Production | PostgreSQL |

### Messaging & Social
| Feature | Current State | External Dependency |
|---------|--------------|-------------------|
| Real-time conversations (per-listing threads) | Production | Supabase Realtime |
| Typing indicators | Production | Supabase Realtime |
| Unread message counts | Production | PostgreSQL |
| User blocking | Production | PostgreSQL |
| Conversation deletion (soft, per-user) | Production | PostgreSQL |

### AI & Intelligence
| Feature | Current State | External Dependency |
|---------|--------------|-------------------|
| Neighborhood AI chat (LLM-powered Q&A) | Production | Groq (Llama 3.1 8B) |
| Nearby places search | Production | Radar API |
| Nearby places detail display | Production | Google Places UI Kit |
| Fair housing policy enforcement | Production | Internal rules engine |

### Trust & Safety
| Feature | Current State | External Dependency |
|---------|--------------|-------------------|
| Email verification | Production | Resend |
| Identity verification (document + selfie) | Production | Supabase Storage |
| Report system (listing reports) | Production | PostgreSQL |
| Rate limiting (Redis-backed burst + sustained) | Production | Upstash Redis |
| Booking system with optimistic locking | Production | PostgreSQL |
| Idempotency keys (duplicate submission prevention) | Production | PostgreSQL |

### Admin
| Feature | Current State | External Dependency |
|---------|--------------|-------------------|
| User management (suspend/unsuspend) | Production | PostgreSQL |
| Listing moderation | Production | PostgreSQL |
| Report review and resolution | Production | PostgreSQL |
| Verification request review | Production | PostgreSQL |
| Audit trail (immutable admin action log) | Production | PostgreSQL |

### Infrastructure
| Feature | Current State | External Dependency |
|---------|--------------|-------------------|
| OAuth (Google) + credentials auth | Production | NextAuth.js |
| Health checks (live + ready) | Production | Internal |
| Cron jobs (rate limit cleanup, typing status cleanup, search doc refresh, search alerts) | Production | Vercel Cron |
| Error monitoring | Production | Sentry |
| CSP middleware | Production | Internal |

---

## 3. Competitive Landscape

### Competitor Pricing Table

| Platform | Monthly Price | Annual Price | Key Limitations |
|----------|-------------|-------------|----------------|
| SpareRoom | ~$56/mo (billed weekly at $14/wk) | N/A | No monthly option; weekly billing only |
| Roomster | $29.99/mo | N/A | Poor reviews; aggressive upsells |
| Diggz | $23.99/mo | N/A | Matching-focused; limited search |
| Roommates.com | $12/mo | $49/yr ($4.08/mo) | Dated UX; limited features |
| Facebook Groups | Free | Free | No structure; high scam risk; no verification |
| Craigslist | Free | Free | No identity verification; high fraud |
| **Roomshare (proposed)** | **$9.99/mo** | **$95.90/yr ($7.99/mo)** | **Most affordable structured platform** |

### Market Gaps Roomshare Exploits

1. **Price gap**: No structured platform exists between free (Craigslist/Facebook) and $12/month (Roommates.com). Roomshare at $9.99/month owns the affordable monthly tier.
2. **AI gap**: Zero competitors offer AI-powered neighborhood intelligence. This is a unique differentiator with high perceived value and near-zero marginal cost (Groq free tier: 14,400 requests/day).
3. **UX gap**: Every competitor except Diggz has a dated, desktop-first interface. Roomshare's mobile-first, map-centric UX is a significant advantage.
4. **Trust gap**: Only SpareRoom offers robust verification. Roomshare's document + selfie verification system matches this at a fraction of the price.

### Roomshare Competitive Advantages (Ranked)

1. **AI Neighborhood Chat** -- No competitor has this. High "wow factor" for conversion.
2. **Nearby Places Intelligence** -- Radar + Google Places integration provides real neighborhood data.
3. **Modern Mobile-First UX** -- Map-based browsing, bottom sheets, real-time messaging.
4. **Price Position** -- 82% cheaper than SpareRoom, 58% cheaper than Diggz.
5. **Trust Infrastructure** -- Identity verification, fair housing compliance, admin audit trail.

---

## 4. Free vs Paid Feature Map

### Resolved Conflict Decisions

Before presenting the final map, here are the conflict resolutions with justifications:

**Messaging Limit (RESOLVED: 1 introductory message per listing, then paywall)**
Agent 2's model wins. Rationale: Messaging is the highest-intent action in a roommate search -- once a user sends their first message, they are invested. Allowing 5 free conversations per month (Agent 3) delays the conversion trigger and lets casual users extract significant value without paying. The 1-message-per-listing model lets free users demonstrate interest to hosts while creating immediate friction for continued conversation, which is the #1 conversion driver.

**Free AI Chat (RESOLVED: 3 messages/day free)**
Neither Agent 2 (5/day) nor Agent 3 (0 free) is optimal. 3 messages/day is the right balance: enough to demonstrate the feature's value and create desire, but not enough for a free user to rely on it. Zero gating (Agent 3) eliminates the teaser effect entirely, losing the "aha moment" that drives upgrades. Five per day (Agent 2) is too generous for a feature with near-zero marginal cost that should be a premium perk.

**Saved Searches Free Limit (RESOLVED: 2 free)**
Agent 4's middle ground wins. One (Agent 3) feels punitive for a feature with zero marginal cost. Three (Agent 2) reduces the upgrade pressure. Two lets users save their top priority search and one backup, then gates the third as a natural upgrade moment ("You've used both your saved searches").

**Annual Discount (RESOLVED: 20% discount)**
Agent 2's 20% wins. Rationale: 25% discount (Agent 3) at $7.99/month gives away too much margin for a pre-PMF product. A 20% discount ($7.99/month annual) is competitive with Roommates.com ($4.08/month annual) while preserving more revenue per user. The discount can always be increased later as a retention lever; it's harder to reduce.

### Complete Feature Access Matrix

| Feature | Free | Plus ($9.99/mo) | Pro ($24.99/mo) |
|---------|------|-----------------|-----------------|
| **Search & Discovery** | | | |
| Search & browse listings | Unlimited | Unlimited | Unlimited |
| Map-based browsing | Unlimited | Unlimited | Unlimited |
| Faceted filtering | All filters | All filters | All filters |
| Saved searches | 2 | 10 | Unlimited |
| Search alerts frequency | Weekly only | Instant/Daily/Weekly | Instant/Daily/Weekly |
| Recently viewed history | 20 listings | 50 listings | Unlimited |
| **Listings** | | | |
| Create listings | 1 | 3 | 20 |
| Images per listing | 5 | 10 | 15 |
| Listing boost (priority placement) | -- | 1/week | 5/week |
| Listing analytics (views, saves, inquiries) | -- | -- | Full dashboard |
| **Messaging** | | | |
| Send first message per listing | Yes (1 per listing) | Unlimited | Unlimited |
| Continue conversations | -- | Unlimited | Unlimited |
| Read received messages | Yes | Yes | Yes |
| Real-time typing indicators | Yes | Yes | Yes |
| **AI & Neighborhood** | | | |
| AI neighborhood chat | 3 messages/day | Unlimited | Unlimited |
| Nearby places search | Basic (1 mi radius) | Full (5 mi, all categories) | Full + export |
| Neighborhood exploration panel | Preview only | Full access | Full access |
| **Trust & Safety** | | | |
| Email verification | Yes | Yes | Yes |
| Identity verification | Yes | Yes | Yes |
| Verification badge display | -- | Yes | Yes |
| Report listings | Yes | Yes | Yes |
| User blocking | Yes | Yes | Yes |
| **Profile & Account** | | | |
| Basic profile | Yes | Yes | Yes |
| Profile analytics | -- | -- | Full |
| Priority in search results | -- | -- | Yes |
| **Bookings & Reviews** | | | |
| Send/receive bookings | Yes | Yes | Yes |
| Write reviews | Yes | Yes | Yes |
| Review responses | Yes | Yes | Yes |

### Conversion Trigger Priority (Implementation Order)

1. **Messaging paywall** -- Blocks continued conversation after 1st message. Highest-intent gate.
2. **AI chat limit hit** -- "Upgrade to keep chatting with our AI" after 3 messages/day.
3. **Saved search limit** -- "You've used 2 of 2 saved searches" on 3rd save attempt.
4. **Second listing creation** -- "Upgrade to Plus to create more listings" on 2nd listing.
5. **Neighborhood exploration gate** -- Preview panel with blurred content + upgrade CTA.
6. **Search alert frequency** -- "Upgrade for instant alerts" when selecting non-weekly frequency.
7. **Image upload limit** -- "Upgrade for more photos" on 6th image upload.

---

## 5. Subscription Tiers & Pricing

### Pricing Table

| | Free | Plus | Pro |
|---|---|---|---|
| **Monthly** | $0 | $9.99/mo | $24.99/mo |
| **Annual** | $0 | $7.99/mo ($95.90/yr) | $19.99/mo ($239.90/yr) |
| **Annual Savings** | -- | 20% ($24 saved) | 20% ($60 saved) |

### Founding Member Pricing (First 500 Users)

| | Plus Founding | Pro Founding |
|---|---|---|
| **Monthly (locked forever)** | $4.99/mo | $14.99/mo |
| **Value vs Regular** | 50% off | 40% off |
| **Eligibility** | First 250 Plus subscribers | First 250 Pro subscribers |

Founding pricing is locked for the lifetime of continuous subscription. If a founding member cancels and resubscribes, they lose the founding rate. This creates urgency and rewards early adopters while establishing a natural price anchor.

### Add-Ons (Available to All Paid Tiers)

| Add-On | Price | Description |
|--------|-------|-------------|
| Featured listing boost | $4.99/one-time | 7-day priority placement in search results |
| Extra listing slot | $3.99/mo | Add one additional listing beyond tier limit |
| Background check badge | $9.99/one-time | Third-party background check verification display |
| Urgent "Available Now" badge | $2.99/one-time | 48-hour highlighted badge on listing |

### Discounts

| Discount | Amount | Verification |
|----------|--------|-------------|
| Student (.edu email) | 25% off monthly | Verified .edu email address |
| Military/Veteran | 20% off monthly | Self-declared (honor system, audit-eligible) |
| Annual commitment | 20% off vs monthly | Upfront annual payment |

Note: Discounts do not stack. The highest applicable discount is applied.

---

## 6. Technical Implementation Plan

### 6.1 Database Schema (Prisma)

Three new models added to `prisma/schema.prisma`:

```prisma
enum SubscriptionPlan {
  FREE
  PLUS
  PRO
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
}

model Subscription {
  id                   String             @id @default(cuid())
  userId               String             @unique
  plan                 SubscriptionPlan   @default(FREE)
  status               SubscriptionStatus @default(ACTIVE)
  stripeCustomerId     String?            @unique
  stripeSubscriptionId String?            @unique
  stripePriceId        String?
  currentPeriodStart   DateTime?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean            @default(false)
  foundingMember       Boolean            @default(false)
  trialEnd             DateTime?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt
  user                 User               @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([stripeCustomerId])
  @@index([plan, status])
}

model UsageRecord {
  id         String   @id @default(cuid())
  userId     String
  feature    String   // "ai_chat", "message_send", "saved_search", "listing_create", "listing_boost"
  count      Int      @default(1)
  windowStart DateTime @default(now())
  expiresAt  DateTime // Daily for ai_chat, monthly for others

  @@unique([userId, feature, windowStart])
  @@index([userId, feature])
  @@index([expiresAt])
}

model ListingBoost {
  id        String   @id @default(cuid())
  listingId String
  userId    String
  type      String   // "weekly_free" | "purchased"
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([listingId, expiresAt])
  @@index([userId, createdAt])
}
```

Add relation to User model:
```prisma
model User {
  // ... existing fields ...
  subscription Subscription?
}
```

**Migration safety**: All new models. No existing table modifications except adding optional relation to User. Reversible via `DROP TABLE`. No data backfill needed. No locking risk.

### 6.2 Feature Flag Configuration (Static TypeScript)

File: `src/lib/subscriptions/plans.ts`

```typescript
export const PLAN_LIMITS = {
  FREE: {
    maxListings: 1,
    maxImagesPerListing: 5,
    maxSavedSearches: 2,
    maxRecentlyViewed: 20,
    aiChatMessagesPerDay: 3,
    canSendFirstMessage: true,       // per listing, 1 only
    canContinueConversation: false,
    searchAlertFrequencies: ['WEEKLY'] as const,
    nearbySearchRadius: [1609] as const, // 1 mile only
    neighborhoodFullAccess: false,
    listingBoostsPerWeek: 0,
    verificationBadge: false,
    listingAnalytics: false,
    profileAnalytics: false,
    prioritySearch: false,
  },
  PLUS: {
    maxListings: 3,
    maxImagesPerListing: 10,
    maxSavedSearches: 10,
    maxRecentlyViewed: 50,
    aiChatMessagesPerDay: -1,        // unlimited
    canSendFirstMessage: true,
    canContinueConversation: true,
    canReadMessages: true,
    searchAlertFrequencies: ['INSTANT', 'DAILY', 'WEEKLY'] as const,
    nearbySearchRadius: [1609, 3218, 8046] as const,
    neighborhoodFullAccess: true,
    listingBoostsPerWeek: 1,
    verificationBadge: true,
    listingAnalytics: false,
    profileAnalytics: false,
    prioritySearch: false,
  },
  PRO: {
    maxListings: 20,
    maxImagesPerListing: 15,
    maxSavedSearches: -1,            // unlimited
    maxRecentlyViewed: -1,           // unlimited
    aiChatMessagesPerDay: -1,        // unlimited
    canSendFirstMessage: true,
    canContinueConversation: true,
    canReadMessages: true,
    searchAlertFrequencies: ['INSTANT', 'DAILY', 'WEEKLY'] as const,
    nearbySearchRadius: [1609, 3218, 8046] as const,
    neighborhoodFullAccess: true,
    listingBoostsPerWeek: 5,
    verificationBadge: true,
    listingAnalytics: true,
    profileAnalytics: true,
    prioritySearch: true,
  },
} as const;
```

### 6.3 Stripe Integration

**API Routes**:
- `POST /api/stripe/checkout` -- Create Stripe Checkout session for plan upgrade
- `POST /api/stripe/portal` -- Create Stripe Customer Portal session for management
- `POST /api/stripe/webhooks` -- Handle Stripe webhook events

**Webhook Events to Handle**:
- `checkout.session.completed` -- Activate subscription, set plan
- `customer.subscription.updated` -- Plan change, period renewal
- `customer.subscription.deleted` -- Downgrade to FREE
- `invoice.payment_failed` -- Set status to PAST_DUE
- `invoice.paid` -- Clear PAST_DUE status

**Environment Variables**:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PLUS_MONTHLY_PRICE_ID=price_...
STRIPE_PLUS_ANNUAL_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_FOUNDING_PLUS_PRICE_ID=price_...
STRIPE_FOUNDING_PRO_PRICE_ID=price_...
```

### 6.4 Server-Side Access Guards

File: `src/lib/subscriptions/guards.ts`

```typescript
// Core guard functions (all server-side, all throw on violation)

async function requireFeature(userId: string, feature: keyof PlanLimits): Promise<void>
// Checks: user's plan allows feature. Throws UpgradeRequiredError if not.

async function requireUsage(userId: string, feature: string, limit: number): Promise<void>
// Checks: user's usage count < limit for current window. Throws UsageLimitError if exceeded.

async function requireListingSlot(userId: string): Promise<void>
// Checks: user's active listing count < plan's maxListings. Throws ListingLimitError.

async function requireSavedSearchSlot(userId: string): Promise<void>
// Checks: user's saved search count < plan's maxSavedSearches. Throws SavedSearchLimitError.

async function requireMessagePermission(userId: string, conversationId: string): Promise<void>
// Checks: For FREE users, only allows first message per listing. Throws MessageLimitError.
```

**Guard Placement** (existing routes/actions to modify):

| Route/Action | Guard | File |
|-------------|-------|------|
| `POST /api/chat` | `requireUsage(userId, 'ai_chat', limit)` | `src/app/api/chat/route.ts` |
| `POST /api/messages` | `requireMessagePermission(userId, conversationId)` | `src/app/api/messages/route.ts` |
| `POST /api/listings` (create) | `requireListingSlot(userId)` | `src/app/api/listings/route.ts` |
| `POST /api/upload` | `requireFeature(userId, 'maxImagesPerListing')` | `src/app/api/upload/route.ts` |
| SaveSearchButton action | `requireSavedSearchSlot(userId)` | `src/components/SaveSearchButton.tsx` (server action) |
| SavedSearch alert frequency | `requireFeature(userId, 'searchAlertFrequencies')` | `src/app/api/cron/search-alerts/route.ts` |
| Nearby places radius | `requireFeature(userId, 'nearbySearchRadius')` | `src/app/api/nearby/route.ts` |

### 6.5 Client-Side Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `useSubscription()` | React hook: fetches user's plan, limits, usage | `src/hooks/useSubscription.ts` |
| `<UpgradePrompt>` | Modal/banner shown when limit hit | `src/components/subscription/UpgradePrompt.tsx` |
| `<PlanBadge>` | Shows Plus/Pro badge on profile/listings | `src/components/subscription/PlanBadge.tsx` |
| `<UsageLimitBanner>` | Inline banner: "3 of 3 AI chats used today" | `src/components/subscription/UsageLimitBanner.tsx` |
| `<PricingPage>` | Full pricing comparison page | `src/app/pricing/page.tsx` |
| `<SubscriptionSettings>` | Manage plan in settings (links to Stripe Portal) | `src/app/settings/subscription/page.tsx` |

**Session Extension**: Add `plan` field to JWT token via NextAuth callbacks so client can check plan without additional DB queries:

```typescript
// In src/auth.ts callbacks:
async jwt({ token, user }) {
  if (user) {
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    token.plan = sub?.plan ?? 'FREE';
  }
  return token;
},
async session({ session, token }) {
  session.user.plan = token.plan as SubscriptionPlan;
  return session;
}
```

### 6.6 Four-Week Implementation Timeline

| Week | Focus | Deliverables |
|------|-------|-------------|
| **Week 1** | Schema + Stripe | Prisma migration (Subscription, UsageRecord, ListingBoost); Stripe product/price creation; checkout, portal, webhook routes; env vars configured; unit tests for webhook handler |
| **Week 2** | Server Guards | All 7 guard functions; guard placement in existing routes/actions; usage tracking middleware; integration tests for each gate; plan limits config file |
| **Week 3** | Client UX | useSubscription hook; UpgradePrompt modal; PlanBadge component; UsageLimitBanner; PricingPage; SubscriptionSettings; session JWT extension; E2E tests for upgrade flow |
| **Week 4** | Launch Polish | Founding member logic; discount code support; analytics events (plan_upgraded, limit_hit, upgrade_prompt_shown); load testing Stripe webhooks; documentation; staging deploy + QA |

---

## 7. Revenue Projections

### Assumptions
- Average paid split: 70% Plus, 30% Pro (most roommate seekers are cost-sensitive)
- Monthly churn: 8% (roommate search is inherently time-bounded)
- Annual subscribers: 30% of paid users (reducing effective churn)
- Blended ARPU: $9.99 * 0.70 + $24.99 * 0.30 = $14.49/mo
- Stripe fee: 2.9% + $0.30 per transaction
- Net revenue per user: ~$13.65/mo after Stripe fees

### Conservative Scenario (5% Conversion Rate)

| Users | Paying Users | MRR | ARR | Monthly Infra Cost | Net Monthly Profit |
|-------|-------------|-----|-----|-------------------|-------------------|
| 10,000 | 500 | $6,825 | $81,900 | $150 | $6,675 |
| 25,000 | 1,250 | $17,063 | $204,750 | $300 | $16,763 |
| 50,000 | 2,500 | $34,125 | $409,500 | $550 | $33,575 |
| 100,000 | 5,000 | $68,250 | $819,000 | $1,000 | $67,250 |

### Moderate Scenario (8% Conversion Rate)

| Users | Paying Users | MRR | ARR | Monthly Infra Cost | Net Monthly Profit |
|-------|-------------|-----|-----|-------------------|-------------------|
| 10,000 | 800 | $10,920 | $131,040 | $150 | $10,770 |
| 25,000 | 2,000 | $27,300 | $327,600 | $300 | $27,000 |
| 50,000 | 4,000 | $54,600 | $655,200 | $550 | $54,050 |
| 100,000 | 8,000 | $109,200 | $1,310,400 | $1,000 | $108,200 |

### Break-Even Analysis

| Cost Category | Monthly Cost (10K Users) |
|--------------|------------------------|
| Vercel Pro | $20 |
| Supabase (Storage + Realtime) | $25 |
| PostgreSQL (Supabase DB) | $25 |
| Upstash Redis | $10 |
| Radar API | $0 (free tier: 100K calls/mo) |
| Groq API | $0 (free tier: 14,400 req/day) |
| Resend (email) | $20 |
| Sentry | $26 |
| Google Maps (Places UI Kit) | $0 (client-side, free tier) |
| Stadia Maps (tiles) | $0 (free tier) |
| Nominatim | $0 (free, self-hosted fallback) |
| Stripe fees (at 5% conversion) | $342 |
| **Total** | **$468** |

**Break-even point**: 35 paying users at blended ARPU ($13.65 net) covers $468/month infrastructure + Stripe fees. This is achievable within the first week of launch.

### Add-On Revenue (Supplemental)

| Add-On | Est. Adoption (% of paid) | Monthly Revenue (at 800 paid users) |
|--------|--------------------------|--------------------------------------|
| Featured boost ($4.99) | 15% | $599 |
| Extra listing ($3.99/mo) | 5% | $160 |
| Background check ($9.99) | 3% | $240 |
| Urgent badge ($2.99) | 8% | $191 |
| **Total add-on revenue** | | **$1,190** |

---

## 8. Launch Roadmap

### Phase 1: Foundation (Weeks 1-4) -- Build

| Week | Milestone | Exit Criteria |
|------|-----------|--------------|
| 1 | Schema + Stripe integration | Migration deployed to staging; Stripe test mode checkout works end-to-end; webhook handler passes all unit tests |
| 2 | Server-side access guards | All 7 guard functions deployed; integration tests pass for every gated route; free users correctly blocked from paid features |
| 3 | Client UX + pricing page | Upgrade prompts render at all 7 conversion points; pricing page live; useSubscription hook works with JWT plan field |
| 4 | Polish + staging QA | Founding member flow works; discount codes applied correctly; analytics events firing; full E2E pass on staging |

### Phase 2: Launch (Weeks 5-8) -- Validate

| Week | Milestone | Exit Criteria |
|------|-----------|--------------|
| 5 | Soft launch to existing users | Email announcement to existing user base; founding member pricing active; monitor error rates |
| 6 | Founding member window | Track founding member uptake (target: 100 in first 2 weeks); collect feedback; fix critical bugs |
| 7 | Public launch | Remove "beta" labels; enable all conversion triggers; begin tracking KPIs |
| 8 | First optimization cycle | Analyze conversion funnel; A/B test upgrade prompt copy; adjust messaging paywall if conversion < 3% |

### Phase 3: Optimize (Weeks 9-16) -- Scale

| Week | Milestone | Exit Criteria |
|------|-----------|--------------|
| 9-10 | Add-on marketplace | Featured boost and urgent badge purchasable; extra listing slot available |
| 11-12 | Retention features | Cancellation survey; win-back emails (7-day, 30-day); annual plan promotion to monthly subscribers |
| 13-14 | Pro tier enrichment | Listing analytics dashboard; profile analytics; priority search ranking algorithm |
| 15-16 | Growth experiments | Referral program (1 free month for referrer + referee); student/military discount launch; partner integrations |

---

## 9. Success KPIs

### Primary Metrics (Weekly Review)

| Metric | Target (Month 1) | Target (Month 3) | Target (Month 6) |
|--------|------------------|------------------|------------------|
| Free-to-paid conversion rate | 3% | 5% | 8% |
| MRR | $2,000 | $6,500 | $15,000 |
| Monthly churn rate | <12% | <10% | <8% |
| ARPU (Average Revenue Per User) | $12.00 | $13.50 | $14.50 |
| LTV (Lifetime Value) | $100 | $135 | $180 |

### Conversion Funnel Metrics (Daily Review)

| Metric | Description | Target |
|--------|-------------|--------|
| Upgrade prompt impression rate | % of free users who see an upgrade prompt per session | >40% |
| Upgrade prompt click-through rate | % of prompt impressions that click "Upgrade" | >8% |
| Checkout completion rate | % of users who reach checkout and complete payment | >60% |
| Time to first upgrade prompt | Average session time before hitting a gate | <5 minutes |
| Top conversion trigger | Which gate drives the most upgrades | Messaging paywall |

### Engagement Metrics (Weekly Review)

| Metric | Description | Target |
|--------|-------------|--------|
| DAU/MAU ratio | Daily active / monthly active users | >25% |
| Messages sent per paid user/week | Engagement depth of paying users | >10 |
| AI chat sessions per paid user/week | Usage of premium AI feature | >3 |
| Saved searches per paid user | Sticky feature adoption | >4 |
| Listing creation rate (paid users) | % of paid users who create listings | >30% |

### Financial Metrics (Monthly Review)

| Metric | Description | Target |
|--------|-------------|--------|
| Gross margin | (Revenue - Infra - Stripe fees) / Revenue | >90% |
| CAC (Customer Acquisition Cost) | Marketing spend / new paid users | <$15 |
| LTV:CAC ratio | Customer lifetime value / acquisition cost | >5:1 |
| Annual plan adoption rate | % of paid users on annual billing | >30% |
| Revenue per user (all users) | Total revenue / total registered users | >$0.50 |

### Health Metrics (Real-time Alerts)

| Metric | Alert Threshold |
|--------|----------------|
| Stripe webhook failure rate | >1% over 1 hour |
| Subscription creation error rate | >0.5% |
| Guard false-positive rate (paid users blocked) | Any occurrence |
| Payment failure rate | >5% of renewal attempts |
| Refund rate | >3% monthly |

---

## 10. Risk Analysis

### High-Impact Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| **Messaging paywall drives user exodus** | Medium | High | Monitor DAU/MAU ratio weekly. If >15% drop in WAU within 2 weeks of launch, soften to "3 conversations/month free" as fallback. Pre-build the fallback config in plan limits so the switch is a config change, not a code change. |
| **Groq free tier rate limits hit** | Medium | Medium | Groq's free tier allows 14,400 requests/day (30 RPM). At 10K users with 3% active daily and 3 messages each, that is 900 requests/day -- well within limits. At 50K users, upgrade to Groq paid ($0.05/1M input tokens) at ~$15/month. Budget for this at 25K users. |
| **Stripe webhook delivery failures** | Low | High | Implement idempotent webhook handler (check `stripeSubscriptionId` before processing). Add dead-letter queue via Stripe's built-in retry mechanism (up to 72 hours). Monitor via Sentry alert on any 5xx response to webhook endpoint. |
| **Competitors undercut pricing** | Medium | Medium | Roomshare's AI chat and neighborhood intelligence are unique value propositions that cannot be matched by a price cut alone. Focus marketing on these differentiators. The founding member program creates a locked-in cohort resistant to competitor pricing. |
| **Free users game the system** | Medium | Low | Rate limiting already exists on all endpoints. Messaging paywall is enforced server-side (guards in API routes, not client-only). Multi-account abuse detectable via IP + email domain patterns. Add abuse flag to UsageRecord if needed. |
| **Low conversion rate (<2%)** | Medium | High | If conversion is below 2% after 30 days: (1) Test reducing Plus to $7.99/month, (2) Add 7-day free trial with credit card, (3) Increase free AI chat to 5/day to improve stickiness before gating, (4) Add "unlock this conversation for $0.99" micro-transaction option. |

### Medium-Impact Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| **Database performance under load** | Low | Medium | UsageRecord table has TTL-based expiration and composite indexes. Add cron job to clean expired records (mirror existing `cleanup-rate-limits` pattern). Cache plan lookups in JWT token (already planned). |
| **Founding member pricing too generous** | Low | Medium | Cap at 250 per tier (500 total). The $4.99/month founding price still covers infrastructure costs. If LTV of founding members proves lower than expected, they still serve as testimonials and community builders. |
| **Scope creep delays launch** | Medium | Medium | The 4-week plan is intentionally minimal. Week 1-2 deliverables (schema + guards) provide the monetization foundation. Client UX in Week 3 can launch with a basic upgrade modal instead of a polished pricing page. Ship the guard layer first; polish later. |
| **Regulatory/payment compliance** | Low | Medium | Stripe handles PCI compliance, SCA, and payment method regulations. Roomshare does not store card data. Add terms of service update mentioning subscription terms, auto-renewal, and cancellation policy before launch. |

### Contingency Plans

| Scenario | Trigger | Action |
|----------|---------|--------|
| Conversion below 2% at day 30 | Dashboard metric | Reduce Plus to $7.99/month; add 7-day free trial |
| Churn above 15% at month 2 | Dashboard metric | Launch retention email sequence; offer 40% annual discount to churning users |
| Infrastructure costs spike | Monthly cost exceeds 20% of MRR | Audit expensive queries; add caching layer for Radar/Groq; consider self-hosted Nominatim if geocoding costs rise |
| Competitor launches AI chat | Market intelligence | Double down on Roomshare's integrated experience (chat + nearby places + map in one flow); add multi-model support (GPT-4o mini fallback) |
| Stripe outage | Webhook failures >10% for 1 hour | Queue upgrade requests locally; process retroactively when Stripe recovers; display "Payment processing delayed" banner |

---

*This document is the single source of truth for Roomshare's monetization strategy. All implementation work should reference this plan. Update this document as decisions change.*
