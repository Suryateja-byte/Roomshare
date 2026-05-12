# 03 Interaction Census

This file is the final-form copy of `interaction-census.md`.

| Interaction | Primary state owner | Current behavior | Evidence | Gap |
| --- | --- | --- | --- | --- |
| Create page auth gate | Server page | Redirects anonymous users before rendering the create form. | LM-E001 | None recorded. |
| Profile warning | Server page | Computes profile completion and shows a soft warning when below 60 percent. | LM-E001 | None recorded. |
| Draft and navigation guard | Create client | Tracks unsaved work and active submission to block unsafe navigation. | LM-E002 | LM-G006 closed after focused expired-draft rerun and final broad gate passed. |
| Image upload | `ImageUploader` client plus `/api/upload` | Filters files, uploads, records errors, and best-effort deletes removed storage objects. | LM-E004 | LM-G003 and LM-G005. |
| Publish submit | Create client plus `POST /api/listings` | Validates, submits with idempotency key, handles field/collision errors, clears draft on success. | LM-E003, LM-E005, LM-E006, LM-E007 | LM-G002 and LM-G003 remain; LM-G006 is closed for the selected broad browser gate. |
| Edit page auth/owner gate | Server page | Redirects unauthenticated users and non-owners, not-found for missing listings. | LM-E008 | None recorded. |
| Availability edit | Edit client plus PATCH route | Versioned update with moderation lock and date invariant handling. | LM-E009, LM-E011 | Current browser coverage passed; live HTTP/curl gap remains LM-G002. |
| Profile edit | Edit client plus PATCH route | Versioned listing/profile/image update with lock and draft preservation on error. | LM-E010, LM-E012 | Source/API-audited; current active browser edit surface asserts legacy profile controls absent; storage gap LM-G005. |
| Status action | Server action | Owner-only row-locked status update with version and moderation checks. | LM-E015 | Browser status flow passed; no current gap recorded beyond LM-G002 live HTTP/curl scope. |
| Delete | DELETE route | Confirmed owner-only row-locked delete/suppress behavior. | LM-E013 | LM-G002, LM-G005. |
