/**
 * Tests for forgot password API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmail: jest.fn(),
}))

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn(() => null),
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

import { POST } from '@/app/api/auth/forgot-password/route'
import { prisma } from '@/lib/prisma'
import { sendNotificationEmail } from '@/lib/email'
import { withRateLimit } from '@/lib/with-rate-limit'

describe('Forgot Password API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const createRequest = (body: object) =>
    new Request('http://localhost:3000/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    })

  it('sends reset email for existing user', async () => {
    const mockUser = { id: 'user-123', name: 'Test User', email: 'test@example.com' }

    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({})
    ;(prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({})
    ;(sendNotificationEmail as jest.Mock).mockResolvedValue({})

    const request = createRequest({ email: 'test@example.com' })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toContain('If an account with that email exists')
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      'passwordReset',
      'test@example.com',
      expect.objectContaining({
        userName: 'Test User',
        resetLink: expect.stringContaining('token='),
      })
    )
  })

  it('returns same message for non-existent user (prevents enumeration)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const request = createRequest({ email: 'nonexistent@example.com' })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toContain('If an account with that email exists')
    expect(sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('returns error for missing email', async () => {
    const request = createRequest({})
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Email is required')
  })

  it('normalizes email to lowercase', async () => {
    const mockUser = { id: 'user-123', name: 'Test', email: 'test@example.com' }

    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({})
    ;(prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({})
    ;(sendNotificationEmail as jest.Mock).mockResolvedValue({})

    const request = createRequest({ email: 'TEST@EXAMPLE.COM' })
    await POST(request)

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
  })

  it('deletes existing tokens before creating new one', async () => {
    const mockUser = { id: 'user-123', name: 'Test', email: 'test@example.com' }

    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({})
    ;(prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({})
    ;(sendNotificationEmail as jest.Mock).mockResolvedValue({})

    const request = createRequest({ email: 'test@example.com' })
    await POST(request)

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
  })

  it('creates token with 1 hour expiration', async () => {
    const mockUser = { id: 'user-123', name: 'Test', email: 'test@example.com' }

    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({})
    ;(prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({})
    ;(sendNotificationEmail as jest.Mock).mockResolvedValue({})

    const request = createRequest({ email: 'test@example.com' })
    await POST(request)

    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'test@example.com',
        token: expect.any(String),
        expires: expect.any(Date),
      }),
    })

    const createCall = (prisma.passwordResetToken.create as jest.Mock).mock.calls[0][0]
    const expires = createCall.data.expires
    const now = Date.now()
    const oneHourFromNow = now + 60 * 60 * 1000

    expect(expires.getTime()).toBeGreaterThan(now)
    expect(expires.getTime()).toBeLessThanOrEqual(oneHourFromNow + 1000)
  })

  it('handles database errors gracefully', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

    const request = createRequest({ email: 'test@example.com' })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('An error occurred. Please try again.')
  })

  it('applies rate limiting', async () => {
    const request = createRequest({ email: 'test@example.com' })
    await POST(request)

    expect(withRateLimit).toHaveBeenCalledWith(request, { type: 'forgotPassword' })
  })

  it('returns rate limit response when limited', async () => {
    const mockRateLimitResponse = { status: 429, json: async () => ({ error: 'Too many requests' }) }
    ;(withRateLimit as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const request = createRequest({ email: 'test@example.com' })
    const response = await POST(request)

    expect(response).toBe(mockRateLimitResponse)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })
})
