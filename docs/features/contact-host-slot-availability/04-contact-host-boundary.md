# Contact Host Boundary

## Active Product Boundary

The active path is Contact Host. Viewer contracts expose contact CTA states and explicitly keep booking and holds disabled through `canBook: false` and `canHold: false`. See E-CT-001 and E-CT-002.

Viewer visibility uses resolved public availability and can return gate reasons for migration review, moderation lock, or listing unavailable. See E-CT-003.

Viewer-state responses select current availability fields and return the contact contract, public availability, and `hasBookingHistory: false` for anonymous and authenticated paths. See E-CT-004.

## UI And Action Boundary

Listing detail renders ContactHostButton when the primary CTA is `CONTACT_HOST` and the user can contact or unlock contact. Otherwise it renders a disabled Contact Host state with restriction copy. See E-CT-007.

ContactHostButton calls `startConversation`, handles disabled/unlock/loading states, and labels the active path as `Contact Host` or `Unlock to Contact`. See E-CT-006.

`startConversation` checks session, rate limit, suspension, email verification, listing contactability, ownership, host suspension, block state, entitlement, and then creates or reuses a conversation. See E-CT-008.

## Contactability Guard

Messaging contactability uses resolved public listing visibility and listing status to decide whether contact can proceed. See E-CT-005.

The targeted contactability suite did not pass completely. Two ACTIVE-listing expectations failed because the current result was `LISTING_UNAVAILABLE`; seven other tests passed. This report therefore treats the broad contactability source behavior as verified from source, but the specific ACTIVE-fixture expectation is a verified failure, not a passing guarantee. See E-TEST-005.

## Historical Booking Boundary

Booking and hold capabilities are not active in the current contact contract. The current contract returns compatibility booking-disabled fields while setting `canBook` and `canHold` to false. See E-CT-002.

Phase 09 retirement of booking storage and schema search absence of current booking model support the historical classification. See E-HIST-001 and E-HIST-002.

## Not Verified

No browser E2E verified a full Contact Host click through successful conversation creation. Source and unit/API coverage are available, but end-to-end browser contact creation is `NOT VERIFIED`. See E-GAP-003.
