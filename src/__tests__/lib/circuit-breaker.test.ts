/**
 * Tests for circuit-breaker utility
 * P2-07/P2-08 FIX: Validates circuit breaker pattern for external service resilience
 */

import {
  CircuitBreaker,
  CircuitOpenError,
  isCircuitOpenError,
  circuitBreakers,
} from '@/lib/circuit-breaker';

describe('circuit-breaker', () => {
  describe('CircuitOpenError', () => {
    it('creates error with correct properties', () => {
      const error = new CircuitOpenError('test-service');

      expect(error.name).toBe('CircuitOpenError');
      expect(error.code).toBe('CIRCUIT_OPEN');
      expect(error.circuitName).toBe('test-service');
      expect(error.message).toBe("Circuit breaker 'test-service' is open - service unavailable");
    });

    it('is instance of Error', () => {
      const error = new CircuitOpenError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('isCircuitOpenError', () => {
    it('returns true for CircuitOpenError instances', () => {
      const error = new CircuitOpenError('test');
      expect(isCircuitOpenError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('regular error');
      expect(isCircuitOpenError(error)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isCircuitOpenError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isCircuitOpenError(undefined)).toBe(false);
    });

    it('returns false for string', () => {
      expect(isCircuitOpenError('error string')).toBe(false);
    });

    it('returns false for object with similar properties', () => {
      const fakeError = {
        name: 'CircuitOpenError',
        code: 'CIRCUIT_OPEN',
        circuitName: 'test',
      };
      expect(isCircuitOpenError(fakeError)).toBe(false);
    });
  });

  describe('CircuitBreaker', () => {
    describe('constructor', () => {
      it('uses default values when no options provided', () => {
        const breaker = new CircuitBreaker();
        const stats = breaker.getStats();

        expect(stats.state).toBe('CLOSED');
        expect(stats.failures).toBe(0);
        expect(stats.successes).toBe(0);
        expect(stats.totalRequests).toBe(0);
        expect(stats.totalFailures).toBe(0);
      });

      it('accepts custom options', () => {
        const breaker = new CircuitBreaker({
          name: 'custom',
          failureThreshold: 10,
          resetTimeout: 60000,
          successThreshold: 5,
        });

        // Options are internal, but we can verify behavior
        expect(breaker.getState()).toBe('CLOSED');
      });
    });

    describe('execute - CLOSED state', () => {
      it('executes function and returns result', async () => {
        const breaker = new CircuitBreaker();
        const result = await breaker.execute(() => Promise.resolve('success'));

        expect(result).toBe('success');
      });

      it('increments totalRequests on success', async () => {
        const breaker = new CircuitBreaker();
        await breaker.execute(() => Promise.resolve('success'));

        const stats = breaker.getStats();
        expect(stats.totalRequests).toBe(1);
      });

      it('tracks lastSuccess on success', async () => {
        const breaker = new CircuitBreaker();
        const before = Date.now();
        await breaker.execute(() => Promise.resolve('success'));
        const after = Date.now();

        const stats = breaker.getStats();
        expect(stats.lastSuccess).toBeGreaterThanOrEqual(before);
        expect(stats.lastSuccess).toBeLessThanOrEqual(after);
      });

      it('propagates errors from the function', async () => {
        const breaker = new CircuitBreaker();
        const originalError = new Error('operation failed');

        await expect(
          breaker.execute(() => Promise.reject(originalError))
        ).rejects.toThrow('operation failed');
      });

      it('increments failure count on error', async () => {
        const breaker = new CircuitBreaker();

        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        const stats = breaker.getStats();
        expect(stats.failures).toBe(1);
        expect(stats.totalFailures).toBe(1);
      });

      it('resets failure count on success', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 5 });

        // Add some failures
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        expect(breaker.getStats().failures).toBe(2);

        // Success should reset
        await breaker.execute(() => Promise.resolve('success'));

        expect(breaker.getStats().failures).toBe(0);
        expect(breaker.getStats().totalFailures).toBe(2); // Total is not reset
      });
    });

    describe('execute - state transitions', () => {
      it('opens circuit after reaching failure threshold', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3 });
        const failingFn = () => Promise.reject(new Error('fail'));

        // 3 failures should open the circuit
        await breaker.execute(failingFn).catch(() => {});
        expect(breaker.getState()).toBe('CLOSED');

        await breaker.execute(failingFn).catch(() => {});
        expect(breaker.getState()).toBe('CLOSED');

        await breaker.execute(failingFn).catch(() => {});
        expect(breaker.getState()).toBe('OPEN');
      });

      it('throws CircuitOpenError when circuit is open', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 60000 });

        // Open the circuit
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        // Should throw CircuitOpenError
        await expect(
          breaker.execute(() => Promise.resolve('should not run'))
        ).rejects.toThrow(CircuitOpenError);
      });

      it('transitions to HALF_OPEN after reset timeout', async () => {
        jest.useFakeTimers();

        const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 5000 });

        // Open the circuit
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        expect(breaker.getState()).toBe('OPEN');

        // Advance time past reset timeout
        jest.advanceTimersByTime(5001);

        // getState() should now return HALF_OPEN
        expect(breaker.getState()).toBe('HALF_OPEN');

        jest.useRealTimers();
      });

      it('closes circuit after success threshold in HALF_OPEN state', async () => {
        jest.useFakeTimers();

        const breaker = new CircuitBreaker({
          failureThreshold: 2,
          resetTimeout: 5000,
          successThreshold: 2,
        });

        // Open the circuit
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        // Advance time to allow HALF_OPEN
        jest.advanceTimersByTime(5001);

        // First success in HALF_OPEN
        await breaker.execute(() => Promise.resolve('success'));
        expect(breaker.getState()).toBe('HALF_OPEN');

        // Second success should close the circuit
        await breaker.execute(() => Promise.resolve('success'));
        expect(breaker.getState()).toBe('CLOSED');

        jest.useRealTimers();
      });

      it('reopens circuit on failure in HALF_OPEN state', async () => {
        jest.useFakeTimers();

        const breaker = new CircuitBreaker({
          failureThreshold: 2,
          resetTimeout: 5000,
          successThreshold: 3,
        });

        // Open the circuit
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        // Advance time to allow HALF_OPEN
        jest.advanceTimersByTime(5001);

        // One success
        await breaker.execute(() => Promise.resolve('success'));
        expect(breaker.getState()).toBe('HALF_OPEN');

        // Failure should reopen
        await breaker.execute(() => Promise.reject(new Error('fail again'))).catch(() => {});
        expect(breaker.getState()).toBe('OPEN');

        jest.useRealTimers();
      });
    });

    describe('getState', () => {
      it('returns CLOSED initially', () => {
        const breaker = new CircuitBreaker();
        expect(breaker.getState()).toBe('CLOSED');
      });

      it('returns OPEN after threshold failures', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1 });
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        expect(breaker.getState()).toBe('OPEN');
      });

      it('considers time when returning HALF_OPEN', async () => {
        jest.useFakeTimers();

        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1000 });
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        expect(breaker.getState()).toBe('OPEN');

        jest.advanceTimersByTime(1001);

        expect(breaker.getState()).toBe('HALF_OPEN');

        jest.useRealTimers();
      });
    });

    describe('getStats', () => {
      it('returns complete statistics', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 5 });

        // Mix of successes and failures
        await breaker.execute(() => Promise.resolve('ok'));
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
        await breaker.execute(() => Promise.resolve('ok'));

        const stats = breaker.getStats();

        expect(stats.state).toBe('CLOSED');
        expect(stats.failures).toBe(0); // Reset by last success
        expect(stats.successes).toBe(0); // Only tracked in HALF_OPEN
        expect(stats.totalRequests).toBe(3);
        expect(stats.totalFailures).toBe(1);
        expect(stats.lastSuccess).toBeDefined();
        expect(stats.lastFailure).toBeDefined();
      });
    });

    describe('reset', () => {
      it('resets circuit to CLOSED state', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1 });

        // Open the circuit
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
        expect(breaker.getState()).toBe('OPEN');

        // Reset
        breaker.reset();

        expect(breaker.getState()).toBe('CLOSED');
        expect(breaker.getStats().failures).toBe(0);
        expect(breaker.getStats().successes).toBe(0);
      });

      it('allows requests after reset', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 60000 });

        // Open the circuit
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        // Without reset, would throw CircuitOpenError
        breaker.reset();

        // Should work now
        const result = await breaker.execute(() => Promise.resolve('success'));
        expect(result).toBe('success');
      });
    });

    describe('isAllowingRequests', () => {
      it('returns true when CLOSED', () => {
        const breaker = new CircuitBreaker();
        expect(breaker.isAllowingRequests()).toBe(true);
      });

      it('returns false when OPEN', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 60000 });
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        expect(breaker.isAllowingRequests()).toBe(false);
      });

      it('returns true when HALF_OPEN', async () => {
        jest.useFakeTimers();

        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1000 });
        await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

        jest.advanceTimersByTime(1001);

        expect(breaker.isAllowingRequests()).toBe(true);

        jest.useRealTimers();
      });
    });

    describe('concurrent requests', () => {
      it('handles multiple concurrent successes', async () => {
        const breaker = new CircuitBreaker();

        const results = await Promise.all([
          breaker.execute(() => Promise.resolve('a')),
          breaker.execute(() => Promise.resolve('b')),
          breaker.execute(() => Promise.resolve('c')),
        ]);

        expect(results).toEqual(['a', 'b', 'c']);
        expect(breaker.getStats().totalRequests).toBe(3);
      });

      it('handles mixed concurrent results', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 5 });

        const results = await Promise.allSettled([
          breaker.execute(() => Promise.resolve('success')),
          breaker.execute(() => Promise.reject(new Error('fail'))),
          breaker.execute(() => Promise.resolve('success')),
        ]);

        expect(results[0]).toEqual({ status: 'fulfilled', value: 'success' });
        expect(results[1].status).toBe('rejected');
        expect(results[2]).toEqual({ status: 'fulfilled', value: 'success' });

        const stats = breaker.getStats();
        expect(stats.totalRequests).toBe(3);
        expect(stats.totalFailures).toBe(1);
      });
    });
  });

  describe('pre-configured circuitBreakers', () => {
    it('has redis circuit breaker', () => {
      expect(circuitBreakers.redis).toBeInstanceOf(CircuitBreaker);
    });

    it('has radar circuit breaker', () => {
      expect(circuitBreakers.radar).toBeInstanceOf(CircuitBreaker);
    });

    it('has email circuit breaker', () => {
      expect(circuitBreakers.email).toBeInstanceOf(CircuitBreaker);
    });

    it('all start in CLOSED state', () => {
      expect(circuitBreakers.redis.getState()).toBe('CLOSED');
      expect(circuitBreakers.radar.getState()).toBe('CLOSED');
      expect(circuitBreakers.email.getState()).toBe('CLOSED');
    });
  });
});
