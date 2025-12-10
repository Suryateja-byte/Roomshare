/**
 * Tests for verify email API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    verificationToken: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
    redirect: (url: URL | string) => {
      const urlString = url instanceof URL ? url.toString() : url
      return {
        status: 307,
        headers: new Map([['location', urlString]]),
        json: async () => ({}),
      }
    },
  },
}))

import { GET } from '@/app/api/auth/verify-email/route'
import { prisma } from '@/lib/prisma'

describe('Verify Email API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const createRequest = (token: string | null) => {
    const url = token
      ? `http://localhost:3000/api/auth/verify-email?token=${token}`
      : 'http://localhost:3000/api/auth/verify-email'
    return new Request(url, { method: 'GET' })
  }

  it('verifies email successfully with valid token', async () => {
    const validToken = {
      token: 'valid-token',
      identifier: 'test@example.com',
      expires: new Date(Date.now() + 3600000),
    }
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    ;(prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(validToken)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.user.update as jest.Mock).mockResolvedValue({})
    ;(prisma.verificationToken.delete as jest.Mock).mockResolvedValue({})

    const request = createRequest('valid-token')
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('verified=true')
  })

  it('redirects with error for missing token', async () => {
    const request = createRequest(null)
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('error=missing_token')
  })

  it('redirects with error for invalid token', async () => {
    ;(prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(null)

    const request = createRequest('invalid-token')
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('error=invalid_token')
  })

  it('redirects to expired page for expired token', async () => {
    const expiredToken = {
      token: 'expired-token',
      identifier: 'test@example.com',
      expires: new Date(Date.now() - 3600000),
    }

    ;(prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(expiredToken)
    ;(prisma.verificationToken.delete as jest.Mock).mockResolvedValue({})

    const request = createRequest('expired-token')
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('verify-expired')
    expect(prisma.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: 'expired-token' },
    })
  })

  it('redirects with error when user not found', async () => {
    const validToken = {
      token: 'valid-token',
      identifier: 'nonexistent@example.com',
      expires: new Date(Date.now() + 3600000),
    }

    ;(prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(validToken)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const request = createRequest('valid-token')
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('error=user_not_found')
  })

  it('updates user emailVerified timestamp', async () => {
    const validToken = {
      token: 'valid-token',
      identifier: 'test@example.com',
      expires: new Date(Date.now() + 3600000),
    }
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    ;(prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(validToken)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.user.update as jest.Mock).mockResolvedValue({})
    ;(prisma.verificationToken.delete as jest.Mock).mockResolvedValue({})

    const request = createRequest('valid-token')
    await GET(request)

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: { emailVerified: expect.any(Date) },
    })
  })

  it('deletes token after successful verification', async () => {
    const validToken = {
      token: 'valid-token',
      identifier: 'test@example.com',
      expires: new Date(Date.now() + 3600000),
    }
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    ;(prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(validToken)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.user.update as jest.Mock).mockResolvedValue({})
    ;(prisma.verificationToken.delete as jest.Mock).mockResolvedValue({})

    const request = createRequest('valid-token')
    await GET(request)

    expect(prisma.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: 'valid-token' },
    })
  })

  it('handles database errors gracefully', async () => {
    ;(prisma.verificationToken.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

    const request = createRequest('valid-token')
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('error=verification_failed')
  })

  it('looks up user by email from token identifier', async () => {
    const validToken = {
      token: 'valid-token',
      identifier: 'test@example.com',
      expires: new Date(Date.now() + 3600000),
    }
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    ;(prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(validToken)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.user.update as jest.Mock).mockResolvedValue({})
    ;(prisma.verificationToken.delete as jest.Mock).mockResolvedValue({})

    const request = createRequest('valid-token')
    await GET(request)

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
  })
})
