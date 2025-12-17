/**
 * Centralized environment validation using Zod
 * Validates all required and optional environment variables at startup
 * Fails fast if critical variables are missing
 */

import { z } from 'zod';

// Schema for server-side environment variables
const serverEnvSchema = z.object({
  // Database (REQUIRED)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Authentication (REQUIRED)
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),

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
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),

  // Security: Cron authentication (required in production)
  CRON_SECRET: z.string()
    .min(32, 'CRON_SECRET must be at least 32 characters')
    .optional()
    .refine(
      (val) => !val || !val.includes('change-in-production'),
      'CRON_SECRET must not contain placeholder values'
    ),

  // Security: Origin enforcement (comma-separated URLs)
  ALLOWED_ORIGINS: z.string().optional(),
  ALLOWED_HOSTS: z.string().optional(),

  // Privacy: Metrics HMAC
  LOG_HMAC_SECRET: z.string().min(32, 'LOG_HMAC_SECRET must be at least 32 characters').optional(),

  // Google Places (server-side, IP-restricted key)
  GOOGLE_PLACES_API_KEY: z.string().optional(),

  // Supabase service key (server-side)
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Schema for client-side (public) environment variables
const clientEnvSchema = z.object({
  // Supabase (optional - affects real-time features only)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // Google Maps (optional - affects map features)
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
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
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error('Environment validation failed:\n' + errors);

    // In production, fail fast. In development, warn but continue
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid environment configuration. Check logs for details.');
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
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  };

  const result = clientEnvSchema.safeParse(clientVars);

  if (!result.success) {
    console.warn('Client environment validation warnings:', result.error.issues);
  }

  return result.success ? result.data : (clientVars as ClientEnv);
}

// Validated environment objects - import these instead of using process.env directly
export const serverEnv = validateServerEnv();
export const clientEnv = validateClientEnv();

// Helper to check if a feature is available
export const features = {
  email: !!serverEnv.RESEND_API_KEY,
  geocoding: !!serverEnv.MAPBOX_ACCESS_TOKEN,
  redis: !!(serverEnv.UPSTASH_REDIS_REST_URL && serverEnv.UPSTASH_REDIS_REST_TOKEN),
  aiChat: !!serverEnv.GROQ_API_KEY,
  realtime: !!(clientEnv.NEXT_PUBLIC_SUPABASE_URL && clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  errorTracking: !!serverEnv.SENTRY_DSN,
  maps: !!clientEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  // Security features
  cronAuth: !!serverEnv.CRON_SECRET,
  originEnforcement: !!(serverEnv.ALLOWED_ORIGINS || serverEnv.ALLOWED_HOSTS),
  metricsHmac: !!serverEnv.LOG_HMAC_SECRET,
  googlePlaces: !!serverEnv.GOOGLE_PLACES_API_KEY,
  supabaseStorage: !!serverEnv.SUPABASE_SERVICE_ROLE_KEY,
} as const;
