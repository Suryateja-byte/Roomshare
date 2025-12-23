/**
 * Tests for profile server actions
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

import { updateProfile, getProfile } from '@/app/actions/profile'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'

describe('Profile Actions', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('updateProfile', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await updateProfile({ name: 'Test' })

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('updates profile with valid data', async () => {
      ;(prisma.user.update as jest.Mock).mockResolvedValue({
        id: 'user-123',
        name: 'Updated Name',
      })

      const result = await updateProfile({
        name: 'Updated Name',
        bio: 'My bio',
        countryOfOrigin: 'USA',
        languages: ['English', 'Spanish'],
      })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          name: 'Updated Name',
          bio: 'My bio',
          countryOfOrigin: 'USA',
          languages: ['English', 'Spanish'],
          image: null,
        },
      })
      expect(result).toEqual({ success: true })
    })

    it('revalidates paths after update', async () => {
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})

      await updateProfile({ name: 'Test' })

      expect(revalidatePath).toHaveBeenCalledWith('/profile')
      expect(revalidatePath).toHaveBeenCalledWith('/users/user-123')
    })

    it('returns validation error for invalid name', async () => {
      const result = await updateProfile({ name: '' })

      expect(result.error).toBeDefined()
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('returns validation error for bio too long', async () => {
      const longBio = 'a'.repeat(501)
      const result = await updateProfile({ name: 'Test', bio: longBio })

      expect(result.error).toBeDefined()
    })

    it('handles database errors', async () => {
      ;(prisma.user.update as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await updateProfile({ name: 'Test' })

      expect(result).toEqual({ error: 'Failed to update profile' })
    })

    it('handles null values correctly', async () => {
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})

      await updateProfile({
        name: 'Test',
        bio: null,
        countryOfOrigin: null,
        image: null,
      })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          name: 'Test',
          bio: null,
          countryOfOrigin: null,
          languages: [],
          image: null,
        },
      })
    })
  })

  describe('getProfile', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getProfile()

      expect(result).toEqual({ error: 'Unauthorized', user: null })
    })

    it('returns user profile data', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        image: '/avatar.jpg',
        bio: 'My bio',
        countryOfOrigin: 'USA',
        languages: ['English'],
        isVerified: true,
        emailVerified: new Date(),
      }
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)

      const result = await getProfile()

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          bio: true,
          countryOfOrigin: true,
          languages: true,
          isVerified: true,
          emailVerified: true,
        },
      })
      expect(result).toEqual({ user: mockUser, error: null })
    })

    it('handles database errors', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getProfile()

      expect(result).toEqual({ error: 'Failed to fetch profile', user: null })
    })
  })
})
