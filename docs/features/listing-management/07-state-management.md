# 07 State Management

| State area | Owner | Current behavior | Evidence |
| --- | --- | --- | --- |
| Create draft | `CreateListingForm` | Uses `useFormPersistence` with a listing form key and exposes persisted data, draft state, save/cancel/clear, hydration, and cross-tab conflict controls. | LM-E002 |
| Create unsaved guard | `CreateListingForm` | Computes unsaved work from submit success, loading, uploaded images, and text/address fields; `useNavigationGuard` gets separate loading and unsaved messages. | LM-E002 |
| Create submission | `CreateListingForm` | Tracks submitting/loading state, abort controller, idempotency key, field errors, collision siblings/body, and success redirect timeout. | LM-E003 |
| Image upload state | `ImageUploader` | Tracks images, drag state, size errors, file input, size error timeout, and upload abort controller. | LM-E004 |
| Server create state | `POST /api/listings` | Writes listing/location/canonical availability/search-dirty state inside transaction and fires search/embedding/alert side effects after commit. | LM-E007 |
| Edit availability state | `EditListingForm` | Sends expected version and handles write lock, reload suggestion, field errors, abort, redirect, and Sentry capture. | LM-E009 |
| Edit profile state | `EditListingForm` | Sends form and image state, handles write lock and field errors, clears persisted draft on success, saves current draft on error. | LM-E010 |
| Server update state | `PATCH /api/listings/[id]` | Row-locks listing, increments version on writes, updates location/canonical availability/search dirty state, and best-effort removes old storage images. | LM-E011, LM-E012 |
| Server status state | `updateListingStatus` | Row-locks listing, writes status/statusReason/version, marks dirty, syncs lifecycle, and revalidates paths. | LM-E015 |
| Delete state | `DELETE /api/listings/[id]` | Row-locks listing, either suppresses reported listings or tombstones/deletes unreported listings, then best-effort removes images. | LM-E013 |
