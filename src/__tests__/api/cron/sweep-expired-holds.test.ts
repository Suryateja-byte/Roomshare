/**
 * Tests for GET /api/cron/sweep-expired-holds route (Phase 4 - Soft Holds)
 *
 * Tests cron auth validation, feature flag gating, advisory lock contention,
 * expired hold processing with slot restoration, version bumps, notifications
 * outside tx, empty batches, and partial batch failure resilience.
 */

jest.mock('@/lib/booking-audit', () => ({ logBookingAudit: jest.fn() }));

// --- Mocks (must be before imports) ---

const mockQueryRaw = jest.fn()
const mockExecuteRaw = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}))

jest.mock('@/lib/cron-auth', () => ({
  validateCronAuth: jest.fn(),
}))

jest.mock('@/lib/env', () => ({
  features: {
    softHoldsEnabled: true,
    softHoldsDraining: false,
  },
}))

jest.mock('@/lib/notifications', () => ({
  createInternalNotification: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
}))

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers
    constructor(url: string, init?: RequestInit) {
      super(url, init)
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}))

import { GET } from '@/app/api/cron/sweep-expired-holds/route'
import { prisma } from '@/lib/prisma'
import { validateCronAuth } from '@/lib/cron-auth'
import { features } from '@/lib/env'
import { createInternalNotification } from '@/lib/notifications'
import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'
import { logBookingAudit } from '@/lib/booking-audit'

// --- Helpers ---

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (authHeader) {
    headers['authorization'] = authHeader
  }
  return new NextRequest(
    'http://localhost:3000/api/cron/sweep-expired-holds',
    { method: 'GET', headers }
  )
}

/** Build a mock expired booking row matching the raw SQL query shape */
function makeExpiredHold(overrides: Partial<{
  id: string
  listingId: string
  tenantId: string
  slotsRequested: number
  version: number
  heldUntil: Date
  tenantEmail: string | null
  tenantName: string | null
  listingTitle: string
  hostId: string
  hostEmail: string | null
  hostName: string | null
}> = {}) {
  return {
    id: overrides.id ?? 'booking-1',
    listingId: overrides.listingId ?? 'listing-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    slotsRequested: overrides.slotsRequested ?? 1,
    version: overrides.version ?? 1,
    heldUntil: overrides.heldUntil ?? new Date(Date.now() - 60000),
    tenantEmail: overrides.tenantEmail ?? 'tenant@example.com',
    tenantName: overrides.tenantName ?? 'Tenant One',
    listingTitle: overrides.listingTitle ?? 'Cozy Room',
    hostId: overrides.hostId ?? 'host-1',
    hostEmail: overrides.hostEmail ?? 'host@example.com',
    hostName: overrides.hostName ?? 'Host One',
  }
}

/**
 * Sets up prisma.$transaction to invoke the callback with a mock tx object
 * and return the callback result.
 */
function setupTransaction(opts: {
  lockAcquired?: boolean
  expiredBookings?: ReturnType<typeof makeExpiredHold>[]
  executeRawError?: Error | null
}) {
  const {
    lockAcquired = true,
    expiredBookings = [],
    executeRawError = null,
  } = opts

  // Reset per-call tracking
  mockQueryRaw.mockReset()
  mockExecuteRaw.mockReset()

  // First $queryRaw call = advisory lock, second = find expired bookings
  let queryRawCallIndex = 0
  mockQueryRaw.mockImplementation(() => {
    queryRawCallIndex++
    if (queryRawCallIndex === 1) {
      // Advisory lock query
      return Promise.resolve([{ locked: lockAcquired }])
    }
    // Expired bookings query
    return Promise.resolve(expiredBookings)
  })

  if (executeRawError) {
    mockExecuteRaw.mockRejectedValue(executeRawError)
  } else {
    mockExecuteRaw.mockResolvedValue(1)
  }

  ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: Function) => {
    const tx = {
      $queryRaw: mockQueryRaw,
      $executeRaw: mockExecuteRaw,
    }
    return cb(tx)
  })
}

// --- Test suite ---

describe('GET /api/cron/sweep-expired-holds', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default: auth passes (returns null = no error)
    ;(validateCronAuth as jest.Mock).mockReturnValue(null)

    // Default: feature flag ON
    Object.defineProperty(features, 'softHoldsEnabled', { value: true, writable: true })
    Object.defineProperty(features, 'softHoldsDraining', { value: false, writable: true })

    // Default: notifications succeed
    ;(createInternalNotification as jest.Mock).mockResolvedValue({ success: true })
  })

  // -------------------------------------------------------
  // 1. Sweeper expires holds
  // -------------------------------------------------------
  it('expires HELD bookings, sets EXPIRED status, and restores listing slots', async () => {
    const hold1 = makeExpiredHold({ id: 'b-1', slotsRequested: 2 })
    const hold2 = makeExpiredHold({ id: 'b-2', slotsRequested: 1, listingId: 'listing-2' })
    setupTransaction({ expiredBookings: [hold1, hold2] })

    const response = await GET(createRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.expired).toBe(2)
    expect(data.skipped).toBe(false)

    // Should have called $executeRaw 4 times: 2 bookings x (UPDATE Booking + UPDATE Listing)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(4)
  })

  // -------------------------------------------------------
  // 2. Version bump: version = version + 1
  // -------------------------------------------------------
  it('bumps booking version in the UPDATE statement', async () => {
    const hold = makeExpiredHold({ id: 'b-ver', version: 3 })
    setupTransaction({ expiredBookings: [hold] })

    await GET(createRequest())

    // The first $executeRaw call is the booking update.
    // Since it uses tagged template literals, the first argument is a TemplateStringsArray.
    // We verify the SQL contains "version = version + 1"
    const firstCall = mockExecuteRaw.mock.calls[0]
    // Tagged template calls: first arg is strings array
    const sqlParts = firstCall[0]
    const fullSql = Array.isArray(sqlParts) ? sqlParts.join('?') : String(sqlParts)
    expect(fullSql).toContain('version = version + 1')
  })

  // -------------------------------------------------------
  // 3. Notifications outside tx
  // -------------------------------------------------------
  it('sends notifications after the transaction commits, not inside it', async () => {
    const hold = makeExpiredHold({ id: 'b-notif' })
    setupTransaction({ expiredBookings: [hold] })

    const callOrder: string[] = []

    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: Function) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        $executeRaw: mockExecuteRaw,
      }
      const result = cb(tx)
      callOrder.push('tx-complete')
      return result
    })

    ;(createInternalNotification as jest.Mock).mockImplementation(async () => {
      callOrder.push('notification')
      return { success: true }
    })

    await GET(createRequest())

    // tx-complete should come before notifications
    const txIndex = callOrder.indexOf('tx-complete')
    const firstNotifIndex = callOrder.indexOf('notification')
    expect(txIndex).toBeLessThan(firstNotifIndex)

    // 2 notifications per hold: tenant + host
    expect(createInternalNotification).toHaveBeenCalledTimes(2)

    // Verify tenant notification
    expect(createInternalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: hold.tenantId,
        type: 'BOOKING_HOLD_EXPIRED',
      })
    )

    // Verify host notification
    expect(createInternalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: hold.hostId,
        type: 'BOOKING_EXPIRED',
      })
    )
  })

  // -------------------------------------------------------
  // 4. Advisory lock - skip when held
  // -------------------------------------------------------
  it('skips sweep when advisory lock is already held by another sweeper', async () => {
    setupTransaction({ lockAcquired: false })

    const response = await GET(createRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.expired).toBe(0)
    expect(data.skipped).toBe(true)
    expect(data.reason).toBe('lock_held')

    // No booking queries or updates should have been made
    // queryRaw called once (lock check only), executeRaw never
    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
    expect(mockExecuteRaw).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------
  // 5. Feature flag OFF - skip
  // -------------------------------------------------------
  it('returns early with skipped when soft holds feature is disabled', async () => {
    Object.defineProperty(features, 'softHoldsEnabled', { value: false, writable: true })
    Object.defineProperty(features, 'softHoldsDraining', { value: false, writable: true })

    const response = await GET(createRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.expired).toBe(0)
    expect(data.skipped).toBe(true)
    expect(data.reason).toBe('soft_holds_disabled')

    // No transaction started
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------
  // 6. Feature flag DRAIN - runs
  // -------------------------------------------------------
  it('runs the sweeper in drain mode to expire existing holds', async () => {
    Object.defineProperty(features, 'softHoldsEnabled', { value: false, writable: true })
    Object.defineProperty(features, 'softHoldsDraining', { value: true, writable: true })

    const hold = makeExpiredHold({ id: 'b-drain' })
    setupTransaction({ expiredBookings: [hold] })

    const response = await GET(createRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.expired).toBe(1)
    expect(data.skipped).toBe(false)

    // Transaction was called
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------
  // 7. Empty batch
  // -------------------------------------------------------
  it('returns expired: 0 when no expired holds are found', async () => {
    setupTransaction({ expiredBookings: [] })

    const response = await GET(createRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.expired).toBe(0)

    // Lock was acquired, bookings queried, but no updates
    expect(mockQueryRaw).toHaveBeenCalledTimes(2)
    expect(mockExecuteRaw).not.toHaveBeenCalled()

    // No notifications sent
    expect(createInternalNotification).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------
  // 8. Partial batch failure
  // -------------------------------------------------------
  it('propagates error when one hold fails to expire (tx rolls back)', async () => {
    // In the current implementation, any failure inside the tx callback
    // will cause the entire transaction to reject (Prisma rolls back).
    // The route catches this and returns 500.
    const hold1 = makeExpiredHold({ id: 'b-ok' })
    const hold2 = makeExpiredHold({ id: 'b-fail' })

    // Set up: lock succeeds, finds 2 bookings, first update ok, second throws
    let executeCallCount = 0
    mockQueryRaw.mockReset()
    let queryCallCount = 0
    mockQueryRaw.mockImplementation(() => {
      queryCallCount++
      if (queryCallCount === 1) return Promise.resolve([{ locked: true }])
      return Promise.resolve([hold1, hold2])
    })
    mockExecuteRaw.mockImplementation(() => {
      executeCallCount++
      // First 2 calls succeed (hold1: booking update + listing update)
      if (executeCallCount <= 2) return Promise.resolve(1)
      // Third call (hold2 booking update) throws
      throw new Error('Serialization failure')
    })

    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: Function) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        $executeRaw: mockExecuteRaw,
      }
      return cb(tx)
    })

    const response = await GET(createRequest())
    const data = await response.json()

    // Transaction error causes 500
    expect(response.status).toBe(500)
    expect(data.error).toBe('Sweeper failed')

    // Logger captured the error
    expect(logger.sync.error).toHaveBeenCalledWith(
      '[sweep-expired-holds] Transaction failed',
      expect.objectContaining({ error: 'Serialization failure' })
    )
  })

  // -------------------------------------------------------
  // 9. Cron auth validation
  // -------------------------------------------------------
  it('returns 401 when cron auth validation fails', async () => {
    // Mock validateCronAuth to return a 401 response
    const authErrorResponse = {
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
      headers: new Map(),
    }
    ;(validateCronAuth as jest.Mock).mockReturnValue(authErrorResponse)

    const response = await GET(createRequest())

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')

    // No transaction started
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------
  // 10. Booking audit logging
  // -------------------------------------------------------
  it('calls logBookingAudit with EXPIRED action and SYSTEM actor', async () => {
    const hold = makeExpiredHold({ id: 'b-audit' })
    setupTransaction({ expiredBookings: [hold] })

    const response = await GET(createRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.expired).toBe(1)

    expect(logBookingAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'EXPIRED',
        previousStatus: 'HELD',
        newStatus: 'EXPIRED',
        actorId: null,
        actorType: 'SYSTEM',
      }),
    )
  })

  // -------------------------------------------------------
  // 11. Multi-slot hold scenarios
  // -------------------------------------------------------
  describe('sweeper with multi-slot holds', () => {
    it('restores correct slotsRequested for each hold in batch', async () => {
      // Hold A: slotsRequested=2 on listing X
      // Hold B: slotsRequested=3 on listing Y
      const holdA = makeExpiredHold({ id: 'b-multi-1', listingId: 'listing-x', slotsRequested: 2 })
      const holdB = makeExpiredHold({ id: 'b-multi-2', listingId: 'listing-y', slotsRequested: 3 })
      setupTransaction({ expiredBookings: [holdA, holdB] })

      const response = await GET(createRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.expired).toBe(2)

      // 2 holds × 2 SQL calls each (UPDATE Booking + UPDATE Listing) = 4 total
      expect(mockExecuteRaw).toHaveBeenCalledTimes(4)

      // Collect the SQL strings from each $executeRaw call
      const sqlCalls = mockExecuteRaw.mock.calls.map((call) => {
        const sqlParts = call[0]
        return Array.isArray(sqlParts) ? sqlParts.join('?') : String(sqlParts)
      })

      // The listing-update SQL calls carry the slotsRequested value as a
      // bound parameter (the second element of the tagged-template call).
      // We verify the bound values include 2 and 3 across the four calls.
      const boundValues = mockExecuteRaw.mock.calls.flatMap((call) => call.slice(1))
      expect(boundValues).toContain(2)
      expect(boundValues).toContain(3)

      // Each listing-update SQL should reference availableSlots
      const listingUpdateSqls = sqlCalls.filter((sql) => sql.includes('availableSlots'))
      expect(listingUpdateSqls).toHaveLength(2)
    })

    it('restores slots for multiple holds on same listing', async () => {
      const sharedListingId = 'listing-shared'
      // Two expired holds on the same listing
      const holdA = makeExpiredHold({ id: 'b-same-1', listingId: sharedListingId, slotsRequested: 2 })
      const holdB = makeExpiredHold({ id: 'b-same-2', listingId: sharedListingId, slotsRequested: 1 })
      setupTransaction({ expiredBookings: [holdA, holdB] })

      const response = await GET(createRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.expired).toBe(2)

      // 4 total $executeRaw calls (2 per hold)
      expect(mockExecuteRaw).toHaveBeenCalledTimes(4)

      // Both listing-update calls should target the same listing.
      // The listing ID is passed as a bound parameter to the tagged template.
      const allBoundValues = mockExecuteRaw.mock.calls.flatMap((call) => call.slice(1))
      const listingIdMatches = allBoundValues.filter((v) => v === sharedListingId)
      // One listingId reference per hold's listing-update call
      expect(listingIdMatches.length).toBeGreaterThanOrEqual(2)
    })

    it('slot restoration uses LEAST clamp to prevent overflow', async () => {
      // Hold with slotsRequested=3; listing has availableSlots=4, totalSlots=5.
      // LEAST(availableSlots + slotsRequested, totalSlots) = LEAST(7, 5) = 5.
      // The SQL itself enforces the cap; we verify the template contains LEAST.
      const hold = makeExpiredHold({ id: 'b-clamp', slotsRequested: 3, listingId: 'listing-clamp' })
      setupTransaction({ expiredBookings: [hold] })

      await GET(createRequest())

      // Find the listing-update $executeRaw call (the one whose SQL contains availableSlots)
      const listingUpdateCall = mockExecuteRaw.mock.calls.find((call) => {
        const sqlParts = call[0]
        const sql = Array.isArray(sqlParts) ? sqlParts.join('?') : String(sqlParts)
        return sql.includes('availableSlots')
      })

      expect(listingUpdateCall).toBeDefined()

      const sqlParts = listingUpdateCall![0]
      const fullSql = Array.isArray(sqlParts) ? sqlParts.join('?') : String(sqlParts)
      expect(fullSql.toUpperCase()).toContain('LEAST')
    })
  })
})
