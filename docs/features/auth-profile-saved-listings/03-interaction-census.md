# 03 Interaction Census

This file is the final-form copy of `interaction-census.md`.

| Interaction | Primary state owner | Current behavior | Evidence | Gap |
| --- | --- | --- | --- | --- |
| Login | Login client plus Auth.js credentials provider | Safe callback redirect, stale-session clearing, rate/credential errors, Turnstile reset, provider schema/rate/Turnstile/bcrypt. | APS-E004, APS-E002, APS-E020 | APS-G003 |
| Signup/register | Signup client plus register API | Client validation and generic duplicate-safe server registration with verification token and private no-store route-handler responses; APS-E025 live no-Origin/no-CSRF POST returned 403 JSON with `private, no-cache`. | APS-E005, APS-E006, APS-E019, APS-E020, APS-E025 | APS-G002 live cache residual; APS-G003 |
| Email verify/reset | Auth API routes | Hashed tokens, expiration, transaction consumption, status/error mapping, and private no-store route-handler responses; APS-E025 live no-Origin/no-CSRF auth recovery POSTs returned 403 JSON with `private, no-cache`. | APS-E007, APS-E008, APS-E009, APS-E019, APS-E025 | APS-G002 live cache residual; APS-G003 |
| Profile view/edit | Server page, profile client, profile action | Safe selected fields, edit/upload/draft/update/revalidate. | APS-E010, APS-E011, APS-E020 | None active for Chromium browser gate |
| Saved listings/favorites | Server page, client, server action, API route | Auth-scoped list/sort/remove/toggle/private no-store route-handler saved IDs; APS-E025 live favorites GET returned 200 `{"savedIds":[]}` and favorites POST CSRF returned 403 JSON with `private, no-cache`. | APS-E012, APS-E013, APS-E019, APS-E020, APS-E025 | APS-G002 live cache residual |
| Saved searches | Server page, client, actions | Auth-scoped saved search list/save/delete/toggle/rename/alert/paywall/checkout polling. | APS-E014, APS-E020 | APS-G003, APS-G005 |
| Settings/delete account | Settings page/client/actions | Preferences, password change, blocked users UI, delete account tombstone and cleanup. | APS-E015, APS-E019, APS-E020 | APS-G004 |
