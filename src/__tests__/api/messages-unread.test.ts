/**
 * Tests for messages unread count API route
 */

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/app/actions/chat', () => ({
  getUnreadMessageCount: jest.fn(),
}))

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      error: jest.fn(),
    },
  },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}))

import { GET } from '@/app/api/messages/unread/route'
import { auth } from '@/auth'
import { getUnreadMessageCount } from '@/app/actions/chat'

// Helper to create mock request
const createMockRequest = () => new Request('http://localhost/api/messages/unread')

describe('Messages Unread API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns unread count for authenticated user', async () => {
    const mockSession = { user: { id: 'user-123' } }

    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(getUnreadMessageCount as jest.Mock).mockResolvedValue(5)

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.count).toBe(5)
  })

  it('returns 0 when no unread messages', async () => {
    const mockSession = { user: { id: 'user-123' } }

    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(getUnreadMessageCount as jest.Mock).mockResolvedValue(0)

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.count).toBe(0)
  })

  it('returns 401 when user is not authenticated', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 401 when session has no user id', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: {} })

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('handles errors gracefully', async () => {
    const mockSession = { user: { id: 'user-123' } }

    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(getUnreadMessageCount as jest.Mock).mockRejectedValue(new Error('DB Error'))

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
  })

  it('calls getUnreadMessageCount when authenticated', async () => {
    const mockSession = { user: { id: 'user-123' } }

    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(getUnreadMessageCount as jest.Mock).mockResolvedValue(10)

    await GET(createMockRequest())

    expect(getUnreadMessageCount).toHaveBeenCalled()
  })

  it('does not call getUnreadMessageCount when not authenticated', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    await GET(createMockRequest())

    expect(getUnreadMessageCount).not.toHaveBeenCalled()
  })

  it('returns large unread counts correctly', async () => {
    const mockSession = { user: { id: 'user-123' } }

    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(getUnreadMessageCount as jest.Mock).mockResolvedValue(999)

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.count).toBe(999)
  })
})
