/**
 * P2-07/P2-08 FIX: Circuit Breaker Pattern
 * Prevents cascading failures by failing fast when a service is unhealthy.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is unhealthy, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeout?: number;
  /** Number of successful requests needed to close circuit from half-open (default: 2) */
  successThreshold?: number;
  /** Optional name for logging/debugging */
  name?: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  totalRequests: number;
  totalFailures: number;
}

/**
 * Error thrown when circuit is open and requests are being rejected
 */
export class CircuitOpenError extends Error {
  public readonly code = 'CIRCUIT_OPEN';
  public readonly circuitName: string;

  constructor(name: string) {
    super(`Circuit breaker '${name}' is open - service unavailable`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
  }
}

/**
 * Type guard to check if an error is a CircuitOpenError
 */
export function isCircuitOpenError(error: unknown): error is CircuitOpenError {
  return error instanceof CircuitOpenError;
}

/**
 * Circuit Breaker implementation
 *
 * @example
 * ```typescript
 * const redisCircuit = new CircuitBreaker({ name: 'redis', failureThreshold: 3 });
 *
 * try {
 *   const result = await redisCircuit.execute(() => redis.get('key'));
 * } catch (error) {
 *   if (isCircuitOpenError(error)) {
 *     // Circuit is open, use fallback
 *     return fallbackValue;
 *   }
 *   throw error;
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private totalRequests: number = 0;
  private totalFailures: number = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
    this.name = options.name ?? 'default';
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should move from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (this.lastFailure === null) return true;
    return Date.now() - this.lastFailure >= this.resetTimeout;
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccess = Date.now();
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailure = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open state reopens the circuit
      this.state = 'OPEN';
      this.successes = 0;
    } else if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check for automatic transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      return 'HALF_OPEN';
    }
    return this.state;
  }

  /**
   * Get detailed statistics about the circuit breaker
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Manually reset the circuit to closed state
   * Use with caution - typically for admin/maintenance operations
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Check if circuit is allowing requests (CLOSED or HALF_OPEN)
   */
  isAllowingRequests(): boolean {
    const currentState = this.getState();
    return currentState === 'CLOSED' || currentState === 'HALF_OPEN';
  }
}

/**
 * Pre-configured circuit breakers for common services
 */
export const circuitBreakers = {
  redis: new CircuitBreaker({
    name: 'redis',
    failureThreshold: 3,
    resetTimeout: 10000, // 10 seconds
    successThreshold: 2,
  }),

  radar: new CircuitBreaker({
    name: 'radar',
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    successThreshold: 2,
  }),

  email: new CircuitBreaker({
    name: 'email',
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    successThreshold: 3,
  }),

  mapboxGeocode: new CircuitBreaker({
    name: 'mapbox-geocode',
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    successThreshold: 2,
  }),

  postgis: new CircuitBreaker({
    name: 'postgis',
    failureThreshold: 3,
    resetTimeout: 15000, // 15 seconds
    successThreshold: 2,
  }),
};
