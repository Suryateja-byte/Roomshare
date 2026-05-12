# Feature Documentation

Feature documentation under this directory uses the evidence-first harness in
`.agents/workflows/feature-documentation-harness.md`.

Do not start with final prose. For each feature, build these files first:

1. `00-feature-boundary.md`
2. `manifest.json`
3. `source-map.md`
4. `evidence-register.md`
5. `interaction-census.md`

Final documentation is generated only after the manifest and evidence register
are complete and every factual claim is cited or marked as a gap.

## Recommended Roomshare Order

| Priority | Feature | Slug |
|---:|---|---|
| 1 | Search / Map / Listing Discovery | `search-map` |
| 2 | Contact Host Flow | `contact-host` |
| 3 | Listing Creation / Management | `listing-management` |
| 4 | Auth / Profile / Saved Listings | `auth-profile-saved-listings` |
| 5 | Moderation / Reporting / Admin | `moderation-reporting-admin` |

## Templates

Reusable starter templates live in `docs/features/_templates/`.
