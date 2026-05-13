# 06 Data Model And Invariants

| Model or invariant | Current behavior | Evidence |
| --- | --- | --- |
| Report status/kind | `ReportStatus` contains `OPEN`, `RESOLVED`, and `DISMISSED`; `ReportKind` contains `ABUSE_REPORT` and `PRIVATE_FEEDBACK`. | MRA-E015 |
| Report privacy intent | `Report` includes a source comment that private feedback must not bleed into reviews, listings, or public viewer-state payloads. | MRA-E015 |
| Report relations | `Report` stores listing, reporter, reviewer, optional target user, status, admin notes, reviewedBy, resolvedAt, and indexes for status/listing/kind-target lookups. | MRA-E015 |
| Verification request | `VerificationRequest` stores user, document type, private document/selfie paths, MIME fields, retention timestamps, status, admin notes, review metadata, and upload relation. | MRA-E015 |
| Verification upload | `VerificationUpload` stores user, optional request, kind, unique storage path, MIME, size, expiry, consumedAt, and indexes. | MRA-E015 |
| Audit log | `AuditLog` stores admin, action, target type/id, JSON details, optional IP address, createdAt, and indexes. | MRA-E015 |
| User/listing references | Admin actions rely on user admin/suspension/verification fields and listing status/statusReason/version/report relations. | MRA-E018, MRA-E005, MRA-E006, MRA-E007 |
| Moderation lock | `ADMIN_PAUSED` and `SUPPRESSED` are moderation lock reasons; host writes return a lock shape for those reasons. | MRA-E014 |
| Report resolution invariant | Report resolve actions only mutate `OPEN` reports and return state conflict for already reviewed reports. | MRA-E008, MRA-E009 |
| Verification review invariant | Verification approval/rejection only mutates `PENDING` requests and approval requires non-expired available document path. | MRA-E012 |
| Booking audit log delete safety | Migration SQL makes `BookingAuditLog.bookingId` nullable and changes the booking FK to `ON DELETE SET NULL`, preserving audit rows when bookings are deleted. | MRA-E024 |
| Verification token rotation constraints | Migration SQL deduplicates verification tokens per identifier, permits nullable active/pending token columns, and adds unique identifier, unique pending-token hash, and pending-expiry indexes. | MRA-E024 |
| Private feedback report schema | Migration SQL creates `ReportKind`, adds report `kind` and optional `targetUserId`, uses a set-null target-user FK, and indexes kind/target/status lookups. | MRA-E024 |
| Moderation precedence and append-only guards | Migration SQL creates triggers that block host writes to moderation-controlled columns on physical units, host unit claims, and listing inventories; it also makes identity mutations and audit events append-only. | MRA-E024 |
| Private verification document retention | Migration SQL adds private verification document path/MIME/retention columns, creates `VerificationUpload`, blocks duplicate pending requests, indexes storage/expiry fields, cascades upload rows by user, and keeps request links set-null. | MRA-E024 |
| Reporting abuse duplicate/reporting hardening | Migration SQL blocks duplicate active abuse reports, adds a unique active-report index, and removes `BlockedUser` from Supabase realtime publication when present. | MRA-E024 |

Migration source audit status: tracked migration SQL line audit is complete for the six moderation/reporting/verification-related migrations in MRA-E024. MRA-G004 now tracks only deployed production/staging database migration-state proof.
