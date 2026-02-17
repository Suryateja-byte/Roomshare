/**
 * Tests for suspension server actions
 *
 * Verifies checkSuspension and checkEmailVerified behavior
 * for normal users, suspended users, and bypass attempts.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

import { checkSuspension, checkEmailVerified } from '@/app/actions/suspension'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

describe('suspension actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('checkSuspension', () => {
    it('returns { suspended: false } for a normal (non-suspended) user', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-123' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuspended: false,
      })

      const result = await checkSuspension()

      expect(result).toEqual({ suspended: false })
    })

    it('returns { suspended: true } with error message for suspended user', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-456' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuspended: true,
      })

      const result = await checkSuspension()

      expect(result).toEqual({ suspended: true, error: 'Account suspended' })
    })

    it('returns { suspended: false } when no session exists (unauthenticated)', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await checkSuspension()

      expect(result).toEqual({ suspended: false })
      // Should not query the database when there is no session
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('returns { suspended: false } when session has no user', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: null })

      const result = await checkSuspension()

      expect(result).toEqual({ suspended: false })
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('returns { suspended: false } when session.user has no id', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { id: undefined } })

      const result = await checkSuspension()

      expect(result).toEqual({ suspended: false })
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('queries DB with the correct userId from session', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-789' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuspended: false,
      })

      await checkSuspension()

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-789' },
        select: { isSuspended: true },
      })
    })

    it('returns { suspended: false } when user not found in DB', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'nonexistent-user' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await checkSuspension()

      expect(result).toEqual({ suspended: false })
    })
  })

  describe('checkEmailVerified', () => {
    it('returns { verified: true } for a user with verified email', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-123' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        emailVerified: new Date('2024-01-01'),
      })

      const result = await checkEmailVerified()

      expect(result).toEqual({ verified: true })
    })

    it('returns { verified: false } with error for unverified email', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-456' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        emailVerified: null,
      })

      const result = await checkEmailVerified()

      expect(result).toEqual({
        verified: false,
        error: 'Please verify your email to continue',
      })
    })

    it('returns { verified: false } when no session exists (unauthenticated)', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await checkEmailVerified()

      expect(result).toEqual({ verified: false })
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('returns { verified: false } when session.user has no id', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { id: undefined } })

      const result = await checkEmailVerified()

      expect(result).toEqual({ verified: false })
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('queries DB with correct userId and select field', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-check' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        emailVerified: new Date(),
      })

      await checkEmailVerified()

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-check' },
        select: { emailVerified: true },
      })
    })

    it('returns { verified: false } when user not found in DB', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'ghost-user' },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await checkEmailVerified()

      expect(result).toEqual({
        verified: false,
        error: 'Please verify your email to continue',
      })
    })
  })
})
