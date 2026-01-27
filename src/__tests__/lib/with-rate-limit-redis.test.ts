/**
 * Tests for withRateLimitRedis wrapper
 *
 * P0-1: Verify rate limiting wrapper behavior
 */

// Mock dependencies before imports
jest.mock('@/lib/rate-limit-redis', () => ({
  checkChatRateLimit: jest.fn(),
  checkMapRateLimit: jest.fn(),
  checkMetricsRateLimit: jest.fn(),
  checkSearchCountRateLimit: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  getClientIP: jest.fn(),
}));

jest.mock('@/lib/request-context', () => ({
  getRequestId: jest.fn(),
}));

import { withRateLimitRedis, addRedisRateLimitHeaders } from '@/lib/with-rate-limit-redis';
import { NextResponse } from 'next/server';
import * as rateLimitModule from '@/lib/rate-limit-redis';
import { getClientIP } from '@/lib/rate-limit';
import { getRequestId } from '@/lib/request-context';

describe('withRateLimitRedis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getClientIP as jest.Mock).mockReturnValue('127.0.0.1');
    (getRequestId as jest.Mock).mockReturnValue('test-request-id');
  });

  describe('rate limit type routing', () => {
    it('calls checkChatRateLimit for chat type', async () => {
      (rateLimitModule.checkChatRateLimit as jest.Mock).mockResolvedValue({ success: true });

      const request = new Request('http://localhost/api/chat');
      await withRateLimitRedis(request, { type: 'chat' });

      expect(rateLimitModule.checkChatRateLimit).toHaveBeenCalledWith('127.0.0.1');
      expect(rateLimitModule.checkMapRateLimit).not.toHaveBeenCalled();
    });

    it('calls checkMapRateLimit for map type', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: true });

      const request = new Request('http://localhost/api/map-listings');
      await withRateLimitRedis(request, { type: 'map' });

      expect(rateLimitModule.checkMapRateLimit).toHaveBeenCalledWith('127.0.0.1');
      expect(rateLimitModule.checkChatRateLimit).not.toHaveBeenCalled();
    });

    it('calls checkMetricsRateLimit for metrics type', async () => {
      (rateLimitModule.checkMetricsRateLimit as jest.Mock).mockResolvedValue({ success: true });

      const request = new Request('http://localhost/api/metrics');
      await withRateLimitRedis(request, { type: 'metrics' });

      expect(rateLimitModule.checkMetricsRateLimit).toHaveBeenCalledWith('127.0.0.1');
    });

    it('calls checkSearchCountRateLimit for search-count type', async () => {
      (rateLimitModule.checkSearchCountRateLimit as jest.Mock).mockResolvedValue({ success: true });

      const request = new Request('http://localhost/api/search/count');
      await withRateLimitRedis(request, { type: 'search-count' });

      expect(rateLimitModule.checkSearchCountRateLimit).toHaveBeenCalledWith('127.0.0.1');
    });
  });

  describe('successful rate limit check', () => {
    it('returns null when rate limit not exceeded', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: true });

      const request = new Request('http://localhost/api/map-listings');
      const result = await withRateLimitRedis(request, { type: 'map' });

      expect(result).toBeNull();
    });
  });

  describe('rate limit exceeded', () => {
    it('returns 429 response when rate limited', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: false, retryAfter: 60 });

      const request = new Request('http://localhost/api/map-listings');
      const result = await withRateLimitRedis(request, { type: 'map' });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    it('includes Retry-After header', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: false, retryAfter: 45 });

      const request = new Request('http://localhost/api/map-listings');
      const result = await withRateLimitRedis(request, { type: 'map' });

      expect(result?.headers.get('Retry-After')).toBe('45');
    });

    it('includes x-request-id header', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: false, retryAfter: 60 });

      const request = new Request('http://localhost/api/map-listings');
      const result = await withRateLimitRedis(request, { type: 'map' });

      expect(result?.headers.get('x-request-id')).toBe('test-request-id');
    });

    it('includes X-RateLimit-Limit header', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: false, retryAfter: 60 });

      const request = new Request('http://localhost/api/map-listings');
      const result = await withRateLimitRedis(request, { type: 'map' });

      // Map type has burstLimit of 60
      expect(result?.headers.get('X-RateLimit-Limit')).toBe('60');
    });

    it('includes X-RateLimit-Remaining header set to 0', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: false, retryAfter: 60 });

      const request = new Request('http://localhost/api/map-listings');
      const result = await withRateLimitRedis(request, { type: 'map' });

      expect(result?.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('uses default retryAfter of 60 when not provided', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: false });

      const request = new Request('http://localhost/api/map-listings');
      const result = await withRateLimitRedis(request, { type: 'map' });

      expect(result?.headers.get('Retry-After')).toBe('60');
    });
  });

  describe('custom identifier', () => {
    it('uses custom identifier when provided', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: true });
      const customIdentifier = jest.fn().mockResolvedValue('custom-user-123');

      const request = new Request('http://localhost/api/map-listings');
      await withRateLimitRedis(request, {
        type: 'map',
        getIdentifier: customIdentifier,
      });

      expect(customIdentifier).toHaveBeenCalledWith(request);
      expect(rateLimitModule.checkMapRateLimit).toHaveBeenCalledWith('custom-user-123');
      expect(getClientIP).not.toHaveBeenCalled();
    });

    it('falls back to IP when no custom identifier', async () => {
      (rateLimitModule.checkMapRateLimit as jest.Mock).mockResolvedValue({ success: true });

      const request = new Request('http://localhost/api/map-listings');
      await withRateLimitRedis(request, { type: 'map' });

      expect(getClientIP).toHaveBeenCalledWith(request);
      expect(rateLimitModule.checkMapRateLimit).toHaveBeenCalledWith('127.0.0.1');
    });
  });
});

describe('addRedisRateLimitHeaders', () => {
  it('adds X-RateLimit-Limit header for chat type', () => {
    const response = NextResponse.json({ data: 'test' });
    const result = addRedisRateLimitHeaders(response, 'chat');

    // Chat has burstLimit of 5
    expect(result.headers.get('X-RateLimit-Limit')).toBe('5');
  });

  it('adds X-RateLimit-Limit header for map type', () => {
    const response = NextResponse.json({ data: 'test' });
    const result = addRedisRateLimitHeaders(response, 'map');

    // Map has burstLimit of 60
    expect(result.headers.get('X-RateLimit-Limit')).toBe('60');
  });

  it('adds X-RateLimit-Limit header for metrics type', () => {
    const response = NextResponse.json({ data: 'test' });
    const result = addRedisRateLimitHeaders(response, 'metrics');

    // Metrics has burstLimit of 100
    expect(result.headers.get('X-RateLimit-Limit')).toBe('100');
  });

  it('adds X-RateLimit-Limit header for search-count type', () => {
    const response = NextResponse.json({ data: 'test' });
    const result = addRedisRateLimitHeaders(response, 'search-count');

    // Search-count has burstLimit of 30
    expect(result.headers.get('X-RateLimit-Limit')).toBe('30');
  });

  it('returns the same response object', () => {
    const response = NextResponse.json({ data: 'test' });
    const result = addRedisRateLimitHeaders(response, 'map');

    expect(result).toBe(response);
  });
});
