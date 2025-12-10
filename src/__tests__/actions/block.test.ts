/**
 * Tests for block server actions
 */

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    blockedUser: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

import {
  blockUser,
  unblockUser,
  getBlockedUsers,
  isBlocked,
  getBlockStatus,
  checkBlockBeforeAction,
} from '@/app/actions/block'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'

describe('block actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const mockBlockedUserData = {
    id: 'block-123',
    blockerId: 'user-123',
    blockedId: 'other-user-456',
    createdAt: new Date('2025-01-01'),
    blocked: {
      id: 'other-user-456',
      name: 'Other User',
      image: '/avatar.jpg',
      email: 'other@example.com',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('blockUser', () => {
    describe('authentication', () => {
      it('returns error when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await blockUser('other-user-456')

        expect(result.error).toBe('Unauthorized')
      })

      it('returns error when user id is missing', async () => {
        ;(auth as jest.Mock).mockResolvedValue({ user: {} })

        const result = await blockUser('other-user-456')

        expect(result.error).toBe('Unauthorized')
      })
    })

    describe('validation', () => {
      it('returns error when trying to block self', async () => {
        const result = await blockUser('user-123')

        expect(result.error).toBe('You cannot block yourself')
      })

      it('returns error when user is already blocked', async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock).mockResolvedValue(mockBlockedUserData)

        const result = await blockUser('other-user-456')

        expect(result.error).toBe('User is already blocked')
      })
    })

    describe('success', () => {
      beforeEach(() => {
        ;(prisma.blockedUser.findUnique as jest.Mock).mockResolvedValue(null)
        ;(prisma.blockedUser.create as jest.Mock).mockResolvedValue(mockBlockedUserData)
      })

      it('creates blockedUser record', async () => {
        await blockUser('other-user-456')

        expect(prisma.blockedUser.create).toHaveBeenCalledWith({
          data: {
            blockerId: 'user-123',
            blockedId: 'other-user-456',
          },
        })
      })

      it('revalidates /messages path', async () => {
        await blockUser('other-user-456')

        expect(revalidatePath).toHaveBeenCalledWith('/messages')
      })

      it('revalidates /settings path', async () => {
        await blockUser('other-user-456')

        expect(revalidatePath).toHaveBeenCalledWith('/settings')
      })

      it('returns success: true', async () => {
        const result = await blockUser('other-user-456')

        expect(result.success).toBe(true)
      })
    })

    describe('error handling', () => {
      it('returns error on database failure', async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock).mockResolvedValue(null)
        ;(prisma.blockedUser.create as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await blockUser('other-user-456')

        expect(result.error).toBe('Failed to block user')
      })
    })
  })

  describe('unblockUser', () => {
    describe('authentication', () => {
      it('returns error when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await unblockUser('other-user-456')

        expect(result.error).toBe('Unauthorized')
      })
    })

    describe('success', () => {
      beforeEach(() => {
        ;(prisma.blockedUser.delete as jest.Mock).mockResolvedValue(mockBlockedUserData)
      })

      it('deletes blockedUser record', async () => {
        await unblockUser('other-user-456')

        expect(prisma.blockedUser.delete).toHaveBeenCalledWith({
          where: {
            blockerId_blockedId: {
              blockerId: 'user-123',
              blockedId: 'other-user-456',
            },
          },
        })
      })

      it('revalidates paths', async () => {
        await unblockUser('other-user-456')

        expect(revalidatePath).toHaveBeenCalledWith('/messages')
        expect(revalidatePath).toHaveBeenCalledWith('/settings')
      })

      it('returns success: true', async () => {
        const result = await unblockUser('other-user-456')

        expect(result.success).toBe(true)
      })
    })

    describe('error handling', () => {
      it('returns error on database failure', async () => {
        ;(prisma.blockedUser.delete as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await unblockUser('other-user-456')

        expect(result.error).toBe('Failed to unblock user')
      })
    })
  })

  describe('getBlockedUsers', () => {
    describe('authentication', () => {
      it('returns empty array when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await getBlockedUsers()

        expect(result).toEqual([])
      })
    })

    describe('success', () => {
      const mockBlockedRecords = [
        mockBlockedUserData,
        {
          id: 'block-456',
          blockerId: 'user-123',
          blockedId: 'another-user-789',
          createdAt: new Date('2025-01-02'),
          blocked: {
            id: 'another-user-789',
            name: 'Another User',
            image: null,
            email: 'another@example.com',
          },
        },
      ]

      beforeEach(() => {
        ;(prisma.blockedUser.findMany as jest.Mock).mockResolvedValue(mockBlockedRecords)
      })

      it('returns blocked users with user data', async () => {
        const result = await getBlockedUsers()

        expect(result).toHaveLength(2)
        expect(result[0].user.name).toBe('Other User')
        expect(result[1].user.name).toBe('Another User')
      })

      it('includes blockedAt timestamp', async () => {
        const result = await getBlockedUsers()

        expect(result[0].blockedAt).toEqual(new Date('2025-01-01'))
      })

      it('orders by createdAt descending', async () => {
        await getBlockedUsers()

        expect(prisma.blockedUser.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { createdAt: 'desc' },
          })
        )
      })
    })

    describe('error handling', () => {
      it('returns empty array on database failure', async () => {
        ;(prisma.blockedUser.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await getBlockedUsers()

        expect(result).toEqual([])
      })
    })
  })

  describe('isBlocked', () => {
    describe('authentication', () => {
      it('returns false when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await isBlocked('other-user-456')

        expect(result).toBe(false)
      })
    })

    describe('bidirectional check', () => {
      it('returns true when current user blocked target', async () => {
        ;(prisma.blockedUser.findFirst as jest.Mock).mockResolvedValue({
          blockerId: 'user-123',
          blockedId: 'other-user-456',
        })

        const result = await isBlocked('other-user-456')

        expect(result).toBe(true)
      })

      it('returns true when target blocked current user', async () => {
        ;(prisma.blockedUser.findFirst as jest.Mock).mockResolvedValue({
          blockerId: 'other-user-456',
          blockedId: 'user-123',
        })

        const result = await isBlocked('other-user-456')

        expect(result).toBe(true)
      })

      it('returns false when no block exists', async () => {
        ;(prisma.blockedUser.findFirst as jest.Mock).mockResolvedValue(null)

        const result = await isBlocked('other-user-456')

        expect(result).toBe(false)
      })

      it('checks both directions in query', async () => {
        ;(prisma.blockedUser.findFirst as jest.Mock).mockResolvedValue(null)

        await isBlocked('other-user-456')

        expect(prisma.blockedUser.findFirst).toHaveBeenCalledWith({
          where: {
            OR: [
              { blockerId: 'user-123', blockedId: 'other-user-456' },
              { blockerId: 'other-user-456', blockedId: 'user-123' },
            ],
          },
        })
      })
    })

    describe('error handling', () => {
      it('returns false on database failure', async () => {
        ;(prisma.blockedUser.findFirst as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await isBlocked('other-user-456')

        expect(result).toBe(false)
      })
    })
  })

  describe('getBlockStatus', () => {
    beforeEach(() => {
      // Clear findUnique mock before each test in this block
      ;(prisma.blockedUser.findUnique as jest.Mock).mockReset()
    })

    describe('authentication', () => {
      it('returns null when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await getBlockStatus('other-user-456')

        expect(result).toBeNull()
      })
    })

    describe('status determination', () => {
      it("returns 'blocker' when current user blocked target", async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock)
          .mockResolvedValueOnce({ blockerId: 'user-123', blockedId: 'other-user-456' }) // blockedByMe

        const result = await getBlockStatus('other-user-456')

        expect(result).toBe('blocker')
      })

      it("returns 'blocked' when target blocked current user", async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock)
          .mockResolvedValueOnce(null) // blockedByMe
          .mockResolvedValueOnce({ blockerId: 'other-user-456', blockedId: 'user-123' }) // blockedByThem

        const result = await getBlockStatus('other-user-456')

        expect(result).toBe('blocked')
      })

      it('returns null when no block exists', async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)

        const result = await getBlockStatus('other-user-456')

        expect(result).toBeNull()
      })

      it('prioritizes blocker status if both exist', async () => {
        // If current user blocked target, return 'blocker' without checking if blocked
        ;(prisma.blockedUser.findUnique as jest.Mock).mockResolvedValueOnce({
          blockerId: 'user-123',
          blockedId: 'other-user-456',
        })

        const result = await getBlockStatus('other-user-456')

        expect(result).toBe('blocker')
        // Second call should not have been made
        expect(prisma.blockedUser.findUnique).toHaveBeenCalledTimes(1)
      })
    })

    describe('error handling', () => {
      it('returns null on database failure', async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await getBlockStatus('other-user-456')

        expect(result).toBeNull()
      })
    })
  })

  describe('checkBlockBeforeAction', () => {
    beforeEach(() => {
      // Clear findUnique mock before each test in this block
      ;(prisma.blockedUser.findUnique as jest.Mock).mockReset()
    })

    describe('authentication', () => {
      it('returns not allowed when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await checkBlockBeforeAction('other-user-456')

        expect(result.allowed).toBe(false)
        expect(result.message).toBe('Unauthorized')
      })
    })

    describe('block status checks', () => {
      it('returns not allowed with message when blocked by target', async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock)
          .mockResolvedValueOnce(null) // blockedByMe
          .mockResolvedValueOnce({ blockerId: 'other-user-456', blockedId: 'user-123' }) // blockedByThem

        const result = await checkBlockBeforeAction('other-user-456')

        expect(result.allowed).toBe(false)
        expect(result.message).toBe('This user has blocked you')
      })

      it('returns not allowed with message when blocking target', async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock)
          .mockResolvedValueOnce({ blockerId: 'user-123', blockedId: 'other-user-456' }) // blockedByMe

        const result = await checkBlockBeforeAction('other-user-456')

        expect(result.allowed).toBe(false)
        expect(result.message).toBe('You have blocked this user. Unblock them to interact.')
      })

      it('returns allowed when no block exists', async () => {
        ;(prisma.blockedUser.findUnique as jest.Mock)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)

        const result = await checkBlockBeforeAction('other-user-456')

        expect(result.allowed).toBe(true)
        expect(result.message).toBeUndefined()
      })
    })
  })
})
