// Email templates (client-safe, no 'use server')

// Falls back to the production origin, matching every other NEXT_PUBLIC_APP_URL
// consumer (src/app/layout.tsx:36, sitemap.ts:40, robots.ts:4). A localhost
// fallback here was invisible on every observable surface while silently
// shipping unreachable links to real inboxes.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://roomshare.app";
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

function sanitizeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildAppHref(pathOrUrl: string): string {
  // Callers pass either an app-relative path (most templates) or an already
  // fully-qualified URL — password reset and email verification build theirs from
  // AUTH_URL/NEXTAUTH_URL, which need not equal APP_URL. Prefixing an absolute URL
  // produced `${APP_URL}/https://host/...`, whose pathname is `/https://host/...`,
  // so every reset and verification link 404'd and no user could ever reach
  // emailVerified. Absolute input is therefore passed through as-is.
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return escapeHtml(pathOrUrl);
  }

  // Any other scheme (javascript:, data:, vbscript:, mailto:) is refused rather
  // than prefixed into an href. Nothing passes one today; passing absolute URLs
  // through means that has to be enforced deliberately instead of falling out of
  // the prefixing. A relative path cannot match this: the `/` in `listings/a:b`
  // precedes the colon, so the scheme pattern fails.
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathOrUrl)) {
    return escapeHtml(APP_URL);
  }

  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return escapeHtml(`${APP_URL}${normalizedPath}`);
}

export const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoomShare</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.05);">
          <tr>
            <td style="background:#18181b;padding:32px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:600;">RoomShare</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">${content}</td>
          </tr>
          <tr>
            <td style="background:#fafafa;padding:24px 32px;text-align:center;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#71717a;font-size:12px;">This email was sent by RoomShare. If you have questions, contact us at support@roomshare.com</p>
              <p style="margin:8px 0 0;color:#a1a1aa;font-size:11px;">&copy; ${new Date().getFullYear()} RoomShare. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

function button(label: string, href: string): string {
  return `<a href="${buildAppHref(href)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>`;
}

function simpleTemplate(input: {
  title: string;
  greeting?: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const greeting = input.greeting
    ? `<p style="margin:0 0 24px;color:#52525b;font-size:16px;line-height:1.6;">Hi ${escapeHtml(input.greeting)},</p>`
    : "";
  const cta =
    input.ctaLabel && input.ctaHref
      ? `<p style="margin:24px 0 0;">${button(input.ctaLabel, input.ctaHref)}</p>`
      : "";

  return baseTemplate(`
    <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;">${escapeHtml(input.title)}</h2>
    ${greeting}
    <p style="margin:0;color:#52525b;font-size:16px;line-height:1.6;">${input.body}</p>
    ${cta}
  `);
}

export const emailTemplates = {
  newMessage: (data: {
    recipientName: string;
    senderName: string;
    listingTitle: string;
    messagePreview: string;
    conversationId: string;
  }) => ({
    subject: sanitizeSubject(`New message from ${data.senderName}`),
    html: simpleTemplate({
      title: "New Message",
      greeting: data.recipientName,
      body: `<strong>${escapeHtml(data.senderName)}</strong> sent you a message about <strong>"${escapeHtml(data.listingTitle)}"</strong>:<br><br>${escapeHtml(data.messagePreview)}`,
      ctaLabel: "View Message",
      ctaHref: `/messages/${encodeURIComponent(data.conversationId)}`,
    }),
  }),

  newReview: (data: {
    recipientName: string;
    reviewerName: string;
    rating: number;
    comment: string;
  }) => ({
    subject: sanitizeSubject(`New ${data.rating}-star review from ${data.reviewerName}`),
    html: simpleTemplate({
      title: "New Review",
      greeting: data.recipientName,
      body: `<strong>${escapeHtml(data.reviewerName)}</strong> left you a ${data.rating}-star review:<br><br>${escapeHtml(data.comment)}`,
      ctaLabel: "View Profile",
      ctaHref: "/profile",
    }),
  }),

  listingSaved: (data: {
    hostName: string;
    saverName: string;
    listingTitle: string;
    listingId: string;
  }) => ({
    subject: sanitizeSubject(`${data.saverName} saved your listing`),
    html: simpleTemplate({
      title: "Listing Saved",
      greeting: data.hostName,
      body: `<strong>${escapeHtml(data.saverName)}</strong> saved <strong>"${escapeHtml(data.listingTitle)}"</strong>.`,
      ctaLabel: "View Listing",
      ctaHref: `/listings/${encodeURIComponent(data.listingId)}`,
    }),
  }),

  searchAlert: (data: {
    userName: string;
    searchName: string;
    listingTitle: string;
    listingId?: string;
    ctaHref?: string;
    ctaLabel?: string;
  }) => {
    const ctaHref = data.ctaHref
      ? data.ctaHref
      : data.listingId
        ? `/listings/${encodeURIComponent(data.listingId)}`
        : "/search";

    return {
      subject: sanitizeSubject(`New match for ${data.searchName}`),
      html: simpleTemplate({
        title: "New Saved Search Match",
        greeting: data.userName,
        body: `We found a new match for <strong>${escapeHtml(data.searchName)}</strong>: <strong>"${escapeHtml(data.listingTitle)}"</strong>.`,
        ctaLabel: data.ctaLabel ?? "View Listing",
        ctaHref,
      }),
    };
  },

  listingFreshnessReminder: (data: {
    hostName: string;
    listingTitle: string;
    listingId: string;
  }) => ({
    subject: sanitizeSubject(`Confirm availability for ${data.listingTitle}`),
    html: simpleTemplate({
      title: "Confirm Listing Availability",
      greeting: data.hostName,
      body: `Please confirm that <strong>"${escapeHtml(data.listingTitle)}"</strong> is still available.`,
      ctaLabel: "Update Listing",
      ctaHref: `/listings/${encodeURIComponent(data.listingId)}/edit`,
    }),
  }),

  listingStaleWarning: (data: {
    hostName: string;
    listingTitle: string;
    listingId: string;
  }) => ({
    subject: sanitizeSubject(`Final availability check for ${data.listingTitle}`),
    html: simpleTemplate({
      title: "Listing Availability Warning",
      greeting: data.hostName,
      body: `<strong>"${escapeHtml(data.listingTitle)}"</strong> may be paused soon unless you confirm it is still available.`,
      ctaLabel: "Confirm Availability",
      ctaHref: `/listings/${encodeURIComponent(data.listingId)}/edit`,
    }),
  }),

  listingAutoPaused: (data: {
    hostName: string;
    listingTitle: string;
    listingId: string;
  }) => ({
    subject: sanitizeSubject(`${data.listingTitle} was paused`),
    html: simpleTemplate({
      title: "Listing Paused",
      greeting: data.hostName,
      body: `<strong>"${escapeHtml(data.listingTitle)}"</strong> was paused because its availability was not confirmed.`,
      ctaLabel: "Review Listing",
      ctaHref: `/listings/${encodeURIComponent(data.listingId)}/edit`,
    }),
  }),

  welcomeEmail: (data: { userName: string; verificationUrl?: string }) => ({
    subject: "Welcome to RoomShare!",
    html: simpleTemplate({
      title: "Welcome to RoomShare",
      greeting: data.userName,
      body: "Your account is ready. Verify your email to unlock the full RoomShare experience.",
      ctaLabel: data.verificationUrl ? "Verify Email" : undefined,
      ctaHref: data.verificationUrl ?? undefined,
    }),
  }),

  emailVerification: (data: { userName: string; verificationUrl: string }) => ({
    subject: "Verify your RoomShare email",
    html: simpleTemplate({
      title: "Verify Your Email",
      greeting: data.userName,
      body: "Confirm your email address to finish setting up your account.",
      ctaLabel: "Verify Email",
      ctaHref: data.verificationUrl,
    }),
  }),

  passwordReset: (data: { userName: string; resetLink: string }) => ({
    subject: "Reset your RoomShare password",
    html: simpleTemplate({
      title: "Reset Your Password",
      greeting: data.userName,
      body: "Use the secure link below to reset your password.",
      ctaLabel: "Reset Password",
      ctaHref: data.resetLink,
    }),
  }),

  reviewResponse: (data: {
    reviewerName: string;
    responderName: string;
    response: string;
  }) => ({
    subject: sanitizeSubject(`${data.responderName} responded to your review`),
    html: simpleTemplate({
      title: "Review Response",
      greeting: data.reviewerName,
      body: `<strong>${escapeHtml(data.responderName)}</strong> responded:<br><br>${escapeHtml(data.response)}`,
      ctaLabel: "View Reviews",
      ctaHref: "/profile",
    }),
  }),

  verificationRejected: (data: { userName: string; reason: string }) => ({
    subject: "Verification request update",
    html: simpleTemplate({
      title: "Verification Update",
      greeting: data.userName,
      body: `Your verification could not be approved. Reason: ${escapeHtml(data.reason)}`,
      ctaLabel: "View Verification Status",
      ctaHref: "/verify",
    }),
  }),
};
