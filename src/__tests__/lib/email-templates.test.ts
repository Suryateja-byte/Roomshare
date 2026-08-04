/**
 * @jest-environment node
 *
 * Rendering tests for the transactional email templates (P0-R2 regression).
 *
 * The defect: `buildAppHref` unconditionally prefixed APP_URL onto whatever it
 * was handed and only ever inserted a slash, so the three templates that carry a
 * fully-qualified URL — passwordReset, emailVerification, welcomeEmail — emitted
 *
 *   https://roomshare.app/https://roomshare.app/reset-password?token=…
 *
 * (pathname `/https://roomshare.app/reset-password`). Every password-reset and
 * email-verification link 404'd, and because `emailVerified` hard-gates
 * startConversation / reviews / reports, no credentials user could ever reach the
 * core product.
 *
 * It survived because no test in the repo had ever rendered an email:
 * src/__tests__/lib/email.test.ts covers only transport (retry, circuit breaker,
 * dev-mode short-circuit), and both auth e2e specs read the token out of the
 * dev-mode JSON response rather than traversing the rendered link.
 *
 * Every absolute-URL assertion below is paired with a relative-path positive
 * control, per tasks/lessons.md (2026-08-03): an assertion that only ever checks
 * absence, or that never runs, proves nothing.
 */

const APP_URL = "https://roomshare.test";
/** A deliberately different origin — routes build their URLs from AUTH_URL /
 *  NEXTAUTH_URL, which need not equal NEXT_PUBLIC_APP_URL. */
const AUTH_ORIGIN = "https://auth.roomshare.test";

type EmailTemplates = typeof import("@/lib/email-templates").emailTemplates;
let emailTemplates: EmailTemplates;

beforeAll(async () => {
  // APP_URL is captured at module load, so the env has to be set before import.
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
  jest.resetModules();
  ({ emailTemplates } = await import("@/lib/email-templates"));
});

/** The href of the template's CTA button, still HTML-attribute-escaped. */
function hrefOf(html: string): string | null {
  const match = html.match(/<a href="([^"]*)"/);
  return match ? match[1] : null;
}

/** Reverse escapeHtml so a raw URL can be compared to what shipped in the href. */
function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

describe("email templates — absolute CTA URLs (P0-R2)", () => {
  it("passwordReset emits the reset link unchanged, not prefixed with APP_URL", () => {
    const resetLink = `${AUTH_ORIGIN}/reset-password?token=abc123`;

    const href = hrefOf(
      emailTemplates.passwordReset({ userName: "Ada", resetLink }).html
    );

    expect(href).toBe(resetLink);
    // The exact shape of the bug: origin repeated, real path pushed into a segment.
    expect(href).not.toContain(`${APP_URL}${AUTH_ORIGIN}`);
    expect(new URL(unescapeHtml(href!)).pathname).toBe("/reset-password");
  });

  it("emailVerification emits the verification link unchanged", () => {
    const verificationUrl = `${AUTH_ORIGIN}/verify-email?token=xyz789`;

    const href = hrefOf(
      emailTemplates.emailVerification({ userName: "Ada", verificationUrl })
        .html
    );

    expect(href).toBe(verificationUrl);
    expect(new URL(unescapeHtml(href!)).pathname).toBe("/verify-email");
  });

  it("welcomeEmail emits the verification link unchanged", () => {
    const verificationUrl = `${AUTH_ORIGIN}/verify-email?token=welcome1`;

    const href = hrefOf(
      emailTemplates.welcomeEmail({ userName: "Ada", verificationUrl }).html
    );

    expect(href).toBe(verificationUrl);
    expect(new URL(unescapeHtml(href!)).pathname).toBe("/verify-email");
  });

  it("passes an absolute URL through even when it matches APP_URL's own origin", () => {
    const resetLink = `${APP_URL}/reset-password?token=same-origin`;

    const href = hrefOf(
      emailTemplates.passwordReset({ userName: "Ada", resetLink }).html
    );

    expect(href).toBe(resetLink);
    // Guards the precise regression: APP_URL must appear once, never twice.
    expect(href!.split(APP_URL).length - 1).toBe(1);
  });

  it("keeps multi-parameter query strings intact, HTML-escaping only the separator", () => {
    const resetLink = `${AUTH_ORIGIN}/reset-password?token=abc&source=email`;

    const href = hrefOf(
      emailTemplates.passwordReset({ userName: "Ada", resetLink }).html
    );

    expect(href).toBe(`${AUTH_ORIGIN}/reset-password?token=abc&amp;source=email`);
    expect(unescapeHtml(href!)).toBe(resetLink);
    const parsed = new URL(unescapeHtml(href!));
    expect(parsed.searchParams.get("token")).toBe("abc");
    expect(parsed.searchParams.get("source")).toBe("email");
  });
});

describe("email templates — relative CTA paths still resolve against APP_URL", () => {
  // Positive controls. These nine templates were correct before the fix and must
  // stay byte-identical; without them, the assertions above could pass for a
  // reason unrelated to absolute-URL handling.
  const cases: Array<[string, () => string, string]> = [
    [
      "newMessage",
      () =>
        emailTemplates.newMessage({
          recipientName: "Ada",
          senderName: "Grace",
          listingTitle: "Sunny room",
          messagePreview: "Hi!",
          conversationId: "conv-1",
        }).html,
      "/messages/conv-1",
    ],
    [
      "newReview",
      () =>
        emailTemplates.newReview({
          recipientName: "Ada",
          reviewerName: "Grace",
          rating: 5,
          comment: "Great host",
        }).html,
      "/profile",
    ],
    [
      "listingSaved",
      () =>
        emailTemplates.listingSaved({
          hostName: "Ada",
          saverName: "Grace",
          listingTitle: "Sunny room",
          listingId: "listing-1",
        }).html,
      "/listings/listing-1",
    ],
    [
      "searchAlert (explicit relative ctaHref)",
      () =>
        emailTemplates.searchAlert({
          userName: "Ada",
          searchName: "Austin 2BR",
          listingTitle: "Sunny room",
          ctaHref: "/listings/listing-2",
        }).html,
      "/listings/listing-2",
    ],
    [
      "searchAlert (derived from listingId)",
      () =>
        emailTemplates.searchAlert({
          userName: "Ada",
          searchName: "Austin 2BR",
          listingTitle: "Sunny room",
          listingId: "listing-3",
        }).html,
      "/listings/listing-3",
    ],
    [
      "searchAlert (no target)",
      () =>
        emailTemplates.searchAlert({
          userName: "Ada",
          searchName: "Austin 2BR",
          listingTitle: "2 matching listings",
        }).html,
      "/search",
    ],
    [
      "listingFreshnessReminder",
      () =>
        emailTemplates.listingFreshnessReminder({
          hostName: "Ada",
          listingTitle: "Sunny room",
          listingId: "listing-4",
        }).html,
      "/listings/listing-4/edit",
    ],
    [
      "listingStaleWarning",
      () =>
        emailTemplates.listingStaleWarning({
          hostName: "Ada",
          listingTitle: "Sunny room",
          listingId: "listing-5",
        }).html,
      "/listings/listing-5/edit",
    ],
    [
      "listingAutoPaused",
      () =>
        emailTemplates.listingAutoPaused({
          hostName: "Ada",
          listingTitle: "Sunny room",
          listingId: "listing-6",
        }).html,
      "/listings/listing-6/edit",
    ],
    [
      "reviewResponse",
      () =>
        emailTemplates.reviewResponse({
          reviewerName: "Ada",
          responderName: "Grace",
          response: "Thanks!",
        }).html,
      "/profile",
    ],
    [
      "verificationRejected",
      () =>
        emailTemplates.verificationRejected({
          userName: "Ada",
          reason: "Document unreadable",
        }).html,
      "/verify",
    ],
  ];

  it.each(cases)("%s resolves to APP_URL + path", (_name, render, path) => {
    expect(hrefOf(render())).toBe(`${APP_URL}${path}`);
  });
});

describe("email templates — scheme safety", () => {
  // Before the fix a dangerous scheme was neutralised only as a side effect of
  // being prefixed into a path. Passing absolute URLs through means the scheme
  // now has to be rejected deliberately.
  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
    ["vbscript:", "vbscript:msgbox(1)"],
  ])("never emits a %s href", (_label, hostile) => {
    const href = hrefOf(
      emailTemplates.searchAlert({
        userName: "Ada",
        searchName: "Austin 2BR",
        listingTitle: "Sunny room",
        ctaHref: hostile,
      }).html
    );

    expect(href).toBe(APP_URL);
    expect(href!.toLowerCase()).not.toContain("javascript:");
    expect(href!.toLowerCase()).not.toContain("data:");
    expect(href!.toLowerCase()).not.toContain("vbscript:");
  });

  it("treats a protocol-relative path as a path, not an origin", () => {
    const href = hrefOf(
      emailTemplates.searchAlert({
        userName: "Ada",
        searchName: "Austin 2BR",
        listingTitle: "Sunny room",
        ctaHref: "//evil.example.com/phish",
      }).html
    );

    expect(href).toBe(`${APP_URL}//evil.example.com/phish`);
    expect(href!.startsWith(APP_URL)).toBe(true);
  });
});

describe("email templates — CTA omitted", () => {
  it("welcomeEmail renders no button when no verificationUrl is supplied", () => {
    // src/app/actions/verification.ts:533 calls welcomeEmail without one.
    const html = emailTemplates.welcomeEmail({ userName: "Ada" }).html;

    expect(hrefOf(html)).toBeNull();
    expect(html).not.toContain("Verify Email");
  });
});
