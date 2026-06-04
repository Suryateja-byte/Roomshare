/**
 * Shared origin/host enforcement for API routes.
 * Used by: chat, agent, metrics routes.
 */

function getVercelDeploymentHost(): string | null {
  const rawUrl = process.env.VERCEL_URL?.trim();
  if (!rawUrl) return null;

  const withoutProtocol = rawUrl.replace(/^https?:\/\//i, "");
  const host = withoutProtocol.split("/")[0]?.trim();
  return host || null;
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
