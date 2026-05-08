const {
  scanPublicPayloadForPii,
} = require("../../../scripts/scan-public-payload-pii.js");

describe("scan-public-payload-pii", () => {
  it("allows coarsened public coordinates, image URLs, snapshot versions, and public group ids", () => {
    const violations = scanPublicPayloadForPii({
      meta: { snapshotVersion: "phase04-unit-v1" },
      list: {
        fullItems: [
          {
            id: "listing-1",
            images: [
              "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600",
            ],
            location: { city: "Austin", state: "TX", lat: 30.27, lng: -97.74 },
            groupKey: "pg1_public-key",
            groupSummary: { groupKey: "pg1_public-key" },
            groupContext: { contextKey: "pg1_public-key" },
          },
        ],
      },
      map: {
        geojson: {
          features: [
            {
              properties: {
                image:
                  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600",
                groupContext: { contextKey: "pg1_public-key" },
              },
            },
          ],
        },
      },
    });

    expect(violations).toEqual([]);
  });

  it("rejects exact coordinates and raw group identities", () => {
    const violations = scanPublicPayloadForPii({
      list: {
        fullItems: [
          {
            location: {
              lat: 30.26721,
              lng: -97.74312,
            },
            groupKey: "private-unit-key:12",
            groupContext: { contextKey: "private-unit-key:12" },
          },
        ],
      },
    });

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "list.fullItems.0.location.lat",
          reason: "exact_coordinate_value",
        }),
        expect.objectContaining({
          path: "list.fullItems.0.location.lng",
          reason: "exact_coordinate_value",
        }),
        expect.objectContaining({
          path: "list.fullItems.0.groupKey",
          reason: "raw_group_identity",
        }),
        expect.objectContaining({
          path: "list.fullItems.0.groupContext.contextKey",
          reason: "raw_group_identity",
        }),
      ])
    );
  });
});
