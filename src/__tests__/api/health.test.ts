/**
 * Tests for health check endpoints:
 * - GET /api/health/live  (liveness probe)
 * - GET /api/health/ready (readiness probe)
 *
 * These endpoints are used by load balancers and k8s probes.
 * Live should always return 200 if the process is running.
 * Ready checks database connectivity and shutdown state.
 */

// Must mock shutdown before importing routes
jest.mock('@/lib/shutdown', () => ({
  isInShutdownMode: jest.fn().mockReturnValue(false),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}))

// Mock NextResponse to capture Cache-Control headers
jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: (data: unknown, init?: { status?: number }) => {
        const headersMap = new Map<string, string>()
        return {
          status: init?.status || 200,
          json: async () => data,
          headers: {
            set: (key: string, value: string) => headersMap.set(key, value),
            get: (key: string) => headersMap.get(key),
          },
        }
      },
    },
  }
})

import { isInShutdownMode } from '@/lib/shutdown'
import { prisma } from '@/lib/prisma'

describe('Health Endpoints', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    ;(isInShutdownMode as jest.Mock).mockReturnValue(false)
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('GET /api/health/live', () => {
    let liveGET: () => Promise<any>

    beforeAll(async () => {
      const mod = await import('@/app/api/health/live/route')
      liveGET = mod.GET
    })

    it('returns 200 when application is alive', async () => {
      const response = await liveGET()

      expect(response.status).toBe(200)
    })

    it('includes status field set to "alive"', async () => {
      const response = await liveGET()
      const data = await response.json()

      expect(data.status).toBe('alive')
    })

    it('includes timestamp field', async () => {
      const response = await liveGET()
      const data = await response.json()

      expect(data.timestamp).toBeDefined()
      // Verify it's a valid ISO date string
      expect(() => new Date(data.timestamp)).not.toThrow()
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp)
    })

    it('includes version field', async () => {
      const response = await liveGET()
      const data = await response.json()

      expect(data.version).toBeDefined()
    })

    it('uses "dev" as version when VERCEL_GIT_COMMIT_SHA is not set', async () => {
      delete process.env.VERCEL_GIT_COMMIT_SHA

      const response = await liveGET()
      const data = await response.json()

      expect(data.version).toBe('dev')
    })

    it('uses truncated commit SHA when available', async () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234567890'

      const response = await liveGET()
      const data = await response.json()

      expect(data.version).toBe('abc1234')
    })

    it('sets no-cache headers', async () => {
      const response = await liveGET()

      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
    })
  })

  describe('GET /api/health/ready', () => {
    let readyGET: () => Promise<any>

    beforeAll(async () => {
      const mod = await import('@/app/api/health/ready/route')
      readyGET = mod.GET
    })

    describe('when healthy', () => {
      beforeEach(() => {
        ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }])
      })

      it('returns 200 when all checks pass', async () => {
        const response = await readyGET()

        expect(response.status).toBe(200)
      })

      it('returns status "ready"', async () => {
        const response = await readyGET()
        const data = await response.json()

        expect(data.status).toBe('ready')
      })

      it('includes timestamp field', async () => {
        const response = await readyGET()
        const data = await response.json()

        expect(data.timestamp).toBeDefined()
      })

      it('includes version field', async () => {
        const response = await readyGET()
        const data = await response.json()

        expect(data.version).toBeDefined()
      })

      it('includes database check with ok status', async () => {
        const response = await readyGET()
        const data = await response.json()

        expect(data.checks).toBeDefined()
        expect(data.checks.database.status).toBe('ok')
        expect(data.checks.database.latency).toBeUndefined()
      })

      it('sets no-cache headers', async () => {
        const response = await readyGET()

        expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      })
    })

    describe('when database is down', () => {
      beforeEach(() => {
        ;(prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'))
      })

      it('returns 503 when database check fails', async () => {
        const response = await readyGET()

        expect(response.status).toBe(503)
      })

      it('returns status "unhealthy"', async () => {
        const response = await readyGET()
        const data = await response.json()

        expect(data.status).toBe('unhealthy')
      })

      it('includes database check with error status', async () => {
        const response = await readyGET()
        const data = await response.json()

        expect(data.checks.database.status).toBe('error')
        expect(data.checks.database.error).toBeUndefined()
      })
    })

    describe('when shutting down', () => {
      it('returns 503 during graceful shutdown', async () => {
        ;(isInShutdownMode as jest.Mock).mockReturnValue(true)

        const response = await readyGET()

        expect(response.status).toBe(503)
      })

      it('returns status "draining" during shutdown', async () => {
        ;(isInShutdownMode as jest.Mock).mockReturnValue(true)

        const response = await readyGET()
        const data = await response.json()

        expect(data.status).toBe('draining')
        expect(data.message).toBe('Application is shutting down')
      })

      it('includes timestamp during shutdown', async () => {
        ;(isInShutdownMode as jest.Mock).mockReturnValue(true)

        const response = await readyGET()
        const data = await response.json()

        expect(data.timestamp).toBeDefined()
      })
    })

    describe('Redis check', () => {
      beforeEach(() => {
        ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }])
      })

      it('reports redis as ok when not configured (DB fallback)', async () => {
        delete process.env.UPSTASH_REDIS_REST_URL
        delete process.env.UPSTASH_REDIS_REST_TOKEN

        const response = await readyGET()
        const data = await response.json()

        expect(data.checks.redis.status).toBe('ok')
      })
    })
  })
})
