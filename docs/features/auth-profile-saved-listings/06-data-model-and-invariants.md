# 06 Data Model And Invariants

| Model or invariant | Current behavior | Evidence |
| --- | --- | --- |
| User account | `User` stores email, email verification, image, password hash, passwordChangedAt, profile fields, admin/suspension flags, preferences, account/listing/message/saved/review/report/notification/verification/blocking relations. | APS-E016 |
| Verification token | `VerificationToken` stores unique identifier, active and pending token hashes, expirations, and indexes on expirations. | APS-E016 |
| Password reset token | `PasswordResetToken` stores email, unique token hash, expiry, createdAt, unique email/hash, and expiry index. | APS-E016 |
| Saved listing uniqueness | `SavedListing` stores user/listing relation with unique userId/listingId and listing index. | APS-E016 |
| Saved search | `SavedSearch` stores user, name, query, filters, canonical search spec fields, active flag, alertEnabled, alertFrequency, lastAlertAt, and alert relations. | APS-E016 |
| Alert subscription | `AlertSubscription` starts with saved search, user, channel, frequency, active, and delivery timestamps. | APS-E016 |
| Blocked users | `BlockedUser` stores blocker/blocked users with unique blockerId/blockedId and indexes. | APS-E016 |
| Password revocation | Auth callbacks and helpers compare authTime with passwordChangedAt and invalidate stale sessions. | APS-E001, APS-E003 |
| Saved search cap | Save search transaction acquires a user-specific advisory lock and rejects more than 10 saved searches. | APS-E014 |
| Account delete tombstone | Delete account action locks user/listings, suppresses reported listings, deletes unreported owned listings and account-owned records, clears identity fields, sets passwordChangedAt, and marks user suspended. | APS-E015 |

Data-retention policy gap: source behavior is documented, but product/legal retention expectations are not verified in this pass; see APS-G004.
