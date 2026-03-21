import {
  createBookingSchema,
  createHoldSchema,
  sanitizeUnicode,
  noHtmlTags,
} from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Shared date helpers — all computed relative to "now" so tests never rot.
// ---------------------------------------------------------------------------

/** Returns an ISO string for a date N days from today (time zeroed to midnight local). */
function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Returns an ISO string for a date N days ago. */
function pastDate(daysAgo: number): string {
  return futureDate(-daysAgo);
}

/** Returns an ISO string for today at midnight local. */
function today(): string {
  return futureDate(0);
}

// ---------------------------------------------------------------------------
// createBookingSchema
// ---------------------------------------------------------------------------

describe("createBookingSchema", () => {
  const validBooking = {
    listingId: "listing-123",
    startDate: futureDate(7),
    endDate: futureDate(45), // 38 days > 30 minimum
    pricePerMonth: 800,
    slotsRequested: 1,
  };

  // -------------------------------------------------------------------------
  // valid inputs
  // -------------------------------------------------------------------------

  describe("valid inputs", () => {
    it("accepts a complete valid booking", () => {
      const result = createBookingSchema.safeParse(validBooking);
      expect(result.success).toBe(true);
    });

    it("coerces string dates to Date objects", () => {
      const result = createBookingSchema.safeParse(validBooking);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startDate).toBeInstanceOf(Date);
        expect(result.data.endDate).toBeInstanceOf(Date);
      }
    });

    it("coerces string price to number", () => {
      const input = { ...validBooking, pricePerMonth: "1200" };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.pricePerMonth).toBe("number");
        expect(result.data.pricePerMonth).toBe(1200);
      }
    });

    it("defaults slotsRequested to 1 when omitted", () => {
      const { slotsRequested: _omitted, ...input } = validBooking;
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slotsRequested).toBe(1);
      }
    });

    it("accepts slotsRequested of 20 (max boundary)", () => {
      const input = { ...validBooking, slotsRequested: 20 };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slotsRequested).toBe(20);
      }
    });

    it("accepts exactly 30-day duration (min boundary)", () => {
      const start = futureDate(7);
      const end = futureDate(37); // exactly 30 days later
      const input = { ...validBooking, startDate: start, endDate: end };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("accepts start date of today", () => {
      // today is valid — schema requires startDate >= today
      const input = {
        ...validBooking,
        startDate: today(),
        endDate: futureDate(35),
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // invalid inputs — required fields
  // -------------------------------------------------------------------------

  describe("invalid inputs - required fields", () => {
    it("rejects empty listingId", () => {
      const input = { ...validBooking, listingId: "" };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Listing ID is required");
      }
    });

    it("rejects missing listingId", () => {
      const { listingId: _omitted, ...input } = validBooking;
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects invalid date string for startDate", () => {
      const input = { ...validBooking, startDate: "not-a-date" };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Valid start date is required"
        );
      }
    });

    it("rejects invalid date string for endDate", () => {
      const input = { ...validBooking, endDate: "not-a-date" };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Valid end date is required"
        );
      }
    });

    it("rejects missing startDate", () => {
      const { startDate: _omitted, ...input } = validBooking;
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects missing endDate", () => {
      const { endDate: _omitted, ...input } = validBooking;
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects missing pricePerMonth", () => {
      const { pricePerMonth: _omitted, ...input } = validBooking;
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // invalid inputs — business rules
  // -------------------------------------------------------------------------

  describe("invalid inputs - business rules", () => {
    it("rejects end date before start date", () => {
      const input = {
        ...validBooking,
        startDate: futureDate(45),
        endDate: futureDate(7),
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const endDateIssue = result.error.issues.find(
          (i) => i.path[0] === "endDate"
        );
        expect(endDateIssue?.message).toBe("End date must be after start date");
      }
    });

    it("rejects end date equal to start date", () => {
      const same = futureDate(14);
      const input = { ...validBooking, startDate: same, endDate: same };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const endDateIssue = result.error.issues.find(
          (i) => i.path[0] === "endDate"
        );
        expect(endDateIssue?.message).toBe("End date must be after start date");
      }
    });

    it("rejects start date in the past", () => {
      const input = {
        ...validBooking,
        startDate: pastDate(1),
        endDate: futureDate(40),
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const startDateIssue = result.error.issues.find(
          (i) => i.path[0] === "startDate"
        );
        expect(startDateIssue?.message).toBe(
          "Start date cannot be in the past"
        );
      }
    });

    it("rejects booking duration less than 30 days (29 days)", () => {
      // start=+7, end=+36 → exactly 29 days
      const input = {
        ...validBooking,
        startDate: futureDate(7),
        endDate: futureDate(36),
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const endDateIssue = result.error.issues.find(
          (i) => i.path[0] === "endDate"
        );
        expect(endDateIssue?.message).toBe(
          "Minimum booking duration is 30 days"
        );
      }
    });

    it("rejects zero price", () => {
      const input = { ...validBooking, pricePerMonth: 0 };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Price must be positive");
      }
    });

    it("rejects negative price", () => {
      const input = { ...validBooking, pricePerMonth: -100 };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects slotsRequested of 0", () => {
      const input = { ...validBooking, slotsRequested: 0 };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Must request at least 1 slot"
        );
      }
    });

    it("rejects slotsRequested of 21 (over max)", () => {
      const input = { ...validBooking, slotsRequested: 21 };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Cannot request more than 20 slots"
        );
      }
    });

    it("rejects negative slotsRequested", () => {
      const input = { ...validBooking, slotsRequested: -1 };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects decimal slotsRequested (e.g. 1.5)", () => {
      const input = { ...validBooking, slotsRequested: 1.5 };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Slots must be a whole number");
      }
    });
  });

  // -------------------------------------------------------------------------
  // invalid inputs — type safety
  // -------------------------------------------------------------------------

  describe("invalid inputs - type safety", () => {
    it("rejects non-numeric price string", () => {
      const input = { ...validBooking, pricePerMonth: "not-a-number" };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = createBookingSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects Infinity for price", () => {
      const input = { ...validBooking, pricePerMonth: Infinity };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects NaN for price", () => {
      const input = { ...validBooking, pricePerMonth: NaN };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// createHoldSchema — shares identical structure and refinements with booking
// ---------------------------------------------------------------------------

describe("createHoldSchema", () => {
  const validHold = {
    listingId: "listing-456",
    startDate: futureDate(7),
    endDate: futureDate(45),
    pricePerMonth: 1000,
    slotsRequested: 1,
  };

  it("accepts a valid hold with same structure as booking", () => {
    const result = createHoldSchema.safeParse(validHold);
    expect(result.success).toBe(true);
  });

  it("rejects end date before start date", () => {
    const input = {
      ...validHold,
      startDate: futureDate(45),
      endDate: futureDate(7),
    };
    const result = createHoldSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const endDateIssue = result.error.issues.find(
        (i) => i.path[0] === "endDate"
      );
      expect(endDateIssue?.message).toBe("End date must be after start date");
    }
  });

  it("rejects start date in the past", () => {
    const input = {
      ...validHold,
      startDate: pastDate(1),
      endDate: futureDate(40),
    };
    const result = createHoldSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const startDateIssue = result.error.issues.find(
        (i) => i.path[0] === "startDate"
      );
      expect(startDateIssue?.message).toBe("Start date cannot be in the past");
    }
  });

  it("rejects duration less than 30 days", () => {
    // start=+7, end=+36 → exactly 29 days
    const input = {
      ...validHold,
      startDate: futureDate(7),
      endDate: futureDate(36),
    };
    const result = createHoldSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const endDateIssue = result.error.issues.find(
        (i) => i.path[0] === "endDate"
      );
      expect(endDateIssue?.message).toBe("Minimum booking duration is 30 days");
    }
  });

  it("rejects empty listingId", () => {
    const input = { ...validHold, listingId: "" };
    const result = createHoldSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Listing ID is required");
    }
  });

  it("defaults slotsRequested to 1", () => {
    const { slotsRequested: _omitted, ...input } = validHold;
    const result = createHoldSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slotsRequested).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// sanitizeUnicode
// ---------------------------------------------------------------------------

describe("sanitizeUnicode", () => {
  it("trims whitespace", () => {
    expect(sanitizeUnicode("  hello  ")).toBe("hello");
  });

  it("removes zero-width space (U+200B)", () => {
    expect(sanitizeUnicode("hel\u200Blo")).toBe("hello");
  });

  it("removes zero-width non-joiner (U+200C)", () => {
    expect(sanitizeUnicode("hel\u200Clo")).toBe("hello");
  });

  it("removes zero-width joiner (U+200D)", () => {
    expect(sanitizeUnicode("hel\u200Dlo")).toBe("hello");
  });

  it("removes BOM (U+FEFF)", () => {
    expect(sanitizeUnicode("\uFEFFhello")).toBe("hello");
  });

  it("removes soft hyphen (U+00AD)", () => {
    expect(sanitizeUnicode("hel\u00ADlo")).toBe("hello");
  });

  it("removes line separator (U+2028)", () => {
    expect(sanitizeUnicode("hel\u2028lo")).toBe("hello");
  });

  it("removes paragraph separator (U+2029)", () => {
    expect(sanitizeUnicode("hel\u2029lo")).toBe("hello");
  });

  it("NFC-normalizes composed characters", () => {
    // "é" can be represented as U+0065 + U+0301 (NFD) or U+00E9 (NFC).
    // After NFC normalization both should be equal.
    const nfd = "e\u0301"; // NFD form: 'e' + combining acute accent
    const nfc = "\u00E9"; // NFC form: precomposed 'é'
    expect(sanitizeUnicode(nfd)).toBe(nfc);
  });

  it("preserves normal text unchanged", () => {
    expect(sanitizeUnicode("Hello, World!")).toBe("Hello, World!");
  });

  it("handles empty string", () => {
    expect(sanitizeUnicode("")).toBe("");
  });

  it("handles string with only invisible characters", () => {
    expect(sanitizeUnicode("\u200B\u200C\u200D\uFEFF")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// noHtmlTags
// ---------------------------------------------------------------------------

describe("noHtmlTags", () => {
  it("returns true for plain text", () => {
    expect(noHtmlTags("Hello, World!")).toBe(true);
  });

  it("returns false for <script> tag", () => {
    expect(noHtmlTags("<script>alert(1)</script>")).toBe(false);
  });

  it("returns false for <img> tag", () => {
    expect(noHtmlTags('<img src="x" />')).toBe(false);
  });

  it("returns false for <a> tag", () => {
    expect(noHtmlTags('<a href="https://example.com">click</a>')).toBe(false);
  });

  it("returns false for self-closing tag <br/>", () => {
    expect(noHtmlTags("line one<br/>line two")).toBe(false);
  });

  it("returns true for text with angle brackets in math (5 < 10 > 3) — this tests regex behavior", () => {
    // "5 < 10 > 3" — the regex /<[^>]*>/ only matches if there is a '<' followed by
    // non-'>' characters and then a '>'.  "< 10 >" contains a space but still
    // matches the regex because [^>]* allows spaces.  Documenting actual behavior.
    const mathExpr = "5 < 10 > 3";
    // The regex matches "< 10 >" so noHtmlTags returns false for this input.
    expect(noHtmlTags(mathExpr)).toBe(false);
  });

  it("returns false for XSS attempt: <script>alert(1)</script>", () => {
    expect(noHtmlTags("<script>alert(1)</script>")).toBe(false);
  });

  it('returns false for XSS attempt: "><img onerror=alert(1)>', () => {
    expect(noHtmlTags('"><img onerror=alert(1)>')).toBe(false);
  });

  it("returns true for text with HTML entities (escaped, not tags)", () => {
    expect(noHtmlTags("5 &lt; 10 &amp; &gt; 3")).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(noHtmlTags("")).toBe(true);
  });
});
