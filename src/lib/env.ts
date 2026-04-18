/**
 * Centralized environment validation using Zod
 * Validates all required and optional environment variables at startup
 * Fails fast if critical variables are missing
 */

import { z } from "zod";

// Schema for server-side environment variables
const serverEnvSchema = z
  .object({
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

    // Geocoding uses Photon + Nominatim (free, no API key needed)

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
        (val) =>
          process.env.NODE_ENV !== "production" ||
          !val ||
          !/change-in-production|placeholder|dummy|example|test-secret|YOUR_/i.test(
            val
          ),
        "CRON_SECRET must not contain placeholder values"
      )
      .refine(
        (val) => process.env.NODE_ENV !== "production" || !!val,
        "CRON_SECRET is required in production"
      ),

    // Security: Metrics ops authentication (required in production)
    METRICS_SECRET: z
      .string()
      .min(32, "METRICS_SECRET must be at least 32 characters")
      .optional()
      .refine(
        (val) => process.env.NODE_ENV !== "production" || !!val,
        "METRICS_SECRET is required in production"
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

    // Security: Cursor pagination HMAC (required in production for tamper-proof cursors)
    CURSOR_SECRET: z
      .string()
      .min(32, "CURSOR_SECRET must be at least 32 characters")
      .optional(),

    // Search optimization (optional - defaults to slow LIKE queries if not enabled)
    // CRITICAL: Should be enabled in production for performance
    ENABLE_SEARCH_DOC: z.enum(["true", "false"]).optional(),
    ENABLE_SEARCH_DOC_RESCAN: z.enum(["true", "false"]).optional(),

    // Cloudflare Turnstile (bot protection - required in production)
    TURNSTILE_SECRET_KEY: z.string().optional(),
    TURNSTILE_ENABLED: z.enum(["true", "false"]).optional(),

    // Multi-slot booking feature flags (Phase 0 — all default OFF)
    ENABLE_MULTI_SLOT_BOOKING: z.enum(["true", "false"]).optional(),
    ENABLE_WHOLE_UNIT_MODE: z.enum(["true", "false"]).optional(),
    ENABLE_SOFT_HOLDS: z.enum(["on", "drain", "off"]).optional(),
    ENABLE_BOOKING_AUDIT: z.enum(["true", "false"]).optional(),
    ENABLE_CONTACT_FIRST_LISTINGS: z.enum(["true", "false"]).optional(),
    ENABLE_BOOKINGS_HISTORY_FIRST: z.enum(["true", "false"]).optional(),
    ENABLE_BOOKING_NOTIFICATIONS: z.enum(["on", "off"]).optional(),
    ENABLE_LEGACY_BOOKING_MUTATIONS: z.enum(["on", "off"]).optional(),
    ENABLE_LEGACY_CRONS: z.enum(["on", "off"]).optional(),
    ENABLE_PRIVATE_FEEDBACK: z.enum(["true", "false"]).optional(),
    ENABLE_FRESHNESS_NOTIFICATIONS: z.enum(["on", "off"]).optional(),
    ENABLE_STALE_AUTO_PAUSE: z.enum(["on", "off"]).optional(),
    FEATURE_SEARCH_LISTING_DEDUP: z.enum(["true", "false"]).optional(),
    FEATURE_LISTING_CREATE_COLLISION_WARN: z
      .enum(["true", "false"])
      .optional(),

    // AI / Embeddings
    GEMINI_API_KEY: z.string().min(1).optional(),
    ENABLE_SEMANTIC_SEARCH: z.enum(["true", "false"]).optional(),
    ENABLE_IMAGE_EMBEDDINGS: z.enum(["true", "false"]).optional(),
    ENABLE_CLIENT_SIDE_SEARCH: z.enum(["true", "false"]).optional(),
    ENABLE_SEARCH_TEST_SCENARIOS: z.enum(["true", "false"]).optional(),
    SEMANTIC_WEIGHT: z.coerce.number().min(0).max(1).optional(),

    // Node environment
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  })
  .superRefine((data, ctx) => {
    // Production enforcement: Turnstile must be fully configured
    // Uses superRefine on the object level because Zod's field-level .refine()
    // does not reliably run on optional fields with undefined values.
    if (process.env.NODE_ENV === "production") {
      if (!data.TURNSTILE_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TURNSTILE_SECRET_KEY is required in production",
          path: ["TURNSTILE_SECRET_KEY"],
        });
      }
      if (data.TURNSTILE_ENABLED !== "true") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TURNSTILE_ENABLED must be 'true' in production",
          path: ["TURNSTILE_ENABLED"],
        });
      }
      // Defense-in-depth: the deterministic E2E scenario seam must never
      // be armed in production. `resolveSearchScenario` already gates on
      // this flag, but a misconfigured prod env var would silently expose
      // fake listings to any request carrying `x-e2e-search-scenario`.
      // Fail fast at boot instead.
      if (data.ENABLE_SEARCH_TEST_SCENARIOS === "true") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "ENABLE_SEARCH_TEST_SCENARIOS must not be 'true' in production",
          path: ["ENABLE_SEARCH_TEST_SCENARIOS"],
        });
      }
    }

    // Multi-slot booking feature flag cross-validation
    if (
      data.ENABLE_WHOLE_UNIT_MODE === "true" &&
      data.ENABLE_MULTI_SLOT_BOOKING !== "true"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ENABLE_WHOLE_UNIT_MODE requires ENABLE_MULTI_SLOT_BOOKING=true",
        path: ["ENABLE_WHOLE_UNIT_MODE"],
      });
    }
    if (
      data.ENABLE_BOOKING_AUDIT === "true" &&
      data.ENABLE_SOFT_HOLDS !== "on"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ENABLE_BOOKING_AUDIT requires ENABLE_SOFT_HOLDS=on",
        path: ["ENABLE_BOOKING_AUDIT"],
      });
    }
    if (
      data.ENABLE_STALE_AUTO_PAUSE === "on" &&
      data.ENABLE_FRESHNESS_NOTIFICATIONS !== "on"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ENABLE_STALE_AUTO_PAUSE=on requires ENABLE_FRESHNESS_NOTIFICATIONS=on",
        path: ["ENABLE_STALE_AUTO_PAUSE"],
      });
    }
    if (
      data.ENABLE_SOFT_HOLDS === "on" &&
      data.ENABLE_MULTI_SLOT_BOOKING !== "true"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ENABLE_SOFT_HOLDS=on requires ENABLE_MULTI_SLOT_BOOKING=true",
        path: ["ENABLE_SOFT_HOLDS"],
      });
    }
    if (
      data.ENABLE_IMAGE_EMBEDDINGS === "true" &&
      data.ENABLE_SEMANTIC_SEARCH !== "true"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ENABLE_IMAGE_EMBEDDINGS requires ENABLE_SEMANTIC_SEARCH=true",
        path: ["ENABLE_IMAGE_EMBEDDINGS"],
      });
    }
  });

// Schema for client-side (public) environment variables
const clientEnvSchema = z
  .object({
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
    NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH: z.enum(["true", "false"]).optional(),

    // Cloudflare Turnstile (bot protection - required in production)
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),

    // App URL (used for metadataBase, sitemap, robots, structured data)
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    const hasSupabaseUrl = !!data.NEXT_PUBLIC_SUPABASE_URL;
    const hasSupabaseAnonKey = !!data.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (hasSupabaseUrl !== hasSupabaseAnonKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set or both be omitted",
        path: hasSupabaseUrl
          ? ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
          : ["NEXT_PUBLIC_SUPABASE_URL"],
      });
    }

    if (process.env.NODE_ENV === "production") {
      if (!data.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NEXT_PUBLIC_TURNSTILE_SITE_KEY is required in production",
          path: ["NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
        });
      }
    }
  });

// Type exports for use throughout the application
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Validates server environment variables
 * Call this at startup to fail fast on missing configuration
 */
function validateServerEnv(): ServerEnv {
  // Auth.js v5 accepts AUTH_URL while older code expects NEXTAUTH_URL.
  // Normalize for validation so local dev envs using AUTH_URL don't warn.
  const serverEnvInput = {
    ...process.env,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL,
  };

  const result = serverEnvSchema.safeParse(serverEnvInput);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    // In production, fail fast. In development, warn but continue
    if (process.env.NODE_ENV === "production") {
      console.error("Environment validation failed:\n" + errors);
      throw new Error(
        "Invalid environment configuration. Check logs for details."
      );
    }

    console.warn("Environment validation warnings:\n" + errors);
  }

  return result.success
    ? result.data
    : (serverEnvInput as unknown as ServerEnv);
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
    NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH:
      process.env.NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };

  const result = clientEnvSchema.safeParse(clientVars);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.warn("Client environment validation warnings:\n" + errors);

    // In production, fail fast (same as server env)
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Invalid client environment configuration. Check logs for details."
      );
    }
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

// Lazy getter — avoids throwing at import time during `next build` static generation
let _cursorSecretDevWarned = false;
export function getCursorSecret(): string {
  const secret = process.env.CURSOR_SECRET ?? "";
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[SECURITY] CURSOR_SECRET is required in production — cursor tokens cannot be verified without it"
      );
    }
    if (!_cursorSecretDevWarned) {
      _cursorSecretDevWarned = true;
      console.warn(
        "[DEV] CURSOR_SECRET not set — cursors will not be HMAC-verified"
      );
    }
  }
  return secret;
}
// Backward-compatible export — defers check to first access
export const CURSOR_SECRET = process.env.CURSOR_SECRET ?? "";

export function getOptionalCursorSecret(): string {
  const secret = process.env.CURSOR_SECRET ?? "";
  return hasStrongSecret(secret) ? secret : "";
}

const PLACEHOLDER_SECRET_PATTERN =
  /change-in-production|placeholder|dummy|example|test-secret|YOUR_/i;

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasStrongSecret(value: string | undefined): boolean {
  return (
    hasValue(value) &&
    value.length >= 32 &&
    !PLACEHOLDER_SECRET_PATTERN.test(value)
  );
}

// Helper to check if a feature is available
// Uses direct env reads so unrelated secret validation cannot break public page renders.
export const features = {
  get email() {
    return hasValue(process.env.RESEND_API_KEY);
  },
  get geocoding() {
    // Geocoding is always available (Photon + Nominatim, no API key needed)
    return true;
  },
  get redis() {
    return (
      hasValue(process.env.UPSTASH_REDIS_REST_URL) &&
      hasValue(process.env.UPSTASH_REDIS_REST_TOKEN)
    );
  },
  get aiChat() {
    return hasValue(process.env.GROQ_API_KEY);
  },
  get realtime() {
    return (
      hasValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      hasValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    );
  },
  get errorTracking() {
    return hasValue(process.env.SENTRY_DSN);
  },
  get maps() {
    return hasValue(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  },
  // Stadia Maps basemap tiles (optional - falls back to domain auth or works on localhost)
  get stadiaMaps() {
    return hasValue(process.env.NEXT_PUBLIC_STADIA_API_KEY);
  },
  // Security features
  get cronAuth() {
    return hasStrongSecret(process.env.CRON_SECRET);
  },
  get metricsAuth() {
    return hasStrongSecret(process.env.METRICS_SECRET);
  },
  get originEnforcement() {
    return (
      hasValue(process.env.ALLOWED_ORIGINS) ||
      hasValue(process.env.ALLOWED_HOSTS)
    );
  },
  get metricsHmac() {
    return hasStrongSecret(process.env.LOG_HMAC_SECRET);
  },
  get googlePlaces() {
    return hasValue(process.env.GOOGLE_PLACES_API_KEY);
  },
  get supabaseStorage() {
    return hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  // Nearby Places (Radar API)
  get nearbyPlaces() {
    return !!(
      hasValue(process.env.RADAR_SECRET_KEY) &&
      hasValue(process.env.NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY) &&
      process.env.NEXT_PUBLIC_NEARBY_ENABLED === "true"
    );
  },
  // Search v2 features (always enabled - no env vars needed for backward compat)
  searchV2: true as const,
  get searchKeyset() {
    return hasValue(getOptionalCursorSecret());
  },
  searchRanking: true as const,
  // SearchDoc optimized queries (CRITICAL for production performance)
  get searchDoc() {
    return process.env.ENABLE_SEARCH_DOC === "true";
  },
  get searchDocRescan() {
    if (process.env.ENABLE_SEARCH_DOC_RESCAN) {
      return process.env.ENABLE_SEARCH_DOC_RESCAN === "true";
    }
    if (process.env.SEARCH_DOC_RESCAN_ENABLED) {
      return process.env.SEARCH_DOC_RESCAN_ENABLED === "true";
    }
    return true;
  },
  // Cloudflare Turnstile bot protection
  get turnstile() {
    return (
      process.env.TURNSTILE_ENABLED === "true" &&
      hasValue(process.env.TURNSTILE_SECRET_KEY) &&
      hasValue(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
    );
  },
  // Multi-slot booking feature flags
  get multiSlotBooking() {
    return process.env.ENABLE_MULTI_SLOT_BOOKING === "true";
  },
  get wholeUnitMode() {
    return process.env.ENABLE_WHOLE_UNIT_MODE === "true";
  },
  get softHoldsEnabled() {
    return process.env.ENABLE_SOFT_HOLDS === "on";
  },
  get softHoldsDraining() {
    return process.env.ENABLE_SOFT_HOLDS === "drain";
  },
  get bookingAudit() {
    return process.env.ENABLE_BOOKING_AUDIT === "true";
  },
  get contactFirstListings() {
    return process.env.ENABLE_CONTACT_FIRST_LISTINGS === "true";
  },
  get bookingsHistoryFirst() {
    return process.env.ENABLE_BOOKINGS_HISTORY_FIRST === "true";
  },
  get bookingNotifications() {
    return process.env.ENABLE_BOOKING_NOTIFICATIONS !== "off";
  },
  get legacyBookingMutations() {
    return process.env.ENABLE_LEGACY_BOOKING_MUTATIONS !== "off";
  },
  get legacyCrons() {
    return process.env.ENABLE_LEGACY_CRONS !== "off";
  },
  get privateFeedback() {
    return process.env.ENABLE_PRIVATE_FEEDBACK === "true";
  },
  get freshnessNotifications() {
    return process.env.ENABLE_FRESHNESS_NOTIFICATIONS === "on";
  },
  get staleAutoPause() {
    return process.env.ENABLE_STALE_AUTO_PAUSE === "on";
  },
  get searchListingDedup() {
    return process.env.FEATURE_SEARCH_LISTING_DEDUP === "true";
  },
  get listingCreateCollisionWarn() {
    return process.env.FEATURE_LISTING_CREATE_COLLISION_WARN === "true";
  },
  // Search debug ranking (only allowed in non-production, or with explicit env override)
  // This gates ?debugRank=1 and ?ranker=1 URL overrides to prevent leaking debug signals
  get searchDebugRanking() {
    // Allow debug in non-production environments
    if (process.env.NODE_ENV !== "production") return true;
    // In production, require explicit env flag (for staging/preview debugging)
    return process.env.SEARCH_DEBUG_RANKING === "true";
  },
  get clientSideSearch() {
    return process.env.ENABLE_CLIENT_SIDE_SEARCH === "true";
  },
  get semanticSearch() {
    return process.env.ENABLE_SEMANTIC_SEARCH === "true";
  },
  get imageEmbeddings() {
    return (
      process.env.ENABLE_IMAGE_EMBEDDINGS === "true" && features.semanticSearch
    );
  },
  get semanticWeight(): number {
    const val = Number(process.env.SEMANTIC_WEIGHT);
    return Number.isFinite(val) && val >= 0 && val <= 1 ? val : 0.6;
  },
};

// P1-25 FIX: Log startup warnings for missing optional services
// This helps operators understand which features are disabled
// Wrapped in a function to prevent execution during Next.js build phase
let _startupWarningsLogged = false;
export function logStartupWarnings(): void {
  if (_startupWarningsLogged) return;
  if (typeof window !== "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  // Skip during Next.js build phase (NEXT_PHASE is set during builds)
  if (process.env.NEXT_PHASE) return;

  _startupWarningsLogged = true;
  const warnings: string[] = [];

  if (!features.aiChat) {
    warnings.push("GROQ_API_KEY not configured - AI chat feature disabled");
  }
  if (!features.email) {
    warnings.push(
      "RESEND_API_KEY not configured - email notifications disabled"
    );
  }
  if (!features.errorTracking) {
    warnings.push("SENTRY_DSN not configured - error tracking disabled");
  }
  if (!features.redis) {
    warnings.push(
      "Redis not configured - using database-backed rate limiting (slower)"
    );
  }
  if (!features.cronAuth) {
    warnings.push("CRON_SECRET not configured - cron endpoints unprotected");
  }
  if (!features.metricsAuth) {
    warnings.push(
      "METRICS_SECRET not configured - /api/metrics/ops endpoint returns 401"
    );
  }
  if (!features.nearbyPlaces) {
    warnings.push(
      "Radar API not fully configured - nearby places feature disabled"
    );
  }
  if (!features.searchDoc) {
    warnings.push(
      "ENABLE_SEARCH_DOC not enabled - using slow LIKE queries for text search (CRITICAL: enable for production)"
    );
  }
  if (!features.turnstile) {
    warnings.push(
      "Turnstile not configured - auth forms have no bot protection"
    );
  }
  if (features.semanticSearch && !process.env.GEMINI_API_KEY) {
    warnings.push(
      "GEMINI_API_KEY not set - semantic search enabled but unavailable"
    );
  }

  if (warnings.length > 0) {
    console.warn(
      "[ENV] Optional services not configured:\n  - " + warnings.join("\n  - ")
    );
  }
}
