/**
 * Extended booking-focused tests for emailTemplates.
 *
 * Covers: bookingRequest date range rendering, bookingAccepted booking details,
 * bookingRejected with/without rejection reason, bookingHoldRequest hold info,
 * and HTML structure / subject sanitization.
 */

import { emailTemplates } from "@/lib/email-templates";

describe("emailTemplates — booking templates", () => {
  describe("bookingRequest", () => {
    const baseData = {
      hostName: "Alice Host",
      tenantName: "Bob Tenant",
      listingTitle: "Downtown Loft",
      startDate: "January 1, 2025",
      endDate: "June 30, 2025",
      listingId: "listing-abc",
    };

    it("includes greeting with host name", () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.html).toContain("Hi Alice Host");
    });

    it("includes tenant name in body", () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.html).toContain("Bob Tenant");
    });

    it("includes listing title in body", () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.html).toContain("Downtown Loft");
    });

    it("includes start date in the requested dates block", () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.html).toContain("January 1, 2025");
    });

    it("includes end date in the requested dates block", () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.html).toContain("June 30, 2025");
    });

    it('sets subject to "New booking request for <title>"', () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.subject).toBe("New booking request for Downtown Loft");
    });

    it("includes a link to /bookings", () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.html).toContain("/bookings");
    });

    it("produces a complete HTML document", () => {
      const result = emailTemplates.bookingRequest(baseData);

      expect(result.html).toContain("<!DOCTYPE html>");
      expect(result.html).toContain("</html>");
    });

    it("works for a single-day booking (same start and end date)", () => {
      const data = {
        ...baseData,
        startDate: "March 15, 2025",
        endDate: "March 15, 2025",
      };
      const result = emailTemplates.bookingRequest(data);

      // Both occurrences point to the same date — just assert it appears
      expect(result.html).toContain("March 15, 2025");
      expect(result.subject).toBe("New booking request for Downtown Loft");
    });

    it("strips newlines from listing title in subject", () => {
      const data = { ...baseData, listingTitle: "Cozy\nRoom" };
      const result = emailTemplates.bookingRequest(data);

      expect(result.subject).not.toMatch(/\n/);
    });

    it("escapes HTML entities in host name", () => {
      const data = { ...baseData, hostName: "<script>alert(1)</script>" };
      const result = emailTemplates.bookingRequest(data);

      expect(result.html).not.toContain("<script>alert(1)</script>");
      expect(result.html).toContain("&lt;script&gt;");
    });

    it("escapes HTML entities in tenant name", () => {
      const data = { ...baseData, tenantName: "<img src=x onerror=alert(1)>" };
      const result = emailTemplates.bookingRequest(data);

      expect(result.html).not.toContain("<img src=x");
      expect(result.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });

    it("escapes HTML entities in start date", () => {
      const data = { ...baseData, startDate: "<svg/onload=alert(1)>" };
      const result = emailTemplates.bookingRequest(data);

      expect(result.html).not.toContain("<svg/onload=alert(1)>");
      expect(result.html).toContain("&lt;svg/onload=alert(1)&gt;");
    });
  });

  describe("bookingAccepted", () => {
    const baseData = {
      tenantName: "Carol Tenant",
      listingTitle: "Garden Apartment",
      hostName: "Dave Host",
      startDate: "April 1, 2025",
      listingId: "listing-def",
    };

    it("greets the tenant by name", () => {
      const result = emailTemplates.bookingAccepted(baseData);

      expect(result.html).toContain("Hi Carol Tenant");
    });

    it("includes the host name who accepted", () => {
      const result = emailTemplates.bookingAccepted(baseData);

      expect(result.html).toContain("Dave Host");
    });

    it("includes the listing title", () => {
      const result = emailTemplates.bookingAccepted(baseData);

      expect(result.html).toContain("Garden Apartment");
    });

    it("includes the move-in start date", () => {
      const result = emailTemplates.bookingAccepted(baseData);

      expect(result.html).toContain("April 1, 2025");
    });

    it("sets subject confirming the listing title", () => {
      const result = emailTemplates.bookingAccepted(baseData);

      expect(result.subject).toBe(
        "Your booking for Garden Apartment has been accepted!"
      );
    });

    it("includes a link to /bookings", () => {
      const result = emailTemplates.bookingAccepted(baseData);

      expect(result.html).toContain("/bookings");
    });

    it('contains "Booking Confirmed" heading', () => {
      const result = emailTemplates.bookingAccepted(baseData);

      expect(result.html).toContain("Booking Confirmed");
    });

    it("escapes HTML in tenant name", () => {
      const data = { ...baseData, tenantName: "<b>Injected</b>" };
      const result = emailTemplates.bookingAccepted(data);

      expect(result.html).not.toContain("<b>Injected</b>");
      expect(result.html).toContain("&lt;b&gt;Injected&lt;/b&gt;");
    });
  });

  describe("bookingRejected", () => {
    const baseData = {
      tenantName: "Eve Tenant",
      listingTitle: "Sunny Studio",
      hostName: "Frank Host",
    };

    it("greets the tenant by name", () => {
      const result = emailTemplates.bookingRejected(baseData);

      expect(result.html).toContain("Hi Eve Tenant");
    });

    it("mentions the host who rejected", () => {
      const result = emailTemplates.bookingRejected(baseData);

      expect(result.html).toContain("Frank Host");
    });

    it("mentions the listing title", () => {
      const result = emailTemplates.bookingRejected(baseData);

      expect(result.html).toContain("Sunny Studio");
    });

    it("sets subject as an update on the booking request", () => {
      const result = emailTemplates.bookingRejected(baseData);

      expect(result.subject).toBe(
        "Update on your booking request for Sunny Studio"
      );
    });

    it("does NOT include rejection reason block when reason is omitted", () => {
      const result = emailTemplates.bookingRejected(baseData);

      expect(result.html).not.toContain("Reason from host:");
    });

    it("includes rejection reason block when reason is provided", () => {
      const data = {
        ...baseData,
        rejectionReason: "Already booked for those dates.",
      };
      const result = emailTemplates.bookingRejected(data);

      expect(result.html).toContain("Reason from host:");
      expect(result.html).toContain("Already booked for those dates.");
    });

    it("escapes HTML entities in the rejection reason", () => {
      const data = {
        ...baseData,
        rejectionReason: '<script>alert("xss")</script>',
      };
      const result = emailTemplates.bookingRejected(data);

      expect(result.html).not.toContain("<script>");
      expect(result.html).toContain("&lt;script&gt;");
    });

    it("encourages the tenant to browse more listings", () => {
      const result = emailTemplates.bookingRejected(baseData);

      expect(result.html).toContain("/search");
    });

    it("includes a link to browse listings", () => {
      const result = emailTemplates.bookingRejected(baseData);

      expect(result.html).toContain("Browse More Listings");
    });
  });

  describe("bookingHoldRequest", () => {
    const baseData = {
      hostName: "Grace Host",
      tenantName: "Henry Tenant",
      listingTitle: "Private Room",
      holdExpiresAt: "March 20, 2025",
    };

    it("greets the host by name", () => {
      const result = emailTemplates.bookingHoldRequest(baseData);

      expect(result.html).toContain("Hi Grace Host");
    });

    it("includes the tenant name who placed the hold", () => {
      const result = emailTemplates.bookingHoldRequest(baseData);

      expect(result.html).toContain("Henry Tenant");
    });

    it("includes the listing title", () => {
      const result = emailTemplates.bookingHoldRequest(baseData);

      expect(result.html).toContain("Private Room");
    });

    it("includes the hold expiry date", () => {
      const result = emailTemplates.bookingHoldRequest(baseData);

      expect(result.html).toContain("March 20, 2025");
    });

    it("sets subject referencing the listing title", () => {
      const result = emailTemplates.bookingHoldRequest(baseData);

      expect(result.subject).toContain("Private Room");
      expect(result.subject).toContain("hold");
    });

    it("includes a link to /bookings", () => {
      const result = emailTemplates.bookingHoldRequest(baseData);

      expect(result.html).toContain("/bookings");
    });

    it("produces a complete HTML document", () => {
      const result = emailTemplates.bookingHoldRequest(baseData);

      expect(result.html).toContain("<!DOCTYPE html>");
    });

    it("escapes HTML entities in host name", () => {
      const data = { ...baseData, hostName: "<img src=x onerror=alert(1)>" };
      const result = emailTemplates.bookingHoldRequest(data);

      expect(result.html).not.toContain("<img src=x");
      expect(result.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });

    it("escapes HTML entities in tenant name", () => {
      const data = { ...baseData, tenantName: "<script>steal()</script>" };
      const result = emailTemplates.bookingHoldRequest(data);

      expect(result.html).not.toContain("<script>");
      expect(result.html).toContain("&lt;script&gt;");
    });

    it("escapes HTML entities in listing title", () => {
      const data = { ...baseData, listingTitle: 'Room "A" & <Suite>' };
      const result = emailTemplates.bookingHoldRequest(data);

      expect(result.html).toContain("&quot;A&quot;");
      expect(result.html).toContain("&amp;");
      expect(result.html).toContain("&lt;Suite&gt;");
    });
  });
});
