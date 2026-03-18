/**
 * Tests for create-listing server action (deprecated — returns error)
 */

import { createListing } from "@/app/actions/create-listing";

// DEPRECATED: Tests for deprecated server action (src/app/actions/create-listing.ts)
// This action is superseded by the API route POST /api/listings
describe.skip("createListing server action", () => {
  it("returns a deprecation error for any invocation", async () => {
    const formData = new FormData();
    formData.append("title", "Test");

    const result = await createListing({ success: false }, formData);

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("deprecated"),
    });
  });
});
