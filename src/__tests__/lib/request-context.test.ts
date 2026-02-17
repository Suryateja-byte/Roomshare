/**
 * Tests for request-context (AsyncLocalStorage-based tracing)
 * Validates request-scoped context isolation, ID generation, and updates
 */

import {
  runWithRequestContext,
  getRequestContext,
  getRequestId,
  getRequestDuration,
  generateRequestId,
  updateRequestContext,
  createContextFromHeaders,
} from '@/lib/request-context';

describe('request-context', () => {
  describe('generateRequestId', () => {
    it('returns existing ID when provided', () => {
      expect(generateRequestId('my-request-id')).toBe('my-request-id');
    });

    it('generates a UUID when no ID provided', () => {
      const id = generateRequestId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('generates a UUID when undefined is passed', () => {
      const id = generateRequestId(undefined);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('generates unique IDs on successive calls', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('runWithRequestContext', () => {
    it('makes context available inside callback', () => {
      runWithRequestContext({ requestId: 'test-123' }, () => {
        const ctx = getRequestContext();
        expect(ctx).toBeDefined();
        expect(ctx!.requestId).toBe('test-123');
      });
    });

    it('returns the callback return value', () => {
      const result = runWithRequestContext({ requestId: 'test' }, () => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it('works with async callbacks', async () => {
      const result = await runWithRequestContext({ requestId: 'async-test' }, async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        const ctx = getRequestContext();
        return ctx?.requestId;
      });
      expect(result).toBe('async-test');
    });

    it('auto-generates requestId when not provided', () => {
      runWithRequestContext({}, () => {
        const ctx = getRequestContext();
        expect(ctx).toBeDefined();
        expect(ctx!.requestId).toBeTruthy();
        expect(typeof ctx!.requestId).toBe('string');
      });
    });

    it('sets startTime to current time when not provided', () => {
      const before = Date.now();
      runWithRequestContext({}, () => {
        const ctx = getRequestContext();
        const after = Date.now();
        expect(ctx!.startTime).toBeGreaterThanOrEqual(before);
        expect(ctx!.startTime).toBeLessThanOrEqual(after);
      });
    });

    it('uses provided startTime when given', () => {
      const fixedTime = 1700000000000;
      runWithRequestContext({ startTime: fixedTime }, () => {
        const ctx = getRequestContext();
        expect(ctx!.startTime).toBe(fixedTime);
      });
    });

    it('includes optional userId and path', () => {
      runWithRequestContext(
        { requestId: 'test', userId: 'user-456', path: '/api/test', method: 'GET' },
        () => {
          const ctx = getRequestContext();
          expect(ctx!.userId).toBe('user-456');
          expect(ctx!.path).toBe('/api/test');
          expect(ctx!.method).toBe('GET');
        },
      );
    });
  });

  describe('getRequestContext', () => {
    it('returns undefined outside of a request context', () => {
      const ctx = getRequestContext();
      expect(ctx).toBeUndefined();
    });

    it('returns context inside runWithRequestContext', () => {
      runWithRequestContext({ requestId: 'ctx-test' }, () => {
        const ctx = getRequestContext();
        expect(ctx).toBeDefined();
      });
    });
  });

  describe('getRequestId', () => {
    it('returns "unknown" outside of request context', () => {
      expect(getRequestId()).toBe('unknown');
    });

    it('returns the request ID inside context', () => {
      runWithRequestContext({ requestId: 'id-test-789' }, () => {
        expect(getRequestId()).toBe('id-test-789');
      });
    });
  });

  describe('getRequestDuration', () => {
    it('returns 0 outside of request context', () => {
      expect(getRequestDuration()).toBe(0);
    });

    it('returns elapsed time inside context', () => {
      const pastTime = Date.now() - 500;
      runWithRequestContext({ startTime: pastTime }, () => {
        const duration = getRequestDuration();
        expect(duration).toBeGreaterThanOrEqual(400);
        expect(duration).toBeLessThan(1000);
      });
    });
  });

  describe('updateRequestContext', () => {
    it('updates existing context fields', () => {
      runWithRequestContext({ requestId: 'update-test' }, () => {
        updateRequestContext({ userId: 'new-user' });
        const ctx = getRequestContext();
        expect(ctx!.userId).toBe('new-user');
        expect(ctx!.requestId).toBe('update-test');
      });
    });

    it('does nothing outside of request context', () => {
      // Should not throw
      expect(() => updateRequestContext({ userId: 'orphan' })).not.toThrow();
    });
  });

  describe('context isolation between requests', () => {
    it('isolates context between nested runs', () => {
      runWithRequestContext({ requestId: 'outer' }, () => {
        expect(getRequestId()).toBe('outer');

        runWithRequestContext({ requestId: 'inner' }, () => {
          expect(getRequestId()).toBe('inner');
        });

        // After inner finishes, outer context is restored
        expect(getRequestId()).toBe('outer');
      });
    });

    it('isolates concurrent async contexts', async () => {
      const results: string[] = [];

      const task1 = runWithRequestContext({ requestId: 'task-1' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push(getRequestId());
      });

      const task2 = runWithRequestContext({ requestId: 'task-2' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(getRequestId());
      });

      await Promise.all([task1, task2]);

      // task-2 finishes first (shorter delay), then task-1
      expect(results).toContain('task-1');
      expect(results).toContain('task-2');
      expect(results).toHaveLength(2);
    });
  });

  describe('createContextFromHeaders', () => {
    it('uses x-request-id header if present', () => {
      const headers = new Headers({ 'x-request-id': 'header-req-id' });
      const ctx = createContextFromHeaders(headers);
      expect(ctx.requestId).toBe('header-req-id');
    });

    it('falls back to x-vercel-id header', () => {
      const headers = new Headers({ 'x-vercel-id': 'vercel-id-123' });
      const ctx = createContextFromHeaders(headers);
      expect(ctx.requestId).toBe('vercel-id-123');
    });

    it('generates ID when no headers present', () => {
      const headers = new Headers();
      const ctx = createContextFromHeaders(headers);
      expect(ctx.requestId).toBeDefined();
      expect(typeof ctx.requestId).toBe('string');
    });

    it('prefers x-request-id over x-vercel-id', () => {
      const headers = new Headers({
        'x-request-id': 'preferred-id',
        'x-vercel-id': 'fallback-id',
      });
      const ctx = createContextFromHeaders(headers);
      expect(ctx.requestId).toBe('preferred-id');
    });

    it('sets startTime', () => {
      const before = Date.now();
      const headers = new Headers();
      const ctx = createContextFromHeaders(headers);
      const after = Date.now();

      expect(ctx.startTime).toBeGreaterThanOrEqual(before);
      expect(ctx.startTime).toBeLessThanOrEqual(after);
    });
  });
});
