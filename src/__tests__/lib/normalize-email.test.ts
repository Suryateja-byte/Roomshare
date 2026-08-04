/**
 * Tests for normalize-email utility
 * Validates consistent email normalization for lookups and deduplication
 */

import { z } from "zod";
import { normalizeEmail } from "@/lib/normalize-email";

describe("normalizeEmail", () => {
  describe("lowercase conversion", () => {
    it("converts uppercase email to lowercase", () => {
      expect(normalizeEmail("USER@EXAMPLE.COM")).toBe("user@example.com");
    });

    it("converts mixed-case email to lowercase", () => {
      expect(normalizeEmail("John.Doe@Gmail.Com")).toBe("john.doe@gmail.com");
    });

    it("leaves already-lowercase email unchanged", () => {
      expect(normalizeEmail("user@example.com")).toBe("user@example.com");
    });
  });

  describe("trimming", () => {
    it("trims leading whitespace", () => {
      expect(normalizeEmail("  user@example.com")).toBe("user@example.com");
    });

    it("trims trailing whitespace", () => {
      expect(normalizeEmail("user@example.com  ")).toBe("user@example.com");
    });

    it("trims leading and trailing whitespace", () => {
      expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
    });

    it("trims tabs and newlines", () => {
      expect(normalizeEmail("\tuser@example.com\n")).toBe("user@example.com");
    });
  });

  describe("combined normalization", () => {
    it("lowercases and trims simultaneously", () => {
      expect(normalizeEmail("  USER@EXAMPLE.COM  ")).toBe("user@example.com");
    });
  });

  describe("special characters in email", () => {
    it("preserves dots in local part", () => {
      expect(normalizeEmail("first.last@example.com")).toBe(
        "first.last@example.com"
      );
    });

    it("preserves plus alias in local part", () => {
      expect(normalizeEmail("user+tag@example.com")).toBe(
        "user+tag@example.com"
      );
    });

    it("preserves hyphens in domain", () => {
      expect(normalizeEmail("user@my-domain.com")).toBe("user@my-domain.com");
    });

    it("preserves underscores in local part", () => {
      expect(normalizeEmail("user_name@example.com")).toBe(
        "user_name@example.com"
      );
    });

    it("preserves subdomains", () => {
      expect(normalizeEmail("user@mail.example.co.uk")).toBe(
        "user@mail.example.co.uk"
      );
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(normalizeEmail("")).toBe("");
    });

    it("handles whitespace-only string", () => {
      expect(normalizeEmail("   ")).toBe("");
    });

    it("handles string without @ symbol", () => {
      // normalizeEmail does not validate format, it just normalizes
      expect(normalizeEmail("NOT-AN-EMAIL")).toBe("not-an-email");
    });

    it("handles email with multiple @ symbols", () => {
      // The function does lowercasing/trimming, not validation
      expect(normalizeEmail("user@@example.com")).toBe("user@@example.com");
    });

    it("handles single character email parts", () => {
      expect(normalizeEmail("A@B.CO")).toBe("a@b.co");
    });

    it("handles very long email", () => {
      const longLocal = "a".repeat(64);
      const longDomain = "b".repeat(63) + ".com";
      const longEmail = `${longLocal}@${longDomain}`;
      expect(normalizeEmail(longEmail)).toBe(longEmail.toLowerCase());
    });
  });

  /**
   * GHSA-7rqj-j65f-68wh — "Email normalizer validates the address before Unicode
   * normalization, allowing a homoglyph @ bypass" (patched in @auth/core 0.41.3).
   *
   * DO NOT "fix" this by adding .normalize("NFKC") to normalizeEmail(). It looks
   * like the obvious hardening and it is actively harmful here:
   *
   * 1. The advisory is in Auth.js's Email/Nodemailer provider normalizer. This app
   *    configures only Google + Credentials (src/auth.ts) — no Email provider — so
   *    there is no live path to remediate. The dependency bump closes it fully.
   *
   * 2. normalizeEmail() is the identity key for login (src/auth.ts), the suspension
   *    lookup, password reset, and registration uniqueness. Every stored row was
   *    written under toLowerCase().trim(). Adding NFKC silently re-keys all of them:
   *    any address whose NFKC form differs stops matching on login AND on password
   *    reset, while /api/register would see it as unclaimed and create a SECOND row
   *    (different bytes, so the unique index does not stop it). That is a
   *    duplicate-identity hazard in the exact path we are trying to secure. Doing it
   *    safely needs a backfill migration with a collision policy — not a one-liner.
   *
   * 3. The attack is already blocked upstream of this function: every caller runs
   *    zod's .email() first (src/app/api/register/route.ts, the Credentials
   *    authorize schema in src/auth.ts), and zod v4 rejects homoglyph variants
   *    outright — verified by the cases below.
   *
   * These tests pin the no-NFKC behavior so the reasoning above is not silently
   * undone by someone reading only the advisory title.
   */
  describe("does NOT apply Unicode NFKC normalization (GHSA-7rqj-j65f-68wh)", () => {
    it("leaves a fullwidth @ (U+FF20) distinct from ASCII @", () => {
      const homoglyph = "user＠example.com";

      // Sanity check: NFKC really would collapse this onto a real address.
      expect(homoglyph.normalize("NFKC")).toBe("user@example.com");

      // But normalizeEmail must not, or the two become the same identity key.
      expect(normalizeEmail(homoglyph)).toBe(homoglyph.toLowerCase());
      expect(normalizeEmail(homoglyph)).not.toBe("user@example.com");
    });

    it("leaves fullwidth local-part characters distinct from ASCII", () => {
      const homoglyph = "ｕｓｅｒ@example.com";

      expect(homoglyph.normalize("NFKC")).toBe("user@example.com");
      expect(normalizeEmail(homoglyph)).not.toBe("user@example.com");
    });

    it("leaves an ﬁ ligature (U+FB01) distinct from the ASCII spelling", () => {
      const ligature = "ﬁrst@example.com";

      expect(ligature.normalize("NFKC")).toBe("first@example.com");
      expect(normalizeEmail(ligature)).not.toBe("first@example.com");
    });

    /**
     * The reason skipping NFKC is safe: no homoglyph ever reaches normalizeEmail(),
     * because every caller validates with zod's .email() first. If a future zod
     * release loosens that, this test fails and the decision above must be
     * revisited (with a backfill), rather than silently becoming wrong.
     */
    it("is protected upstream: zod .email() rejects homoglyph addresses", () => {
      const schema = z.string().email();

      for (const homoglyph of [
        "user＠example.com", // U+FF20 fullwidth commercial at
        "ｕｓｅｒ@example.com", // fullwidth local part
        "ﬁrst@example.com", // U+FB01 ligature
        "user@exаmple.com", // U+0430 Cyrillic a in the domain
      ]) {
        expect(schema.safeParse(homoglyph).success).toBe(false);
      }

      expect(schema.safeParse("user@example.com").success).toBe(true);
    });
  });
});
