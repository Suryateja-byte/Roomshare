/**
 * Tests for saved-search server actions
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    savedSearch: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
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
  saveSearch,
  getMySavedSearches,
  deleteSavedSearch,
  toggleSearchAlert,
  updateSavedSearchName,
} from '@/app/actions/saved-search'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'

describe('Saved Search Actions', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  const mockFilters = {
    query: 'apartment',
    minPrice: 500,
    maxPrice: 1500,
    roomType: 'Private Room',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('saveSearch', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await saveSearch({ name: 'Test', filters: mockFilters })

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when user has 10 saved searches', async () => {
      ;(prisma.savedSearch.count as jest.Mock).mockResolvedValue(10)

      const result = await saveSearch({ name: 'Test', filters: mockFilters })

      expect(result).toEqual({
        error: 'You can only save up to 10 searches. Please delete some to save new ones.',
      })
    })

    it('saves search successfully', async () => {
      ;(prisma.savedSearch.count as jest.Mock).mockResolvedValue(5)
      ;(prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: 'search-123',
      })

      const result = await saveSearch({
        name: 'My Search',
        filters: mockFilters,
        alertEnabled: true,
      })

      expect(prisma.savedSearch.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          name: 'My Search',
          query: 'apartment',
          filters: expect.objectContaining({
            query: 'apartment',
            minPrice: 500,
            maxPrice: 1500,
            roomType: 'Private Room',
          }),
          alertEnabled: true,
          alertFrequency: 'DAILY',
        },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/saved-searches')
      expect(result).toEqual({ success: true, searchId: 'search-123' })
    })

    it('defaults alertEnabled to true', async () => {
      ;(prisma.savedSearch.count as jest.Mock).mockResolvedValue(0)
      ;(prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: 'search-123',
      })

      await saveSearch({ name: 'Test', filters: mockFilters })

      expect(prisma.savedSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertEnabled: true,
            alertFrequency: 'DAILY',
          }),
        })
      )
    })

    it('handles database errors', async () => {
      ;(prisma.savedSearch.count as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await saveSearch({ name: 'Test', filters: mockFilters })

      expect(result).toEqual({ error: 'Failed to save search' })
    })
  })

  describe('getMySavedSearches', () => {
    it('returns empty array when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getMySavedSearches()

      expect(result).toEqual([])
    })

    it('returns user saved searches', async () => {
      const mockSearches = [
        { id: 's1', name: 'Search 1', filters: {} },
        { id: 's2', name: 'Search 2', filters: {} },
      ]
      ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue(mockSearches)

      const result = await getMySavedSearches()

      expect(prisma.savedSearch.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      })
      expect(result).toEqual(mockSearches)
    })

    it('returns empty array on error', async () => {
      ;(prisma.savedSearch.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getMySavedSearches()

      expect(result).toEqual([])
    })
  })

  describe('deleteSavedSearch', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await deleteSavedSearch('search-123')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('deletes search successfully', async () => {
      ;(prisma.savedSearch.delete as jest.Mock).mockResolvedValue({})

      const result = await deleteSavedSearch('search-123')

      expect(prisma.savedSearch.delete).toHaveBeenCalledWith({
        where: {
          id: 'search-123',
          userId: 'user-123',
        },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/saved-searches')
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.savedSearch.delete as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await deleteSavedSearch('search-123')

      expect(result).toEqual({ error: 'Failed to delete saved search' })
    })
  })

  describe('toggleSearchAlert', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await toggleSearchAlert('search-123', true)

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('enables alert', async () => {
      ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

      const result = await toggleSearchAlert('search-123', true)

      expect(prisma.savedSearch.update).toHaveBeenCalledWith({
        where: {
          id: 'search-123',
          userId: 'user-123',
        },
        data: { alertEnabled: true },
      })
      expect(result).toEqual({ success: true })
    })

    it('disables alert', async () => {
      ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

      const result = await toggleSearchAlert('search-123', false)

      expect(prisma.savedSearch.update).toHaveBeenCalledWith({
        where: {
          id: 'search-123',
          userId: 'user-123',
        },
        data: { alertEnabled: false },
      })
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.savedSearch.update as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await toggleSearchAlert('search-123', true)

      expect(result).toEqual({ error: 'Failed to update alert setting' })
    })
  })

  describe('updateSavedSearchName', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await updateSavedSearchName('search-123', 'New Name')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('updates name successfully', async () => {
      ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

      const result = await updateSavedSearchName('search-123', 'Updated Name')

      expect(prisma.savedSearch.update).toHaveBeenCalledWith({
        where: {
          id: 'search-123',
          userId: 'user-123',
        },
        data: { name: 'Updated Name' },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/saved-searches')
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.savedSearch.update as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await updateSavedSearchName('search-123', 'New Name')

      expect(result).toEqual({ error: 'Failed to update search name' })
    })
  })
})
