"use client";

import { useReportWebVitals } from "next/web-vitals";

// Performance thresholds based on Google's Core Web Vitals guidelines
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 }, // Largest Contentful Paint
  FID: { good: 100, poor: 300 }, // First Input Delay (legacy, replaced by INP)
  INP: { good: 200, poor: 500 }, // Interaction to Next Paint
  CLS: { good: 0.1, poor: 0.25 }, // Cumulative Layout Shift
  FCP: { good: 1800, poor: 3000 }, // First Contentful Paint
  TTFB: { good: 800, poor: 1800 }, // Time to First Byte
};

type MetricName = keyof typeof THRESHOLDS;

function getRating(
  name: string,
  value: number
): "good" | "needs-improvement" | "poor" {
  const threshold = THRESHOLDS[name as MetricName];
  if (!threshold) return "good";

  if (value <= threshold.good) return "good";
  if (value <= threshold.poor) return "needs-improvement";
  return "poor";
}

const RATING_COLORS = {
  good: "#0cce6b",
  "needs-improvement": "#ffa400",
  poor: "#ff4e42",
} as const;

function logMetricToConsole(
  name: string,
  value: number,
  rating: "good" | "needs-improvement" | "poor"
) {
  const color = RATING_COLORS[rating];
  const unit = name === "CLS" ? "" : "ms";
  const displayValue =
    name === "CLS" ? value.toFixed(4) : `${Math.round(value)}${unit}`;

  console.log(
    `%c[Web Vitals] %c${name} %c${displayValue} %c(${rating})`,
    "color: #666; font-weight: bold",
    "color: #333; font-weight: bold",
    `color: ${color}; font-weight: bold`,
    `color: ${color}`
  );
}

export function WebVitals() {
  useReportWebVitals((metric) => {
    const rating = getRating(metric.name, metric.value);

    // Dev mode: color-coded console logging
    if (process.env.NODE_ENV === "development") {
      logMetricToConsole(metric.name, metric.value, rating);
      return;
    }

    // Production: send to web-vitals analytics endpoint
    const body = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
      pathname: window.location.pathname,
      timestamp: Date.now(),
    };

    // Use sendBeacon for reliability (doesn't block page unload)
    // Must use Blob to set Content-Type (sendBeacon doesn't support headers)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/web-vitals", blob);
    } else {
      fetch("/api/web-vitals", {
        method: "POST",
        body: JSON.stringify(body),
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        // Silently fail - metrics collection should never impact UX
      });
    }
  });

  return null;
}
