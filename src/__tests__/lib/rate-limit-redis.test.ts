/**
 * Tests for rate-limit-redis utility
 * P1-08 FIX: Validates timeout and circuit breaker protection for Redis rate limiting
 */

// Mock the timeout-wrapper module
jest.mock('@/lib/timeout-wrapper', () => ({
  withTimeout: jest.fn((promise) => promise),
  DEFAULT_TIMEOUTS: { REDIS: 1000 },
  TimeoutError: class TimeoutError extends Error {
    code = 'TIMEOUT_ERROR';
    operation: string;
    timeoutMs: number;
    constructor(operation: string, timeoutMs: number) {
      super(`${operation} timed out after ${timeoutMs}ms`);
      this.name = 'TimeoutError';
      this.operation = operation;
      this.timeoutMs = timeoutMs;
    }
  },
  isTimeoutError: jest.fn((error) => error?.name === 'TimeoutError'),
}));

// Mock the circuit-breaker module
jest.mock('@/lib/circuit-breaker', () => {
  const mockExecute = jest.fn((fn) => fn());
  return {
    circuitBreakers: {
      redis: {
        execute: mockExecute,
        getState: jest.fn(() => 'CLOSED'),
        reset: jest.fn(),
      },
    },
    CircuitOpenError: class CircuitOpenError extends Error {
      code = 'CIRCUIT_OPEN';
      circuitName: string;
      constructor(name: string) {
        super(`Circuit breaker '${name}' is open`);
        this.name = 'CircuitOpenError';
        this.circuitName = name;
      }
    },
    isCircuitOpenError: jest.fn((error) => error?.name === 'CircuitOpenError'),
  };
});

// Mock Upstash Redis
const mockLimit = jest.fn();
const MockRatelimit = jest.fn().mockImplementation(() => ({
  limit: mockLimit,
}));
// Add static method for slidingWindow
(MockRatelimit as unknown as { slidingWindow: jest.Mock }).slidingWindow = jest.fn(() => ({}));

jest.mock('@upstash/ratelimit', () => ({
  Ratelimit: MockRatelimit,
}));

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));

describe('rate-limit-redis', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Use resetAllMocks to clear queued mockResolvedValueOnce values between tests
    jest.resetAllMocks();

    // Restore MockRatelimit immediately after resetAllMocks
    // This MUST happen before any jest.resetModules() + dynamic import
    // because Ratelimit instances are created at module load time
    MockRatelimit.mockImplementation(() => ({
      limit: mockLimit,
    }));

    process.env = {
      ...originalEnv,
      UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
      NODE_ENV: 'production',
    };
    // Default mock: successful rate limit check
    mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });
  });

  // Helper to restore MockRatelimit BEFORE jest.resetModules() and dynamic import
  // This is critical because Ratelimit instances are created at module load time
  function restoreRatelimitMock() {
    MockRatelimit.mockImplementation(() => ({
      limit: mockLimit,
    }));
  }

  // Helper to restore runtime mocks AFTER dynamic imports
  // These mocks are used at runtime, not at module load time
  function restoreRuntimeMocks() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const circuitBreakerMock = require('@/lib/circuit-breaker');
    circuitBreakerMock.circuitBreakers.redis.execute.mockImplementation(
      (fn: () => Promise<unknown>) => fn()
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const timeoutMock = require('@/lib/timeout-wrapper');
    timeoutMock.withTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('checkChatRateLimit', () => {
    let checkChatRateLimit: (ip: string) => Promise<{ success: boolean; retryAfter?: number }>;

    beforeEach(async () => {
      // Restore MockRatelimit BEFORE resetModules - instances created at module load time
      restoreRatelimitMock();
      // Dynamic import to get fresh module with mocks
      jest.resetModules();
      const rateLimitModule = await import('@/lib/rate-limit-redis');
      checkChatRateLimit = rateLimitModule.checkChatRateLimit;
      // Restore runtime mocks after import
      restoreRuntimeMocks();
    });

    it('returns success when both burst and sustained limits pass', async () => {
      mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });

      const result = await checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(true);
    });

    it('returns failure with retryAfter when burst limit exceeded', async () => {
      const resetTime = Date.now() + 30000;
      mockLimit
        .mockResolvedValueOnce({ success: false, reset: resetTime }) // burst
        .mockResolvedValueOnce({ success: true, reset: Date.now() + 60000 }); // sustained

      const result = await checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('returns failure when sustained limit exceeded', async () => {
      const resetTime = Date.now() + 3600000;
      mockLimit
        .mockResolvedValueOnce({ success: true, reset: Date.now() + 60000 }) // burst
        .mockResolvedValueOnce({ success: false, reset: resetTime }); // sustained

      const result = await checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('fails closed in production when Redis not configured', async () => {
      process.env.UPSTASH_REDIS_REST_URL = '';
      process.env.UPSTASH_REDIS_REST_TOKEN = '';
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });

      jest.resetModules();
      const rateLimitModule = await import('@/lib/rate-limit-redis');

      const result = await rateLimitModule.checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBe(60);
    });

    it('allows requests in development when Redis not configured', async () => {
      process.env.UPSTASH_REDIS_REST_URL = '';
      process.env.UPSTASH_REDIS_REST_TOKEN = '';
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });

      jest.resetModules();
      const rateLimitModule = await import('@/lib/rate-limit-redis');

      const result = await rateLimitModule.checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(true);
    });

    it('fails closed in production on Redis error', async () => {
      mockLimit.mockRejectedValue(new Error('Redis connection failed'));

      const result = await checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBe(60);
    });

    it('allows requests in development on Redis error', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });
      jest.resetModules();
      const rateLimitModule = await import('@/lib/rate-limit-redis');

      mockLimit.mockRejectedValue(new Error('Redis connection failed'));

      const result = await rateLimitModule.checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(true);
    });
  });

  describe('timeout protection', () => {
    let checkChatRateLimit: (ip: string) => Promise<{ success: boolean; retryAfter?: number }>;
    let withTimeout: jest.Mock;

    beforeEach(async () => {
      restoreRatelimitMock();
      jest.resetModules();
      const timeoutWrapper = await import('@/lib/timeout-wrapper');
      withTimeout = timeoutWrapper.withTimeout as jest.Mock;

      const rateLimitModule = await import('@/lib/rate-limit-redis');
      checkChatRateLimit = rateLimitModule.checkChatRateLimit;
      restoreRuntimeMocks();
    });

    it('wraps rate limit calls with timeout', async () => {
      mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });

      await checkChatRateLimit('127.0.0.1');

      // withTimeout should be called for rate limit operations
      expect(withTimeout).toHaveBeenCalled();
    });

    it('fails closed on timeout in production', async () => {
      const { TimeoutError } = await import('@/lib/timeout-wrapper');
      withTimeout.mockRejectedValue(new TimeoutError('Redis rate limit', 1000));

      const result = await checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBe(60);
    });
  });

  describe('circuit breaker protection', () => {
    let checkChatRateLimit: (ip: string) => Promise<{ success: boolean; retryAfter?: number }>;
    let circuitBreakers: { redis: { execute: jest.Mock } };

    beforeEach(async () => {
      // Restore MockRatelimit BEFORE resetModules - instances created at module load time
      restoreRatelimitMock();
      jest.resetModules();
      const circuitBreakerModule = await import('@/lib/circuit-breaker');
      circuitBreakers = circuitBreakerModule.circuitBreakers as unknown as { redis: { execute: jest.Mock } };

      const rateLimitModule = await import('@/lib/rate-limit-redis');
      checkChatRateLimit = rateLimitModule.checkChatRateLimit;
      // Restore runtime mocks after import
      restoreRuntimeMocks();
    });

    it('uses circuit breaker for Redis operations', async () => {
      mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });

      await checkChatRateLimit('127.0.0.1');

      // Circuit breaker should be used
      expect(circuitBreakers.redis.execute).toHaveBeenCalled();
    });

    it('fails closed when circuit is open', async () => {
      const { CircuitOpenError } = await import('@/lib/circuit-breaker');
      circuitBreakers.redis.execute.mockRejectedValue(new CircuitOpenError('redis'));

      const result = await checkChatRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBe(60);
    });
  });

  describe('checkMetricsRateLimit', () => {
    let checkMetricsRateLimit: (ip: string) => Promise<{ success: boolean; retryAfter?: number }>;

    beforeEach(async () => {
      // Restore MockRatelimit BEFORE resetModules - instances created at module load time
      restoreRatelimitMock();
      jest.resetModules();
      const rateLimitModule = await import('@/lib/rate-limit-redis');
      checkMetricsRateLimit = rateLimitModule.checkMetricsRateLimit;
      // Restore runtime mocks after import
      restoreRuntimeMocks();
    });

    it('returns success when both limits pass', async () => {
      mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });

      const result = await checkMetricsRateLimit('127.0.0.1');

      expect(result.success).toBe(true);
    });

    it('fails closed on error in production', async () => {
      mockLimit.mockRejectedValue(new Error('Redis error'));

      const result = await checkMetricsRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
    });
  });

  describe('checkMapRateLimit', () => {
    let checkMapRateLimit: (ip: string) => Promise<{ success: boolean; retryAfter?: number }>;

    beforeEach(async () => {
      // Restore MockRatelimit BEFORE resetModules - instances created at module load time
      restoreRatelimitMock();
      jest.resetModules();
      const rateLimitModule = await import('@/lib/rate-limit-redis');
      checkMapRateLimit = rateLimitModule.checkMapRateLimit;
      // Restore runtime mocks after import
      restoreRuntimeMocks();
    });

    it('returns success when both limits pass', async () => {
      mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });

      const result = await checkMapRateLimit('127.0.0.1');

      expect(result.success).toBe(true);
    });

    it('fails closed on error in production', async () => {
      mockLimit.mockRejectedValue(new Error('Redis error'));

      const result = await checkMapRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
    });
  });

  describe('checkSearchCountRateLimit', () => {
    let checkSearchCountRateLimit: (ip: string) => Promise<{ success: boolean; retryAfter?: number }>;

    beforeEach(async () => {
      // Restore MockRatelimit BEFORE resetModules - instances created at module load time
      restoreRatelimitMock();
      jest.resetModules();
      const rateLimitModule = await import('@/lib/rate-limit-redis');
      checkSearchCountRateLimit = rateLimitModule.checkSearchCountRateLimit;
      // Restore runtime mocks after import
      restoreRuntimeMocks();
    });

    it('returns success when both limits pass', async () => {
      mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });

      const result = await checkSearchCountRateLimit('127.0.0.1');

      expect(result.success).toBe(true);
    });

    it('fails closed on error in production', async () => {
      mockLimit.mockRejectedValue(new Error('Redis error'));

      const result = await checkSearchCountRateLimit('127.0.0.1');

      expect(result.success).toBe(false);
    });
  });
});
