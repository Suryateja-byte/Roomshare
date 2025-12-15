'use client';

import { useReportWebVitals } from 'next/web-vitals';

// Performance thresholds based on Google's Core Web Vitals guidelines
const THRESHOLDS = {
    LCP: { good: 2500, poor: 4000 },     // Largest Contentful Paint
    FID: { good: 100, poor: 300 },       // First Input Delay (legacy, replaced by INP)
    INP: { good: 200, poor: 500 },       // Interaction to Next Paint
    CLS: { good: 0.1, poor: 0.25 },      // Cumulative Layout Shift
    FCP: { good: 1800, poor: 3000 },     // First Contentful Paint
    TTFB: { good: 800, poor: 1800 },     // Time to First Byte
};

type MetricName = keyof typeof THRESHOLDS;

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = THRESHOLDS[name as MetricName];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
}

export function WebVitals() {
    useReportWebVitals((metric) => {
        const rating = getRating(metric.name, metric.value);

        // Log in development for debugging
        if (process.env.NODE_ENV === 'development') {
            const color = rating === 'good' ? '#0cce6b' : rating === 'needs-improvement' ? '#ffa400' : '#ff4e42';
            console.log(
                `%c[Web Vitals] ${metric.name}: ${metric.value.toFixed(metric.name === 'CLS' ? 3 : 0)}${metric.name === 'CLS' ? '' : 'ms'} (${rating})`,
                `color: ${color}; font-weight: bold;`
            );
        }

        // In production, send to analytics endpoint
        // Structured for easy integration with analytics services
        if (process.env.NODE_ENV === 'production') {
            const body = {
                id: metric.id,
                name: metric.name,
                value: metric.value,
                rating,
                delta: metric.delta,
                navigationType: metric.navigationType,
                // Add page context
                pathname: window.location.pathname,
                timestamp: Date.now(),
            };

            // Use sendBeacon for reliability (doesn't block page unload)
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/metrics', JSON.stringify(body));
            } else {
                // Fallback for browsers without sendBeacon
                fetch('/api/metrics', {
                    method: 'POST',
                    body: JSON.stringify(body),
                    keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                }).catch(() => {
                    // Silently fail - metrics collection should never impact UX
                });
            }
        }
    });

    return null;
}
