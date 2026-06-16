/**
 * Shared origin/host enforcement for API routes.
 * Used by: chat, agent, metrics routes.
 */

function normalizeHost(rawUrl: string | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const host = withoutProtocol.split("/")[0]?.trim();
  return host || null;
}

function getVercelDeploymentHost(): string | null {
  // Per-deployment URL (e.g. my-app-abc123.vercel.app) — NOT the user-facing domain.
  return normalizeHost(process.env.VERCEL_URL);
}

function getVercelProductionHost(): string | null {
  // The production/custom-domain URL. Unlike VERCEL_URL, this matches the domain
  // users actually visit, so same-site requests are trusted without ALLOWED_ORIGINS.
  return normalizeHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);
}

export function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || "";
  const parsed = origins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const vercelHost = getVercelDeploymentHost();
  if (vercelHost) {
    parsed.push(`https://${vercelHost}`);
  }
  const prodHost = getVercelProductionHost();
  if (prodHost) {
    parsed.push(`https://${prodHost}`);
  }
  if (process.env.NODE_ENV === "development") {
    parsed.push("http://localhost:3000");
  }
  return parsed;
}

export function getAllowedHosts(): string[] {
  const hosts = process.env.ALLOWED_HOSTS || "";
  const parsed = hosts
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const vercelHost = getVercelDeploymentHost();
  if (vercelHost) {
    parsed.push(vercelHost);
  }
  const prodHost = getVercelProductionHost();
  if (prodHost) {
    parsed.push(prodHost);
  }
  if (process.env.NODE_ENV === "development") {
    parsed.push("localhost:3000", "localhost");
  }
  return parsed;
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return getAllowedOrigins().includes(origin);
}

export function isHostAllowed(host: string | null): boolean {
  if (!host) return false;
  const allowed = getAllowedHosts();
  const hostWithoutPort = host.split(":")[0];
  return allowed.some((h) => h === host || h === hostWithoutPort);
}

/**
 * Same-origin check (CSRF-safe). A first-party browser request carries an
 * `Origin` header whose host equals the request's own `Host` header. This holds
 * on any domain — production, custom domains, preview deployments, and local
 * production builds — without needing ALLOWED_ORIGINS configured. Cross-origin
 * browser requests carry a foreign origin and are not matched here.
 */
export function isSameOrigin(
  origin: string | null,
  host: string | null
): boolean {
  if (!origin || !host) return false;
  try {
    // URL.host includes the port (when non-default), matching the Host header.
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
