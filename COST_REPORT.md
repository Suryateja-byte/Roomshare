# Website Monthly Cost Report: RoomShare

**Report Generated:** 2025-12-16
**Analysis Method:** Static code analysis + official pricing documentation
**Repository:** roomshare (Next.js 16 on Vercel)

---

## Executive Summary

RoomShare is a Next.js 16 room rental marketplace deployed on Vercel. The application uses 11 external services for hosting, database, storage, maps, AI chat, email, rate limiting, error tracking, and authentication.

| Tier | MAU | Monthly Cost Range |
|------|-----|-------------------|
| Starter | 100 | $0 - $25 |
| Growth | 1,000 | $25 - $75 |
| Scale | 10,000 | $75 - $250 |
| Enterprise | 100,000 | $300 - $1,200 |

**Key Cost Drivers:** Vercel Pro subscription, Supabase Pro (for scale), Mapbox geocoding at high volume.

---

## 1. External Services Inventory

| # | Service | Purpose | Billing Model | Free Tier |
|---|---------|---------|---------------|-----------|
| 1 | Vercel | Hosting, Serverless, Cron | Subscription + Usage | Hobby (limited) |
| 2 | PostgreSQL (Supabase) | Primary Database | Subscription | 500MB |
| 3 | Supabase Storage | Image Storage | Subscription | 1GB |
| 4 | Supabase Realtime | Chat & Presence | Subscription | 2M messages |
| 5 | Mapbox GL JS | Interactive Maps | Usage (Map Loads) | 50K/month |
| 6 | Mapbox Geocoding | Address → Coords | Usage (Requests) | 100K/month |
| 7 | Google Places UI Kit | Nearby Place Search | Usage (Requests) | None |
| 8 | Groq LLM | AI Chat Assistant | Usage (Tokens) | Generous free |
| 9 | Upstash Redis | Rate Limiting | Usage (Commands) | 500K/month |
| 10 | Resend | Transactional Email | Subscription | 3K/month |
| 11 | Sentry | Error Tracking | Subscription | 5K errors |
| 12 | Google OAuth | Authentication | Free | Unlimited |

---

## 2. Code Evidence Mapping

### 2.1 Vercel (Hosting Platform)

**Environment Variables:**
- `VERCEL` (runtime detection)
- `CRON_SECRET` (cron job auth)

**Code References:**
- `vercel.json:1-15` - Cron job configuration
- `next.config.ts` - Build configuration
- `sentry.server.config.ts:17` - Runtime detection

**Cron Jobs Configured:**
```json
// vercel.json
{ "path": "/api/cron/search-alerts", "schedule": "0 9 * * *" },
{ "path": "/api/cron/cleanup-rate-limits", "schedule": "0 3 * * *" }
```

**Pricing Source:** https://vercel.com/pricing (Retrieved: 2025-12-16)

| Plan | Price | Includes |
|------|-------|----------|
| Hobby | $0 | Personal use only, no commercial |
| Pro | $20/mo | 1TB bandwidth, 10M edge requests, 1M function invocations |
| Overage | Variable | $0.15/GB bandwidth, $2/M function invocations |

---

### 2.2 PostgreSQL with PostGIS (via Supabase)

**Environment Variables:**
- `DATABASE_URL` - Connection string
- `DIRECT_URL` - Direct connection (bypasses pooler)

**Code References:**
- `prisma/schema.prisma:1-20` - Database schema with PostGIS
- `src/lib/prisma.ts:1-30` - Prisma client singleton
- All `src/app/actions/*.ts` files - Database queries

**Schema Analysis:**
- ~20 models (User, Listing, Location, Message, Booking, Review, etc.)
- PostGIS extension for geospatial queries
- Connection pooling via Supabase

**Pricing Source:** https://supabase.com/pricing (Retrieved: 2025-12-16)

| Plan | Price | Database | Bandwidth |
|------|-------|----------|-----------|
| Free | $0 | 500MB | 5GB/month |
| Pro | $25/mo | 8GB | 250GB/month |
| Overage | Variable | $0.125/GB | $0.09/GB |

---

### 2.3 Supabase Storage

**Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Code References:**
- `src/app/api/upload/route.ts:1-225` - Image upload handler
- `src/lib/supabase.ts:1-77` - Supabase client

**Upload Constraints (from code):**
```typescript
// src/app/api/upload/route.ts:79
const maxSize = 5 * 1024 * 1024; // 5MB per file
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
```

**Storage Pattern:**
- Bucket: `images`
- Paths: `profiles/{userId}/*`, `listings/{userId}/*`

**Pricing Source:** https://supabase.com/pricing (Retrieved: 2025-12-16)

| Plan | Storage | Bandwidth |
|------|---------|-----------|
| Free | 1GB | 2GB/month |
| Pro | 100GB | 200GB/month |
| Overage | $0.021/GB | $0.09/GB |

---

### 2.4 Supabase Realtime

**Code References:**
- `src/lib/supabase.ts:18-26` - Realtime configuration
- `src/app/messages/[id]/ChatWindow.tsx` - Chat implementation

**Configuration:**
```typescript
// src/lib/supabase.ts:20-24
realtime: {
    params: {
        eventsPerSecond: 10  // Rate limited to 10 events/sec
    }
}
```

**Features Used:**
- Broadcast (typing indicators)
- Presence (online status)

**Pricing:** Included in Supabase plan
| Plan | Realtime Messages |
|------|-------------------|
| Free | 2M/month |
| Pro | 5M/month |
| Overage | $2.50/M messages |

---

### 2.5 Mapbox GL JS (Maps)

**Environment Variables:**
- `NEXT_PUBLIC_MAPBOX_TOKEN`

**Code References:**
- `src/components/Map.tsx:1-624` - Main map component
- `src/components/DynamicMap.tsx` - Dynamic import wrapper

**Map Styles Used:**
```typescript
// src/components/Map.tsx:441
mapStyle={isDarkMode ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v11"}
```

**Pricing Source:** https://www.mapbox.com/pricing (Retrieved: 2025-12-16)

| Tier | Map Loads | Price |
|------|-----------|-------|
| Free | 50,000/month | $0 |
| Pay-as-you-go | 50,001-100,000 | $0.50/1,000 |
| Pay-as-you-go | 100,001-200,000 | $0.40/1,000 |

---

### 2.6 Mapbox Geocoding API

**Code References:**
- `src/lib/geocoding.ts:1-47` - Server-side geocoding
- `src/components/LocationSearchInput.tsx` - Client-side search

**API Call Pattern:**
```typescript
// src/lib/geocoding.ts:16
const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${token}&limit=1`;
```

**Pricing Source:** https://www.mapbox.com/pricing (Retrieved: 2025-12-16)

| Tier | Requests | Price |
|------|----------|-------|
| Free | 100,000/month | $0 |
| Pay-as-you-go | 100,001+ | $0.75/1,000 |

---

### 2.7 Google Places UI Kit

**Environment Variables:**
- `NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY`

**Code References:**
- `src/lib/googleMapsUiKitLoader.ts` - Dynamic loader
- `src/components/chat/NearbyPlacesCard.tsx` - Place search UI

**Pricing Source:** https://developers.google.com/maps/documentation/places/web-service/usage-and-billing (Retrieved: 2025-12-16)

| API | Price |
|-----|-------|
| Places UI Kit (gmp-place-autocomplete-request) | $1.00/1,000 requests |

**Note:** This is significantly cheaper than the regular Places API ($17-32/1,000).

---

### 2.8 Groq LLM API

**Environment Variables:**
- `GROQ_API_KEY`

**Code References:**
- `src/app/api/chat/route.ts:217-219` - Groq client init
- `src/app/api/chat/route.ts:377` - Model selection

**Model Configuration:**
```typescript
// src/app/api/chat/route.ts:377
model: groq('llama-3.1-8b-instant')
```

**Rate Limits (from code):**
```typescript
// src/lib/rate-limit-redis.ts:28-44
// Burst: 5 requests/minute
// Sustained: 30 requests/hour
```

**Message Limits:**
```typescript
// src/app/api/chat/route.ts:85-87
const MAX_MESSAGES = 50;
const MAX_USER_TEXT_LENGTH = 2000;
const MAX_BODY_SIZE = 100_000; // 100KB
```

**Pricing Source:** https://groq.com/pricing/ (Retrieved: 2025-12-16)

| Model | Input | Output |
|-------|-------|--------|
| llama-3.1-8b-instant | $0.05/M tokens | $0.08/M tokens |

---

### 2.9 Upstash Redis

**Environment Variables:**
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Code References:**
- `src/lib/rate-limit-redis.ts:1-175` - Rate limiting implementation

**Rate Limiters Defined:**
```typescript
// Chat: 5/min burst, 30/hour sustained
// Metrics: 100/min burst, 500/hour sustained
```

**Pricing Source:** https://upstash.com/pricing/redis (Retrieved: 2025-12-16)

| Tier | Commands | Bandwidth | Price |
|------|----------|-----------|-------|
| Free | 500K/month | 200GB | $0 |
| Pay-as-you-go | Unlimited | Unlimited | $0.20/100K commands |

---

### 2.10 Resend (Email)

**Environment Variables:**
- `RESEND_API_KEY`
- `FROM_EMAIL`

**Code References:**
- `src/lib/email.ts:1-158` - Email sending service

**Email Types:**
```typescript
// src/lib/email.ts:105-114
bookingRequest, bookingAccepted, bookingRejected, bookingCancelled,
newMessage, newReview, searchAlert, marketing
```

**Pricing Source:** https://resend.com/pricing (Retrieved: 2025-12-16)

| Plan | Emails/month | Price |
|------|--------------|-------|
| Free | 3,000 | $0 |
| Pro | 50,000 | $20/month |
| Overage | Additional | $0.00028/email |

---

### 2.11 Sentry (Error Tracking)

**Environment Variables:**
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

**Code References:**
- `sentry.server.config.ts`
- `sentry.client.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`

**Configuration:**
```typescript
// sentry.server.config.ts
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0
```

**Pricing Source:** https://sentry.io/pricing/ (Retrieved: 2025-12-16)

| Plan | Errors | Price |
|------|--------|-------|
| Developer | 5,000/month | $0 |
| Team | 50,000/month | $26/month |
| Business | 100,000/month | $80/month |

---

### 2.12 Google OAuth

**Environment Variables:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

**Code References:**
- `src/auth.ts` - NextAuth configuration

**Pricing:** Free (no usage limits for OAuth)

---

## 3. Usage Model

### 3.1 Per-User Action Estimates

| Action | Services Triggered | Est. Cost/Action |
|--------|-------------------|------------------|
| Sign Up | OAuth + DB Write + Email | ~$0.0003 |
| Create Listing | DB + Geocoding + Storage (5 images) | ~$0.001 |
| View Listing | DB Read + Map Load | ~$0.00002 |
| Search | DB Query + Map Load + Geocoding | ~$0.0001 |
| Send Message | DB + Realtime + (Email) | ~$0.0001 |
| AI Chat | Groq (~500 tokens) | ~$0.00004 |
| Nearby Places | Google UI Kit | ~$0.001 |

### 3.2 Usage Assumptions by Tier

| Metric | 100 MAU | 1K MAU | 10K MAU | 100K MAU |
|--------|---------|--------|---------|----------|
| Page Views/User/Month | 20 | 15 | 10 | 8 |
| Listings Created/Month | 5 | 30 | 200 | 1,000 |
| Messages Sent/Month | 50 | 400 | 3,000 | 20,000 |
| AI Chat Sessions/Month | 20 | 150 | 1,000 | 5,000 |
| Nearby Searches/Month | 10 | 80 | 500 | 2,500 |
| Emails Sent/Month | 50 | 400 | 3,000 | 20,000 |
| Geocoding Requests | 10 | 60 | 400 | 2,000 |
| Map Loads/Month | 200 | 1,500 | 10,000 | 60,000 |
| Storage Used (GB) | 0.1 | 0.5 | 3 | 20 |
| DB Size (GB) | 0.1 | 0.3 | 1 | 5 |

---

## 4. Cost Calculations by Tier

### 4.1 Tier: 100 MAU (Starter)

| Service | Plan | Usage | Monthly Cost |
|---------|------|-------|--------------|
| Vercel | Hobby/Pro | Minimal | $0-20 |
| Supabase (DB+Storage+Realtime) | Free | Within limits | $0 |
| Mapbox Maps | Free | 200 loads | $0 |
| Mapbox Geocoding | Free | 10 requests | $0 |
| Google Places UI Kit | Pay-go | 10 requests | $0.01 |
| Groq | Free | ~10K tokens | $0 |
| Upstash | Free | ~2K commands | $0 |
| Resend | Free | 50 emails | $0 |
| Sentry | Developer | <100 errors | $0 |
| Google OAuth | Free | Unlimited | $0 |

**Total: $0 - $25/month**
- $0 if using Vercel Hobby (personal projects only)
- $20 for Vercel Pro (commercial use)

---

### 4.2 Tier: 1,000 MAU (Growth)

| Service | Plan | Usage | Monthly Cost |
|---------|------|-------|--------------|
| Vercel | Pro | Moderate | $20 |
| Supabase | Free→Pro | Near limits | $0-25 |
| Mapbox Maps | Free | 1,500 loads | $0 |
| Mapbox Geocoding | Free | 60 requests | $0 |
| Google Places UI Kit | Pay-go | 80 requests | $0.08 |
| Groq | Free | ~75K tokens | $0 |
| Upstash | Free | ~15K commands | $0 |
| Resend | Free | 400 emails | $0 |
| Sentry | Developer | ~500 errors | $0 |
| Google OAuth | Free | Unlimited | $0 |

**Total: $25 - $75/month**

| Scenario | Cost |
|----------|------|
| Low | $25 (Vercel Pro + Supabase Free) |
| Typical | $45 (Vercel Pro + Supabase Pro) |
| High | $75 (with overages) |

---

### 4.3 Tier: 10,000 MAU (Scale)

| Service | Plan | Usage | Monthly Cost |
|---------|------|-------|--------------|
| Vercel | Pro | Higher traffic | $20-40 |
| Supabase | Pro | 1GB DB, 3GB storage | $25-35 |
| Mapbox Maps | Free | 10K loads | $0 |
| Mapbox Geocoding | Free | 400 requests | $0 |
| Google Places UI Kit | Pay-go | 500 requests | $0.50 |
| Groq | Free/Low | ~500K tokens | $0.04 |
| Upstash | Free | ~100K commands | $0 |
| Resend | Pro | 3K emails | $0-20 |
| Sentry | Team | ~2K errors | $26 |
| Google OAuth | Free | Unlimited | $0 |

**Total: $75 - $250/month**

| Scenario | Cost |
|----------|------|
| Low | $75 |
| Typical | $145 |
| High | $250 |

---

### 4.4 Tier: 100,000 MAU (Enterprise)

| Service | Plan | Usage | Monthly Cost |
|---------|------|-------|--------------|
| Vercel | Pro | High traffic | $50-150 |
| Supabase | Pro+ | 5GB DB, 20GB storage | $50-100 |
| Mapbox Maps | Pay-go | 60K loads (10K over) | $5 |
| Mapbox Geocoding | Free | 2K requests | $0 |
| Google Places UI Kit | Pay-go | 2.5K requests | $2.50 |
| Groq | Pay-go | ~2.5M tokens | $0.20 |
| Upstash | Pay-go | ~500K commands | $0-1 |
| Resend | Pro+ | 20K emails | $20-30 |
| Sentry | Team/Business | ~10K errors | $26-80 |
| Google OAuth | Free | Unlimited | $0 |

**Total: $300 - $1,200/month**

| Scenario | Cost |
|----------|------|
| Low | $300 |
| Typical | $600 |
| High | $1,200 |

---

## 5. Fixed vs Variable Costs

### 5.1 Fixed Costs (Monthly Subscriptions)

| Service | Free | Growth | Scale | Enterprise |
|---------|------|--------|-------|------------|
| Vercel Pro | $0-20 | $20 | $20 | $20 |
| Supabase Pro | $0 | $0-25 | $25 | $25 |
| Resend Pro | $0 | $0 | $0-20 | $20 |
| Sentry Team | $0 | $0 | $26 | $26-80 |
| **Total Fixed** | $0-20 | $20-45 | $71-91 | $91-145 |

### 5.2 Variable Costs (Usage-Based)

| Service | Unit | Price |
|---------|------|-------|
| Vercel Bandwidth | Per GB | $0.15 |
| Vercel Functions | Per M invocations | $2.00 |
| Supabase DB Overage | Per GB | $0.125 |
| Supabase Storage Overage | Per GB | $0.021 |
| Supabase Bandwidth | Per GB | $0.09 |
| Mapbox Maps | Per 1K loads | $0.40-0.50 |
| Mapbox Geocoding | Per 1K requests | $0.75 |
| Google Places UI Kit | Per 1K requests | $1.00 |
| Groq Input Tokens | Per M tokens | $0.05 |
| Groq Output Tokens | Per M tokens | $0.08 |
| Upstash Commands | Per 100K | $0.20 |
| Resend Emails | Per email | $0.00028 |

---

## 6. Cost Optimization Recommendations

### 6.1 Quick Wins

1. **Stay on Free Tiers:** Most services have generous free tiers that cover starter usage
2. **Optimize Images:** Compress before upload (current 5MB limit is generous)
3. **Rate Limiting:** Already implemented - prevents abuse and cost spikes
4. **Map Load Caching:** Consider client-side caching of map tiles

### 6.2 At Scale Optimizations

1. **Supabase:** Monitor database size; consider Postgres connection pooling
2. **Mapbox:** Batch geocoding requests; cache results in database
3. **Google Places:** Client-side only (already done) - very cost efficient
4. **Groq:** Implement response caching for common questions
5. **Sentry:** Use sampling (already at 10% in production)

### 6.3 Cost Alerts Setup

| Service | Free Limit | Alert Threshold |
|---------|------------|-----------------|
| Mapbox Maps | 50K | 40K loads |
| Mapbox Geocoding | 100K | 80K requests |
| Supabase Storage | 1GB | 800MB |
| Resend | 3K | 2.5K emails |
| Sentry | 5K | 4K errors |
| Upstash | 500K | 400K commands |

---

## 7. Risk Assessment

### 7.1 Cost Spike Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Map load abuse | Low | Medium | Rate limiting, auth required |
| AI chat abuse | Low | Low | Redis rate limits (5/min, 30/hr) |
| Storage abuse | Low | Medium | File size limits, auth required |
| Email spam | Low | Medium | Transactional only, auth required |

### 7.2 Vendor Lock-in Assessment

| Service | Lock-in Risk | Migration Difficulty |
|---------|--------------|---------------------|
| Vercel | Medium | Moderate (Next.js portable) |
| Supabase | Medium | Moderate (Standard Postgres) |
| Mapbox | Low | Easy (MapLibre alternative) |
| Groq | Low | Easy (OpenAI-compatible API) |
| Resend | Low | Easy (Standard SMTP) |

---

## 8. Data Sources & Citations

| Service | Pricing URL | Retrieved |
|---------|-------------|-----------|
| Vercel | https://vercel.com/pricing | 2025-12-16 |
| Supabase | https://supabase.com/pricing | 2025-12-16 |
| Mapbox | https://www.mapbox.com/pricing | 2025-12-16 |
| Google Places | https://developers.google.com/maps/documentation/places/web-service/usage-and-billing | 2025-12-16 |
| Groq | https://groq.com/pricing/ | 2025-12-16 |
| Upstash | https://upstash.com/pricing/redis | 2025-12-16 |
| Resend | https://resend.com/pricing | 2025-12-16 |
| Sentry | https://sentry.io/pricing/ | 2025-12-16 |

---

## Appendix A: Environment Variables Reference

```bash
# Vercel (Auto-injected)
VERCEL=1

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx

# Google
NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Groq
GROQ_API_KEY=xxx

# Upstash
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Resend
RESEND_API_KEY=re_xxx
FROM_EMAIL=RoomShare <noreply@yourdomain.com>

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx
SENTRY_ORG=xxx
SENTRY_PROJECT=xxx

# Cron
CRON_SECRET=xxx
```

---

*Report generated by automated code analysis. All pricing is subject to change; verify with official sources before financial planning.*
