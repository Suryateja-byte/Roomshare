/**
 * Tests for GET /api/cron/reconcile-slots route (Phase 5)
 *
 * Tests cron auth, feature flag gating, advisory lock, drift detection/fix,
 * safety threshold, markListingsDirty call, and structured logging.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock('@/lib/cron-auth', () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  features: {
    bookingAudit: true,
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
}));

jest.mock('@/lib/search/search-doc-dirty', () => ({
  markListingsDirty: jest.fn(),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers;
    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { GET } from '@/app/api/cron/reconcile-slots/route';
import { prisma } from '@/lib/prisma';
import { validateCronAuth } from '@/lib/cron-auth';
import { features } from '@/lib/env';
import { markListingsDirty } from '@/lib/search/search-doc-dirty';
import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers['authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/api/cron/reconcile-slots', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/cron/reconcile-slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCronAuth as jest.Mock).mockReturnValue(null);
    (features as any).bookingAudit = true;
  });

  it('returns 401 without valid CRON_SECRET', async () => {
    const mockResp = { status: 401, json: async () => ({ error: 'Unauthorized' }) };
    (validateCronAuth as jest.Mock).mockReturnValue(mockResp);

    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it('returns skipped when feature flag off', async () => {
    (features as any).bookingAudit = false;

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe('ENABLE_BOOKING_AUDIT is off');
  });

  it('skips when advisory lock not acquired', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: false }]),
      });
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe('lock_held');
  });

  it('detects drift and fixes when delta <= 5', async () => {
    const driftRows = [{ id: 'listing-1', actual: 3, expected: 2 }];
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce(driftRows),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      return fn(tx);
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.reconciled).toBe(1);
  });

  it('calls markListingsDirty after auto-fix', async () => {
    const driftRows = [{ id: 'listing-1', actual: 3, expected: 2 }];
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce(driftRows),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      return fn(tx);
    });

    await GET(createRequest('Bearer valid'));
    expect(markListingsDirty).toHaveBeenCalledWith(['listing-1'], 'reconcile_slots');
  });

  it('does NOT auto-fix when abs(delta) > 5', async () => {
    const driftRows = [{ id: 'listing-1', actual: 10, expected: 2 }];
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce(driftRows),
        $executeRaw: jest.fn(),
      };
      return fn(tx);
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.reconciled).toBe(0);
    expect(data.alertedOnly).toBe(1);
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });

  it('returns zero reconciled when no drift found', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.reconciled).toBe(0);
    expect(data.drifted).toBe(0);
  });
});
