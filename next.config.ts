import type { NextConfig } from "next";
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// P2-08 FIX: Generate SW version from git commit or timestamp for cache invalidation
const SW_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
    (() => {
        try {
            return execSync('git rev-parse --short HEAD').toString().trim();
        } catch {
            return Date.now().toString();
        }
    })();

// Write version file for service worker (imported via importScripts)
const swVersionPath = path.join(process.cwd(), 'public', 'sw-version.js');
fs.writeFileSync(swVersionPath, `self.__SW_VERSION__ = "${SW_VERSION}";\n`);

const nextConfig: NextConfig = {
  transpilePackages: ['react-map-gl'],

  // Optimize barrel file imports for better tree-shaking
  // Significantly reduces bundle size for icon libraries and UI component packages
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
      'date-fns',
      '@heroicons/react',
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
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://api.mapbox.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' https://fonts.gstatic.com https://fonts.mapbox.com",
              "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://tiles.mapbox.com https://*.tiles.mapbox.com https://fonts.mapbox.com https://maps.googleapis.com https://places.googleapis.com https://*.supabase.co https://api.groq.com wss://*.supabase.co",
              "worker-src 'self' blob: https://api.mapbox.com",
              "frame-src 'self' https://accounts.google.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
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

  // Disable powered by header
  poweredByHeader: false,
};

export default nextConfig;
