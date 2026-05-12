# 06 Data Model And Invariants

| Model or invariant | Current behavior | Evidence |
| --- | --- | --- |
| Listing core fields | `Listing` stores owner, title, description, price, images, amenities, house rules, room/language/gender metadata, slots, dates, status, status reason, version, and timestamps. | LM-E017 |
| Listing status values | `ListingStatus` enum currently contains `ACTIVE`, `PAUSED`, and `RENTED`. | LM-E017 |
| Location | `Location` is one-to-one with listing and stores address/city/state/zip plus geometry with a Gist index. | LM-E017 |
| Idempotency key | `IdempotencyKey` stores user, endpoint, key, processing/completed status, request hash, result JSON, timestamps, and uniqueness on user/endpoint/key. | LM-E017 |
| Listing inventory projection | `ListingInventory` stores canonical inventory fields such as unit, inventory key, room category, date range, price, lifecycle status, publish status, versions, canonical address hash, and identity links. | LM-E017 |
| Create listing limits | Create schema caps title, description, price, amenities, house rules, total slots, address/city/state/zip, and requires a valid move-in date through API/client schemas. | LM-E016 |
| Image URL invariant | Listing images must be 1 to 10 Supabase URLs under the configured project host, and create/update APIs additionally require listing image paths under `listings/{userId}/` for new URLs. | LM-E006, LM-E012, LM-E016 |
| Max active listings | Create transaction counts active/paused listings for the owner and rejects create when count is at least 10. | LM-E007 |
| Optimistic locking | Update paths compare request expected version with the locked listing version before writing. | LM-E011, LM-E012, LM-E015 |
| Moderation write lock | Host writes can be blocked when status reason is `ADMIN_PAUSED` or `SUPPRESSED`, returning a lock error shape. | LM-E018 |
| Reported delete invariant | Owner deletion of a reported listing suppresses it rather than hard-deleting it. | LM-E013 |

Migration-line audit gap: relevant migration paths were discovered, but every migration invariant was not line-audited in this pass; see LM-G004.
