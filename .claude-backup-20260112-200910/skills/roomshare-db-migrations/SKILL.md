---
name: roomshare-db-migrations
description: Use for schema changes, indexes, RLS, migrations, and rollbacks. Must produce safe migration + rollback notes.
---

# DB Migration SOP

- Provide: schema diff, migration steps, rollback steps
- Prefer additive changes first (expand/contract)
- Add indexes for any high-cardinality filters
- For RLS: include test queries for allowed/denied access
