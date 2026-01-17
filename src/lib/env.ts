/**
 * Centralized environment validation using Zod
 * Validates all required and optional environment variables at startup
 * Fails fast if critical variables are missing
 */

import { z } from "zod";

// Schema for server-side environment variables
const serverEnvSchema = z.object({
  // Database (REQUIRED)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Authentication (REQUIRED)
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  // Email (optional - gracefully degrades)
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().optional(),

  // Geocoding (optional - gracefully degrades)
  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Redis Rate Limiting (optional - falls back to DB)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // AI Chat (optional - gracefully degrades)
  GROQ_API_KEY: z.string().optional(),

  // Error Tracking (optional but recommended for production)
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Vercel-specific (auto-populated)
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),

  // Security: Cron authentication (required in production)
  CRON_SECRET: z
    .string()
    .min(32, "CRON_SECRET must be at least 32 characters")
    .optional()
    .refine(
      (val) => !val || !val.includes("change-in-production"),
      "CRON_SECRET must not contain placeholder values",
    )
    .refine(
      (val) => process.env.NODE_ENV !== "production" || !!val,
      "CRON_SECRET is required in production",
    ),

  // Security: Origin enforcement (comma-separated URLs)
  ALLOWED_ORIGINS: z.string().optional(),
  ALLOWED_HOSTS: z.string().optional(),

  // Privacy: Metrics HMAC
  LOG_HMAC_SECRET: z
    .string()
    .min(32, "LOG_HMAC_SECRET must be at least 32 characters")
    .optional(),

  // Google Places (server-side, IP-restricted key)
  GOOGLE_PLACES_API_KEY: z.string().optional(),

  // Supabase service key (server-side)
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Radar API (server-side, for nearby places search)
  RADAR_SECRET_KEY: z.string().optional(),

  // Node environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

// Schema for client-side (public) environment variables
const clientEnvSchema = z.object({
  // Supabase (optional - affects real-time features only)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // Google Maps (optional - affects map features)
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Radar (optional - for nearby places map style)
  NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY: z.string().optional(),

  // Stadia Maps (optional - for premium basemap tiles)
  // Free tier: non-commercial/evaluation only. Production requires paid plan.
  // localhost works without API key. Production: use domain auth or API key.
  NEXT_PUBLIC_STADIA_API_KEY: z.string().optional(),

  // Feature flags
  NEXT_PUBLIC_NEARBY_ENABLED: z.enum(["true", "false"]).optional(),
});

// Type exports for use throughout the application
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Validates server environment variables
 * Call this at startup to fail fast on missing configuration
 */
function validateServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error("Environment validation failed:\n" + errors);

    // In production, fail fast. In development, warn but continue
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Invalid environment configuration. Check logs for details.",
      );
    }
  }

  return result.success ? result.data : (process.env as unknown as ServerEnv);
}

/**
 * Validates client environment variables
 */
function validateClientEnv(): ClientEnv {
  const clientVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY,
    NEXT_PUBLIC_STADIA_API_KEY: process.env.NEXT_PUBLIC_STADIA_API_KEY,
    NEXT_PUBLIC_NEARBY_ENABLED: process.env.NEXT_PUBLIC_NEARBY_ENABLED,
  };

  const result = clientEnvSchema.safeParse(clientVars);

  if (!result.success) {
    console.warn(
      "Client environment validation warnings:",
      result.error.issues,
    );
  }

  return result.success ? result.data : (clientVars as ClientEnv);
}

// Validated environment objects - import these instead of using process.env directly
// Use lazy initialization to avoid validation at module import time (breaks unit tests)
let _serverEnv: ServerEnv | null = null;
let _clientEnv: ClientEnv | null = null;

/**
 * Returns validated server environment, lazily initialized on first call.
 * This prevents env validation from running at module import time,
 * which would cause console.error noise during unit tests.
 */
export function getServerEnv(): ServerEnv {
  if (_serverEnv === null) {
    _serverEnv = validateServerEnv();
  }
  return _serverEnv;
}

/**
 * Returns validated client environment, lazily initialized on first call.
 */
export function getClientEnv(): ClientEnv {
  if (_clientEnv === null) {
    _clientEnv = validateClientEnv();
  }
  return _clientEnv;
}

// Legacy exports for backward compatibility (deprecated - use getServerEnv/getClientEnv)
// These are getters that lazily validate on first access
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get: (_, prop) => getServerEnv()[prop as keyof ServerEnv],
});
export const clientEnv: ClientEnv = new Proxy({} as ClientEnv, {
  get: (_, prop) => getClientEnv()[prop as keyof ClientEnv],
});

// Helper to check if a feature is available
// Uses getters to defer env access to runtime (prevents import-time validation noise)
export const features = {
  get email() {
    const e = getServerEnv();
    return !!e.RESEND_API_KEY;
  },
  get geocoding() {
    const e = getServerEnv();
    return !!e.MAPBOX_ACCESS_TOKEN;
  },
  get redis() {
    const e = getServerEnv();
    return !!(e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN);
  },
  get aiChat() {
    const e = getServerEnv();
    return !!e.GROQ_API_KEY;
  },
  get realtime() {
    const c = getClientEnv();
    return !!(c.NEXT_PUBLIC_SUPABASE_URL && c.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get errorTracking() {
    const e = getServerEnv();
    return !!e.SENTRY_DSN;
  },
  get maps() {
    const c = getClientEnv();
    return !!c.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  },
  // Stadia Maps basemap tiles (optional - falls back to domain auth or works on localhost)
  get stadiaMaps() {
    const c = getClientEnv();
    return !!c.NEXT_PUBLIC_STADIA_API_KEY;
  },
  // Security features
  get cronAuth() {
    const e = getServerEnv();
    return !!e.CRON_SECRET;
  },
  get originEnforcement() {
    const e = getServerEnv();
    return !!(e.ALLOWED_ORIGINS || e.ALLOWED_HOSTS);
  },
  get metricsHmac() {
    const e = getServerEnv();
    return !!e.LOG_HMAC_SECRET;
  },
  get googlePlaces() {
    const e = getServerEnv();
    return !!e.GOOGLE_PLACES_API_KEY;
  },
  get supabaseStorage() {
    const e = getServerEnv();
    return !!e.SUPABASE_SERVICE_ROLE_KEY;
  },
  // Nearby Places (Radar API)
  get nearbyPlaces() {
    const e = getServerEnv();
    const c = getClientEnv();
    return !!(
      e.RADAR_SECRET_KEY &&
      c.NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY &&
      c.NEXT_PUBLIC_NEARBY_ENABLED === "true"
    );
  },
  // Search v2 features (always enabled - no env vars needed for backward compat)
  searchV2: true as const,
  searchKeyset: true as const,
  searchRanking: true as const,
};

// P1-25 FIX: Log startup warnings for missing optional services
// This helps operators understand which features are disabled
if (typeof window === "undefined" && process.env.NODE_ENV === "production") {
  const warnings: string[] = [];

  if (!features.aiChat) {
    warnings.push("GROQ_API_KEY not configured - AI chat feature disabled");
  }
  if (!features.email) {
    warnings.push(
      "RESEND_API_KEY not configured - email notifications disabled",
    );
  }
  if (!features.errorTracking) {
    warnings.push("SENTRY_DSN not configured - error tracking disabled");
  }
  if (!features.redis) {
    warnings.push(
      "Redis not configured - using database-backed rate limiting (slower)",
    );
  }
  if (!features.geocoding) {
    warnings.push("MAPBOX_ACCESS_TOKEN not configured - geocoding disabled");
  }
  if (!features.cronAuth) {
    warnings.push("CRON_SECRET not configured - cron endpoints unprotected");
  }
  if (!features.nearbyPlaces) {
    warnings.push(
      "Radar API not fully configured - nearby places feature disabled",
    );
  }

  if (warnings.length > 0) {
    console.warn(
      "[ENV] Optional services not configured:\n  - " + warnings.join("\n  - "),
    );
  }
}
