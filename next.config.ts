import type { NextConfig } from "next";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// P2-08 FIX: Generate SW version from git commit or timestamp for cache invalidation
// In development, use timestamp so every dev server restart busts caches.
// In production, use git commit SHA for deterministic cache versioning.
const SW_VERSION =
  process.env.NODE_ENV === "development"
    ? Date.now().toString()
    : process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
      (() => {
        try {
          return execSync("git rev-parse --short HEAD").toString().trim();
        } catch {
          return Date.now().toString();
        }
      })();

// Write version file for service worker (imported via importScripts)
const swVersionPath = path.join(process.cwd(), "public", "sw-version.js");
fs.writeFileSync(swVersionPath, `self.__SW_VERSION__ = "${SW_VERSION}";\n`);

const isWindowsMountedWorkspace =
  process.platform === "linux" && process.cwd().startsWith("/mnt/");
const isSentryEnabled =
  process.env.NODE_ENV === "production" ||
  process.env.SENTRY_ENABLE_IN_DEV === "1";

const nextConfig: NextConfig = {
  transpilePackages: ["react-map-gl"],

  // Optimize barrel file imports for better tree-shaking
  // Significantly reduces bundle size for icon libraries and UI component packages
  experimental: {
    // Build worker has been unstable in this project (silent worker exits during type-checking).
    // Use the single-process path for deterministic CI/production builds.
    webpackBuildWorker: false,
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
    ],
  },

  // Image optimization configuration
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "qolpgfdmkqvxraafucvu.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      // Placeholder image services — only allowed in development
      ...(process.env.NODE_ENV !== "production"
        ? [
            {
              protocol: "https" as const,
              hostname: "picsum.photos",
            },
            {
              protocol: "https" as const,
              hostname: "i.pravatar.cc",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 256, 384],
  },

  // Security headers fallback for paths excluded from the proxy matcher.
  // CSP is now set per-request by src/proxy.ts with nonce injection.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]
            : []),
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },

  // Polling is only needed for WSL repos living on Windows-mounted paths.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: [
          "**/.git/**",
          "**/.next/**",
          "**/node_modules/**",
          "**/.claude/**",
          "**/.worktrees/**",
          "**/.zenflow/**",
          "**/.zencoder/**",
          "**/coverage/**",
          "**/memory-bank/**",
          "**/output/**",
          "**/playwright-report/**",
          "**/test-results/**",
          "**/docs/plans/**",
          "**/*.log",
        ],
        ...(isWindowsMountedWorkspace
          ? {
              poll: 1000,
              aggregateTimeout: 300,
            }
          : {}),
      };
    }
    return config;
  },

  // Disable powered by header
  poweredByHeader: false,
};

let exportedConfig = nextConfig;

// Only wrap with Sentry when credentials are available (skip in CI E2E runs)
const hasSentryCredentials = !!(
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

if (isSentryEnabled && hasSentryCredentials) {
  const { withSentryConfig } = require("@sentry/nextjs");

  exportedConfig = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    disableLogger: true,
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
    autoInstrumentServerFunctions: true,
    autoInstrumentMiddleware: true,
  });
}

export default exportedConfig;
