---
name: roomshare-security-abuse
description: Use for authZ, messaging, PII, rate limiting, enumeration risks, fraud/abuse prevention, and audit logging.
---

# Security + Abuse SOP

- AuthZ checks on every mutation
- Prevent enumeration (same error for “not found” vs “not allowed”)
- Rate-limit messaging/apply flows
- No PII in logs
- Add abuse tests (spam, bypass attempt, replay)
