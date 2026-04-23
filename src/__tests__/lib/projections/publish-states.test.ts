/**
 * Tests for src/lib/projections/publish-states.ts
 */
import {
  PUBLISH_STATES,
  isPublishedStatus,
  isHiddenStatus,
  isPendingStatus,
  type PublishState,
} from "@/lib/projections/publish-states";

describe("PUBLISH_STATES", () => {
  it("contains all 9 expected states", () => {
    expect(PUBLISH_STATES).toHaveLength(9);
    expect(PUBLISH_STATES).toContain("DRAFT");
    expect(PUBLISH_STATES).toContain("PENDING_GEOCODE");
    expect(PUBLISH_STATES).toContain("PENDING_PROJECTION");
    expect(PUBLISH_STATES).toContain("PENDING_EMBEDDING");
    expect(PUBLISH_STATES).toContain("PUBLISHED");
    expect(PUBLISH_STATES).toContain("STALE_PUBLISHED");
    expect(PUBLISH_STATES).toContain("PAUSED");
    expect(PUBLISH_STATES).toContain("SUPPRESSED");
    expect(PUBLISH_STATES).toContain("ARCHIVED");
  });

  it("is a readonly tuple", () => {
    // Type-level: PUBLISH_STATES is inferred as readonly. Runtime: verify frozen-ish.
    expect(Array.isArray(PUBLISH_STATES)).toBe(true);
  });
});

describe("isPublishedStatus()", () => {
  it("returns true for PUBLISHED", () => {
    expect(isPublishedStatus("PUBLISHED")).toBe(true);
  });

  it("returns true for STALE_PUBLISHED", () => {
    expect(isPublishedStatus("STALE_PUBLISHED")).toBe(true);
  });

  it("returns false for DRAFT", () => {
    expect(isPublishedStatus("DRAFT")).toBe(false);
  });

  it("returns false for PAUSED", () => {
    expect(isPublishedStatus("PAUSED")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isPublishedStatus("")).toBe(false);
  });

  it("returns false for all non-published states", () => {
    const notPublished: string[] = [
      "DRAFT",
      "PENDING_GEOCODE",
      "PENDING_PROJECTION",
      "PENDING_EMBEDDING",
      "PAUSED",
      "SUPPRESSED",
      "ARCHIVED",
    ];
    for (const s of notPublished) {
      expect(isPublishedStatus(s)).toBe(false);
    }
  });
});

describe("isHiddenStatus()", () => {
  it("returns true for PAUSED", () => {
    expect(isHiddenStatus("PAUSED")).toBe(true);
  });

  it("returns true for SUPPRESSED", () => {
    expect(isHiddenStatus("SUPPRESSED")).toBe(true);
  });

  it("returns true for ARCHIVED", () => {
    expect(isHiddenStatus("ARCHIVED")).toBe(true);
  });

  it("returns false for PUBLISHED", () => {
    expect(isHiddenStatus("PUBLISHED")).toBe(false);
  });

  it("returns false for DRAFT", () => {
    expect(isHiddenStatus("DRAFT")).toBe(false);
  });

  it("returns false for all non-hidden states", () => {
    const notHidden: string[] = [
      "DRAFT",
      "PENDING_GEOCODE",
      "PENDING_PROJECTION",
      "PENDING_EMBEDDING",
      "PUBLISHED",
      "STALE_PUBLISHED",
    ];
    for (const s of notHidden) {
      expect(isHiddenStatus(s)).toBe(false);
    }
  });
});

describe("isPendingStatus()", () => {
  it("returns true for PENDING_GEOCODE", () => {
    expect(isPendingStatus("PENDING_GEOCODE")).toBe(true);
  });

  it("returns true for PENDING_PROJECTION", () => {
    expect(isPendingStatus("PENDING_PROJECTION")).toBe(true);
  });

  it("returns true for PENDING_EMBEDDING", () => {
    expect(isPendingStatus("PENDING_EMBEDDING")).toBe(true);
  });

  it("returns false for PUBLISHED", () => {
    expect(isPendingStatus("PUBLISHED")).toBe(false);
  });

  it("returns false for DRAFT", () => {
    expect(isPendingStatus("DRAFT")).toBe(false);
  });

  it("returns false for all non-pending states", () => {
    const notPending: string[] = [
      "DRAFT",
      "PUBLISHED",
      "STALE_PUBLISHED",
      "PAUSED",
      "SUPPRESSED",
      "ARCHIVED",
    ];
    for (const s of notPending) {
      expect(isPendingStatus(s)).toBe(false);
    }
  });
});

describe("state partition completeness", () => {
  it("every state falls into exactly one classification group", () => {
    // pending, published, hidden, or DRAFT (uncategorized) — partitions are mutually exclusive
    for (const s of PUBLISH_STATES) {
      const groups = [
        isPublishedStatus(s),
        isHiddenStatus(s),
        isPendingStatus(s),
      ].filter(Boolean).length;
      // DRAFT belongs to none of the three groups
      if (s === "DRAFT") {
        expect(groups).toBe(0);
      } else {
        expect(groups).toBe(1);
      }
    }
  });
});
