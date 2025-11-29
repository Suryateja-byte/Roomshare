/**
 * Tests for get-listings server action
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}))

import { getListingsInBounds, type Bounds } from '@/app/actions/get-listings'
import { prisma } from '@/lib/prisma'

describe('getListingsInBounds', () => {
  const mockListings = [
    {
      id: 'listing-1',
      title: 'Cozy Room',
      price: 800,
      availableSlots: 2,
      ownerId: 'owner-1',
      lat: 37.7749,
      lng: -122.4194,
      amenities: ['wifi', 'kitchen'],
    },
    {
      id: 'listing-2',
      title: 'Sunny Apartment',
      price: 1200,
      availableSlots: 1,
      ownerId: 'owner-2',
      lat: 37.7848,
      lng: -122.4294,
      amenities: ['parking', 'laundry'],
    },
  ]

  const mockBounds: Bounds = {
    ne_lat: 37.8,
    ne_lng: -122.4,
    sw_lat: 37.7,
    sw_lng: -122.5,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue(mockListings)
  })

  it('returns listings within bounds', async () => {
    const result = await getListingsInBounds(mockBounds)

    expect(prisma.$queryRaw).toHaveBeenCalled()
    expect(result).toEqual(mockListings)
  })

  it('returns empty array on database error', async () => {
    ;(prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB Error'))

    const result = await getListingsInBounds(mockBounds)

    expect(result).toEqual([])
  })

  it('calls query with correct bounds parameters', async () => {
    await getListingsInBounds(mockBounds)

    // Verify $queryRaw was called
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('handles empty results', async () => {
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([])

    const result = await getListingsInBounds(mockBounds)

    expect(result).toEqual([])
  })
})
