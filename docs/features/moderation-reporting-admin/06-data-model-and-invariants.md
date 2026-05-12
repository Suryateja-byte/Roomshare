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

Migration-line audit gap: relevant migration paths were discovered, but every migration invariant was not line-audited in this pass; see MRA-G004.
