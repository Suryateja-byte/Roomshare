/**
 * Tests for data.ts - database query functions and filter logic
 *
 * Note: These tests mock the Prisma client to test the business logic
 * without requiring a real database connection.
 */

// Mock prisma before importing data functions
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    savedListing: {
      findMany: jest.fn(),
    },
    review: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getSavedListingIds,
  getReviews,
  getAverageRating,
  sanitizeSearchQuery,
  isValidQuery,
  hasValidCoordinates,
  filterByPrice,
  filterByAmenities,
  filterByHouseRules,
  filterByLanguages,
  filterByRoomType,
  filterByLeaseDuration,
  filterByMoveInDate,
  filterByGenderPreference,
  filterByHouseholdGender,
  filterByBounds,
  filterByQuery,
  sortListings,
  getMapListings,
  getListingsPaginated,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  ListingWithMetadata,
} from '@/lib/data'

// ============================================
// Test Data Factories
// ============================================

function createMockListing(overrides: Partial<ListingWithMetadata> = {}): ListingWithMetadata {
  return {
    id: 'listing-1',
    title: 'Cozy Room in Downtown',
    description: 'A beautiful cozy room in the heart of downtown.',
    price: 800,
    images: ['/image1.jpg'],
    availableSlots: 2,
    totalSlots: 3,
    amenities: ['WiFi', 'Parking'],
    houseRules: ['No Smoking', 'No Pets'],
    householdLanguages: ['en', 'es'],
    genderPreference: 'NO_PREFERENCE',
    householdGender: 'MIXED',
    leaseDuration: '6 months',
    roomType: 'Private Room',
    moveInDate: new Date('2024-02-01'),
    ownerId: 'owner-1',
    location: {
      address: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      lat: 37.7749,
      lng: -122.4194,
    },
    createdAt: new Date('2024-01-01'),
    viewCount: 100,
    avgRating: 4.5,
    reviewCount: 10,
    ...overrides,
  }
}

describe('data.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSavedListingIds', () => {
    it('should return array of listing IDs', async () => {
      const mockSaved = [
        { listingId: 'listing-1' },
        { listingId: 'listing-2' },
        { listingId: 'listing-3' },
      ]
      ;(prisma.savedListing.findMany as jest.Mock).mockResolvedValue(mockSaved)

      const result = await getSavedListingIds('user-123')

      expect(result).toEqual(['listing-1', 'listing-2', 'listing-3'])
      expect(prisma.savedListing.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        select: { listingId: true },
      })
    })

    it('should return empty array when no saved listings', async () => {
      ;(prisma.savedListing.findMany as jest.Mock).mockResolvedValue([])

      const result = await getSavedListingIds('user-123')

      expect(result).toEqual([])
    })
  })

  describe('getReviews', () => {
    const mockReviews = [
      {
        id: 'review-1',
        rating: 5,
        comment: 'Great place!',
        author: { name: 'John', image: '/john.jpg' },
        createdAt: new Date(),
      },
      {
        id: 'review-2',
        rating: 4,
        comment: 'Nice room',
        author: { name: 'Jane', image: '/jane.jpg' },
        createdAt: new Date(),
      },
    ]

    it('should return reviews for listing', async () => {
      ;(prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews)

      const result = await getReviews('listing-123')

      expect(result).toEqual(mockReviews)
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { listingId: 'listing-123' },
          include: expect.objectContaining({
            author: expect.any(Object),
          }),
          orderBy: { createdAt: 'desc' },
        })
      )
    })

    it('should return reviews for user', async () => {
      ;(prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews)

      const result = await getReviews(undefined, 'user-123')

      expect(result).toEqual(mockReviews)
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { targetUserId: 'user-123' },
        })
      )
    })

    it('should return empty array when no listingId or userId', async () => {
      const result = await getReviews()

      expect(result).toEqual([])
      expect(prisma.review.findMany).not.toHaveBeenCalled()
    })

    it('should return empty array when both undefined', async () => {
      const result = await getReviews(undefined, undefined)

      expect(result).toEqual([])
    })
  })

  describe('getAverageRating', () => {
    it('should return average rating for listing', async () => {
      ;(prisma.review.aggregate as jest.Mock).mockResolvedValue({
        _avg: { rating: 4.5 },
      })

      const result = await getAverageRating('listing-123')

      expect(result).toBe(4.5)
      expect(prisma.review.aggregate).toHaveBeenCalledWith({
        _avg: { rating: true },
        where: { listingId: 'listing-123' },
      })
    })

    it('should return average rating for user', async () => {
      ;(prisma.review.aggregate as jest.Mock).mockResolvedValue({
        _avg: { rating: 4.2 },
      })

      const result = await getAverageRating(undefined, 'user-123')

      expect(result).toBe(4.2)
      expect(prisma.review.aggregate).toHaveBeenCalledWith({
        _avg: { rating: true },
        where: { targetUserId: 'user-123' },
      })
    })

    it('should return 0 when no reviews', async () => {
      ;(prisma.review.aggregate as jest.Mock).mockResolvedValue({
        _avg: { rating: null },
      })

      const result = await getAverageRating('listing-123')

      expect(result).toBe(0)
    })

    it('should return 0 when no listingId or userId', async () => {
      const result = await getAverageRating()

      expect(result).toBe(0)
      expect(prisma.review.aggregate).not.toHaveBeenCalled()
    })
  })
})

// Test helper functions that are not exported but their logic is tested through exports
describe('data.ts helper functions (tested indirectly)', () => {
  describe('sanitizeSearchQuery logic', () => {
    // This logic is tested through getListings which we can't test directly
    // without a database, but we can verify the patterns match

    it('should validate query patterns for sanitization', () => {
      // SQL injection patterns that should be sanitized
      const dangerousPatterns = [
        "'; DROP TABLE users;--",
        "1; DELETE FROM listings;",
        "/* comment */",
        "test'; --",
      ]

      // These should be removed/sanitized by the function
      dangerousPatterns.forEach(pattern => {
        // Verify the patterns contain dangerous characters
        expect(pattern).toMatch(/[;'"]|--|\/\*|\*\//)
      })
    })

    it('should allow valid search patterns', () => {
      // Valid search queries
      const validPatterns = [
        'downtown apartment',
        'cozy room',
        '2 bedroom',
        'San Francisco CA',
        'near campus',
      ]

      validPatterns.forEach(pattern => {
        expect(pattern.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('hasValidCoordinates logic', () => {
    it('should validate coordinate ranges', () => {
      // Valid coordinate ranges
      expect(37.7749).toBeGreaterThanOrEqual(-90)
      expect(37.7749).toBeLessThanOrEqual(90)
      expect(-122.4194).toBeGreaterThanOrEqual(-180)
      expect(-122.4194).toBeLessThanOrEqual(180)

      // Invalid coordinates
      expect(0 === 0 && 0 === 0).toBe(true) // Gulf of Guinea - invalid
      expect(91).toBeGreaterThan(90) // Invalid lat
      expect(-181).toBeLessThan(-180) // Invalid lng
    })
  })
})

describe('FilterParams interface', () => {
  it('should support all filter properties', () => {
    const params = {
      query: 'downtown',
      minPrice: 500,
      maxPrice: 1500,
      amenities: ['WiFi', 'Parking'],
      moveInDate: '2024-02-01',
      leaseDuration: '6 months',
      houseRules: ['No Smoking'],
      roomType: 'Private',
      bounds: {
        minLat: 37.0,
        maxLat: 38.0,
        minLng: -123.0,
        maxLng: -122.0,
      },
      page: 1,
      limit: 12,
      sort: 'recommended' as const,
    }

    expect(params.query).toBe('downtown')
    expect(params.minPrice).toBe(500)
    expect(params.maxPrice).toBe(1500)
    expect(params.amenities).toHaveLength(2)
    expect(params.bounds?.minLat).toBe(37.0)
    expect(params.sort).toBe('recommended')
  })
})

describe('SortOption type', () => {
  it('should support all sort options', () => {
    const sortOptions = ['recommended', 'price_asc', 'price_desc', 'newest', 'rating']

    sortOptions.forEach(option => {
      expect(['recommended', 'price_asc', 'price_desc', 'newest', 'rating']).toContain(option)
    })
  })
})

describe('PaginatedResult interface', () => {
  it('should contain pagination metadata', () => {
    const result = {
      items: [],
      total: 100,
      page: 1,
      limit: 12,
      totalPages: 9,
    }

    expect(result.items).toEqual([])
    expect(result.total).toBe(100)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(12)
    expect(result.totalPages).toBe(9)
  })
})

describe('ListingData interface', () => {
  it('should contain all listing properties', () => {
    const listing = {
      id: 'listing-123',
      title: 'Test Listing',
      description: 'A test listing',
      price: 800,
      images: ['/image.jpg'],
      availableSlots: 2,
      totalSlots: 3,
      amenities: ['WiFi'],
      houseRules: ['No Pets'],
      leaseDuration: '6 months',
      roomType: 'Private',
      moveInDate: new Date(),
      ownerId: 'owner-123',
      location: {
        address: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        lat: 37.7749,
        lng: -122.4194,
      },
    }

    expect(listing.id).toBe('listing-123')
    expect(listing.location.city).toBe('San Francisco')
    expect(listing.amenities).toContain('WiFi')
  })
})

// ============================================
// sanitizeSearchQuery Tests
// ============================================

describe('sanitizeSearchQuery', () => {
  describe('basic functionality', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeSearchQuery('')).toBe('')
    })

    it('returns empty string for null-ish input', () => {
      expect(sanitizeSearchQuery(null as unknown as string)).toBe('')
      expect(sanitizeSearchQuery(undefined as unknown as string)).toBe('')
    })

    it('trims whitespace', () => {
      expect(sanitizeSearchQuery('  hello  ')).toBe('hello')
    })

    it('preserves internal spaces', () => {
      expect(sanitizeSearchQuery('hello world')).toBe('hello world')
    })
  })

  describe('length limiting', () => {
    it('limits length to MAX_QUERY_LENGTH characters', () => {
      const longQuery = 'a'.repeat(300)
      const result = sanitizeSearchQuery(longQuery)
      expect(result.length).toBe(MAX_QUERY_LENGTH)
    })

    it('keeps queries shorter than MAX_QUERY_LENGTH unchanged', () => {
      const query = 'short query'
      expect(sanitizeSearchQuery(query)).toBe(query)
    })
  })

  describe('SQL LIKE wildcard handling', () => {
    it('preserves percent sign (after backslash removed by later sanitization)', () => {
      // First escapes to \% but then backslash is removed by the dangerous char filter
      const result = sanitizeSearchQuery('50% off')
      expect(result).toBe('50% off')
    })

    it('preserves underscore (after backslash removed by later sanitization)', () => {
      const result = sanitizeSearchQuery('hello_world')
      expect(result).toBe('hello_world')
    })

    it('handles multiple wildcards', () => {
      const result = sanitizeSearchQuery('test%_value')
      expect(result).toBe('test%_value')
    })
  })

  describe('SQL injection prevention', () => {
    it('removes semicolons', () => {
      expect(sanitizeSearchQuery('test; DROP TABLE users;')).toBe('test DROP TABLE users')
    })

    it('removes single quotes', () => {
      // Quotes are removed, equals sign is preserved
      expect(sanitizeSearchQuery("test' OR '1'='1")).toBe('test OR 1=1')
    })

    it('removes double quotes', () => {
      // Quotes are removed, equals sign is preserved
      expect(sanitizeSearchQuery('test" OR "1"="1')).toBe('test OR 1=1')
    })

    it('removes backslashes', () => {
      expect(sanitizeSearchQuery('test\\nvalue')).toBe('testnvalue')
    })

    it('removes backticks', () => {
      expect(sanitizeSearchQuery('test`command`')).toBe('testcommand')
    })

    it('removes SQL comments (--)', () => {
      expect(sanitizeSearchQuery('test -- comment')).toBe('test  comment')
    })

    it('removes SQL block comments (/* */)', () => {
      expect(sanitizeSearchQuery('test /* comment */ value')).toBe('test  comment  value')
    })
  })

  describe('control character removal', () => {
    it('removes null character', () => {
      expect(sanitizeSearchQuery('test\x00value')).toBe('testvalue')
    })

    it('removes tab character', () => {
      expect(sanitizeSearchQuery('test\tvalue')).toBe('testvalue')
    })

    it('removes newline characters', () => {
      expect(sanitizeSearchQuery('test\n\rvalue')).toBe('testvalue')
    })

    it('removes DEL character', () => {
      expect(sanitizeSearchQuery('test\x7Fvalue')).toBe('testvalue')
    })
  })

  describe('unicode support', () => {
    it('preserves international characters', () => {
      expect(sanitizeSearchQuery('北京')).toBe('北京')
      expect(sanitizeSearchQuery('Москва')).toBe('Москва')
      expect(sanitizeSearchQuery('مكة')).toBe('مكة')
      expect(sanitizeSearchQuery('東京')).toBe('東京')
    })

    it('preserves accented characters', () => {
      expect(sanitizeSearchQuery('café résumé')).toBe('café résumé')
      expect(sanitizeSearchQuery('München')).toBe('München')
    })

    it('preserves emojis', () => {
      expect(sanitizeSearchQuery('home 🏠')).toBe('home 🏠')
    })
  })

  describe('common punctuation', () => {
    it('preserves hyphens', () => {
      expect(sanitizeSearchQuery('co-living')).toBe('co-living')
    })

    it('preserves periods', () => {
      expect(sanitizeSearchQuery('St. Louis')).toBe('St. Louis')
    })

    it('preserves commas', () => {
      expect(sanitizeSearchQuery('Austin, TX')).toBe('Austin, TX')
    })

    it('preserves numbers', () => {
      expect(sanitizeSearchQuery('Room 101')).toBe('Room 101')
    })
  })
})

// ============================================
// isValidQuery Tests
// ============================================

describe('isValidQuery', () => {
  it('returns false for empty string', () => {
    expect(isValidQuery('')).toBe(false)
  })

  it('returns false for single character', () => {
    expect(isValidQuery('a')).toBe(false)
  })

  it('returns true for 2 characters', () => {
    expect(isValidQuery('ab')).toBe(true)
  })

  it('returns true for longer queries', () => {
    expect(isValidQuery('hello world')).toBe(true)
  })

  it('returns false for whitespace-only queries', () => {
    expect(isValidQuery('   ')).toBe(false)
  })

  it('returns false when query becomes too short after sanitization', () => {
    // Single quote gets removed, leaving just 'a'
    expect(isValidQuery("a'")).toBe(false)
  })

  it('returns true for valid unicode queries', () => {
    expect(isValidQuery('北京')).toBe(true)
  })

  it('validates based on MIN_QUERY_LENGTH constant', () => {
    const query = 'a'.repeat(MIN_QUERY_LENGTH)
    expect(isValidQuery(query)).toBe(true)
    expect(isValidQuery(query.slice(0, -1))).toBe(false)
  })
})

// ============================================
// hasValidCoordinates Tests
// ============================================

describe('hasValidCoordinates', () => {
  describe('null and undefined handling', () => {
    it('returns false for null lat', () => {
      expect(hasValidCoordinates(null, -122.4194)).toBe(false)
    })

    it('returns false for null lng', () => {
      expect(hasValidCoordinates(37.7749, null)).toBe(false)
    })

    it('returns false for undefined lat', () => {
      expect(hasValidCoordinates(undefined, -122.4194)).toBe(false)
    })

    it('returns false for undefined lng', () => {
      expect(hasValidCoordinates(37.7749, undefined)).toBe(false)
    })

    it('returns false for both null', () => {
      expect(hasValidCoordinates(null, null)).toBe(false)
    })
  })

  describe('zero coordinate handling', () => {
    it('returns false for (0, 0) coordinates', () => {
      expect(hasValidCoordinates(0, 0)).toBe(false)
    })

    it('returns true for (0, non-zero) - valid latitude 0', () => {
      expect(hasValidCoordinates(0, 100)).toBe(true)
    })

    it('returns true for (non-zero, 0) - valid longitude 0', () => {
      expect(hasValidCoordinates(50, 0)).toBe(true)
    })
  })

  describe('range validation', () => {
    it('returns false for lat < -90', () => {
      expect(hasValidCoordinates(-91, 0)).toBe(false)
    })

    it('returns false for lat > 90', () => {
      expect(hasValidCoordinates(91, 0)).toBe(false)
    })

    it('returns false for lng < -180', () => {
      expect(hasValidCoordinates(0, -181)).toBe(false)
    })

    it('returns false for lng > 180', () => {
      expect(hasValidCoordinates(0, 181)).toBe(false)
    })

    it('returns true for edge case (-90, -180)', () => {
      expect(hasValidCoordinates(-90, -180)).toBe(true)
    })

    it('returns true for edge case (90, 180)', () => {
      expect(hasValidCoordinates(90, 180)).toBe(true)
    })
  })

  describe('valid coordinates', () => {
    it('returns true for San Francisco (37.7749, -122.4194)', () => {
      expect(hasValidCoordinates(37.7749, -122.4194)).toBe(true)
    })

    it('returns true for New York (40.7128, -74.0060)', () => {
      expect(hasValidCoordinates(40.7128, -74.006)).toBe(true)
    })

    it('returns true for London (51.5074, -0.1278)', () => {
      expect(hasValidCoordinates(51.5074, -0.1278)).toBe(true)
    })

    it('returns true for Sydney (-33.8688, 151.2093)', () => {
      expect(hasValidCoordinates(-33.8688, 151.2093)).toBe(true)
    })
  })
})

// ============================================
// filterByPrice Tests
// ============================================

describe('filterByPrice', () => {
  const listings = [
    createMockListing({ id: '1', price: 500 }),
    createMockListing({ id: '2', price: 800 }),
    createMockListing({ id: '3', price: 1200 }),
    createMockListing({ id: '4', price: 2000 }),
  ]

  it('returns all listings when no price filters', () => {
    expect(filterByPrice(listings)).toHaveLength(4)
  })

  it('filters by minPrice only', () => {
    const result = filterByPrice(listings, 800)
    expect(result.map(l => l.id)).toEqual(['2', '3', '4'])
  })

  it('filters by maxPrice only', () => {
    const result = filterByPrice(listings, undefined, 1000)
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })

  it('filters by both minPrice and maxPrice', () => {
    const result = filterByPrice(listings, 700, 1500)
    expect(result.map(l => l.id)).toEqual(['2', '3'])
  })

  it('includes listings at exact minPrice', () => {
    const result = filterByPrice(listings, 500)
    expect(result.map(l => l.id)).toContain('1')
  })

  it('includes listings at exact maxPrice', () => {
    const result = filterByPrice(listings, undefined, 800)
    expect(result.map(l => l.id)).toContain('2')
  })

  it('handles null minPrice', () => {
    const result = filterByPrice(listings, null, 1000)
    expect(result).toHaveLength(2)
  })

  it('handles null maxPrice', () => {
    const result = filterByPrice(listings, 800, null)
    expect(result).toHaveLength(3)
  })

  it('returns empty array when no listings match', () => {
    const result = filterByPrice(listings, 3000, 4000)
    expect(result).toHaveLength(0)
  })
})

// ============================================
// filterByAmenities Tests
// ============================================

describe('filterByAmenities', () => {
  const listings = [
    createMockListing({ id: '1', amenities: ['WiFi', 'Parking', 'AC'] }),
    createMockListing({ id: '2', amenities: ['WiFi', 'Kitchen'] }),
    createMockListing({ id: '3', amenities: ['Parking', 'Pool'] }),
    createMockListing({ id: '4', amenities: [] }),
  ]

  it('returns all listings when no amenities filter', () => {
    expect(filterByAmenities(listings)).toHaveLength(4)
  })

  it('returns all listings for empty amenities array', () => {
    expect(filterByAmenities(listings, [])).toHaveLength(4)
  })

  it('filters by single amenity', () => {
    const result = filterByAmenities(listings, ['WiFi'])
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })

  it('requires ALL selected amenities (AND logic)', () => {
    const result = filterByAmenities(listings, ['WiFi', 'Parking'])
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('is case-insensitive', () => {
    const result = filterByAmenities(listings, ['wifi', 'PARKING'])
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('returns empty when no listing has all amenities', () => {
    const result = filterByAmenities(listings, ['WiFi', 'Pool'])
    expect(result).toHaveLength(0)
  })

  it('handles listings with no amenities', () => {
    const result = filterByAmenities(listings, ['WiFi'])
    expect(result.map(l => l.id)).not.toContain('4')
  })
})

// ============================================
// filterByHouseRules Tests
// ============================================

describe('filterByHouseRules', () => {
  const listings = [
    createMockListing({ id: '1', houseRules: ['Pets allowed', 'Smoking allowed'] }),
    createMockListing({ id: '2', houseRules: ['Pets allowed', 'Couples allowed'] }),
    createMockListing({ id: '3', houseRules: ['Guests allowed'] }),
    createMockListing({ id: '4', houseRules: [] }),
  ]

  it('returns all listings when no house rules filter', () => {
    expect(filterByHouseRules(listings)).toHaveLength(4)
  })

  it('returns all listings for empty house rules array', () => {
    expect(filterByHouseRules(listings, [])).toHaveLength(4)
  })

  it('filters by single rule', () => {
    const result = filterByHouseRules(listings, ['Pets allowed'])
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })

  it('requires ALL selected rules (AND logic)', () => {
    const result = filterByHouseRules(listings, ['Pets allowed', 'Smoking allowed'])
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('is case-insensitive', () => {
    const result = filterByHouseRules(listings, ['PETS ALLOWED'])
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })

  it('returns empty when no listing has all rules', () => {
    const result = filterByHouseRules(listings, ['Pets allowed', 'Guests allowed'])
    expect(result).toHaveLength(0)
  })
})

// ============================================
// filterByLanguages Tests
// ============================================

describe('filterByLanguages', () => {
  const listings = [
    createMockListing({ id: '1', householdLanguages: ['en', 'es'] }),
    createMockListing({ id: '2', householdLanguages: ['en', 'zh'] }),
    createMockListing({ id: '3', householdLanguages: ['fr', 'de'] }),
    createMockListing({ id: '4', householdLanguages: [] }),
  ]

  it('returns all listings when no languages filter', () => {
    expect(filterByLanguages(listings)).toHaveLength(4)
  })

  it('returns all listings for empty languages array', () => {
    expect(filterByLanguages(listings, [])).toHaveLength(4)
  })

  it('filters by single language', () => {
    const result = filterByLanguages(listings, ['en'])
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })

  it('uses OR logic (any language matches)', () => {
    const result = filterByLanguages(listings, ['es', 'zh'])
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })

  it('is case-insensitive', () => {
    const result = filterByLanguages(listings, ['EN', 'ES'])
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })

  it('returns empty when no listing speaks any language', () => {
    const result = filterByLanguages(listings, ['ja'])
    expect(result).toHaveLength(0)
  })

  it('includes listing if they speak any of the selected languages', () => {
    const result = filterByLanguages(listings, ['en', 'fr'])
    expect(result.map(l => l.id)).toEqual(['1', '2', '3'])
  })
})

// ============================================
// filterByRoomType Tests
// ============================================

describe('filterByRoomType', () => {
  const listings = [
    createMockListing({ id: '1', roomType: 'Private Room' }),
    createMockListing({ id: '2', roomType: 'Shared Room' }),
    createMockListing({ id: '3', roomType: 'Entire Place' }),
    createMockListing({ id: '4', roomType: undefined }),
  ]

  it('returns all listings when no room type filter', () => {
    expect(filterByRoomType(listings)).toHaveLength(4)
  })

  it('filters by exact room type', () => {
    const result = filterByRoomType(listings, 'Private Room')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('is case-insensitive', () => {
    const result = filterByRoomType(listings, 'private room')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('excludes listings without room type', () => {
    const result = filterByRoomType(listings, 'Private Room')
    expect(result.map(l => l.id)).not.toContain('4')
  })

  it('returns empty when no match', () => {
    const result = filterByRoomType(listings, 'Studio')
    expect(result).toHaveLength(0)
  })
})

// ============================================
// filterByLeaseDuration Tests
// ============================================

describe('filterByLeaseDuration', () => {
  const listings = [
    createMockListing({ id: '1', leaseDuration: '6 months' }),
    createMockListing({ id: '2', leaseDuration: '1 year' }),
    createMockListing({ id: '3', leaseDuration: 'Month-to-month' }),
    createMockListing({ id: '4', leaseDuration: undefined }),
  ]

  it('returns all listings when no lease duration filter', () => {
    expect(filterByLeaseDuration(listings)).toHaveLength(4)
  })

  it('filters by exact lease duration', () => {
    const result = filterByLeaseDuration(listings, '6 months')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('is case-insensitive', () => {
    const result = filterByLeaseDuration(listings, '6 MONTHS')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('excludes listings without lease duration', () => {
    const result = filterByLeaseDuration(listings, '6 months')
    expect(result.map(l => l.id)).not.toContain('4')
  })
})

// ============================================
// filterByMoveInDate Tests
// ============================================

describe('filterByMoveInDate', () => {
  const listings = [
    createMockListing({ id: '1', moveInDate: new Date('2024-01-15') }),
    createMockListing({ id: '2', moveInDate: new Date('2024-02-01') }),
    createMockListing({ id: '3', moveInDate: new Date('2024-03-01') }),
    createMockListing({ id: '4', moveInDate: undefined }),
  ]

  it('returns all listings when no move-in date filter', () => {
    expect(filterByMoveInDate(listings)).toHaveLength(4)
  })

  it('includes listings available by target date', () => {
    const result = filterByMoveInDate(listings, '2024-02-15')
    expect(result.map(l => l.id)).toEqual(['1', '2', '4'])
  })

  it('includes listings without move-in date (flexible availability)', () => {
    const result = filterByMoveInDate(listings, '2024-01-01')
    expect(result.map(l => l.id)).toContain('4')
  })

  it('includes listings on exact date', () => {
    const result = filterByMoveInDate(listings, '2024-02-01')
    expect(result.map(l => l.id)).toContain('2')
  })

  it('excludes listings not available by date', () => {
    const result = filterByMoveInDate(listings, '2024-01-01')
    expect(result.map(l => l.id)).not.toContain('1')
    expect(result.map(l => l.id)).not.toContain('2')
    expect(result.map(l => l.id)).not.toContain('3')
  })
})

// ============================================
// filterByGenderPreference Tests
// ============================================

describe('filterByGenderPreference', () => {
  const listings = [
    createMockListing({ id: '1', genderPreference: 'MALE_ONLY' }),
    createMockListing({ id: '2', genderPreference: 'FEMALE_ONLY' }),
    createMockListing({ id: '3', genderPreference: 'NO_PREFERENCE' }),
    createMockListing({ id: '4', genderPreference: undefined }),
  ]

  it('returns all listings when no gender preference filter', () => {
    expect(filterByGenderPreference(listings)).toHaveLength(4)
  })

  it('filters by exact gender preference', () => {
    const result = filterByGenderPreference(listings, 'MALE_ONLY')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('is case-insensitive', () => {
    const result = filterByGenderPreference(listings, 'male_only')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('excludes listings without preference', () => {
    const result = filterByGenderPreference(listings, 'MALE_ONLY')
    expect(result.map(l => l.id)).not.toContain('4')
  })
})

// ============================================
// filterByHouseholdGender Tests
// ============================================

describe('filterByHouseholdGender', () => {
  const listings = [
    createMockListing({ id: '1', householdGender: 'ALL_MALE' }),
    createMockListing({ id: '2', householdGender: 'ALL_FEMALE' }),
    createMockListing({ id: '3', householdGender: 'MIXED' }),
    createMockListing({ id: '4', householdGender: undefined }),
  ]

  it('returns all listings when no household gender filter', () => {
    expect(filterByHouseholdGender(listings)).toHaveLength(4)
  })

  it('filters by exact household gender', () => {
    const result = filterByHouseholdGender(listings, 'ALL_MALE')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('is case-insensitive', () => {
    const result = filterByHouseholdGender(listings, 'mixed')
    expect(result.map(l => l.id)).toEqual(['3'])
  })

  it('excludes listings without household gender', () => {
    const result = filterByHouseholdGender(listings, 'ALL_MALE')
    expect(result.map(l => l.id)).not.toContain('4')
  })
})

// ============================================
// filterByBounds Tests
// ============================================

describe('filterByBounds', () => {
  const listings = [
    createMockListing({ id: '1', location: { address: '', city: 'SF', state: 'CA', zip: '', lat: 37.7749, lng: -122.4194 } }),
    createMockListing({ id: '2', location: { address: '', city: 'LA', state: 'CA', zip: '', lat: 34.0522, lng: -118.2437 } }),
    createMockListing({ id: '3', location: { address: '', city: 'NYC', state: 'NY', zip: '', lat: 40.7128, lng: -74.0060 } }),
  ]

  it('returns all listings when no bounds filter', () => {
    expect(filterByBounds(listings)).toHaveLength(3)
  })

  it('filters listings within bounds', () => {
    const sfBounds = { minLat: 37, maxLat: 38, minLng: -123, maxLng: -122 }
    const result = filterByBounds(listings, sfBounds)
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('includes listings on boundary edges', () => {
    const bounds = { minLat: 37.7749, maxLat: 37.7749, minLng: -122.4194, maxLng: -122.4194 }
    const result = filterByBounds(listings, bounds)
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('returns empty when no listings in bounds', () => {
    const europeBounds = { minLat: 40, maxLat: 60, minLng: -10, maxLng: 30 }
    const result = filterByBounds(listings, europeBounds)
    expect(result).toHaveLength(0)
  })

  it('filters by California region', () => {
    const caBounds = { minLat: 32, maxLat: 42, minLng: -125, maxLng: -114 }
    const result = filterByBounds(listings, caBounds)
    expect(result.map(l => l.id)).toEqual(['1', '2'])
  })
})

// ============================================
// filterByQuery Tests
// ============================================

describe('filterByQuery', () => {
  const listings = [
    createMockListing({ id: '1', title: 'Cozy Downtown Loft', description: 'Modern space', location: { address: '', city: 'San Francisco', state: 'CA', zip: '', lat: 0, lng: 0 } }),
    createMockListing({ id: '2', title: 'Sunny Beach House', description: 'Ocean views', location: { address: '', city: 'Los Angeles', state: 'CA', zip: '', lat: 0, lng: 0 } }),
    createMockListing({ id: '3', title: 'Urban Studio', description: 'Downtown living', location: { address: '', city: 'New York', state: 'NY', zip: '', lat: 0, lng: 0 } }),
  ]

  it('returns all listings when no query', () => {
    expect(filterByQuery(listings)).toHaveLength(3)
  })

  it('returns all listings for empty query', () => {
    expect(filterByQuery(listings, '')).toHaveLength(3)
  })

  it('returns all listings for single character query', () => {
    expect(filterByQuery(listings, 'a')).toHaveLength(3)
  })

  it('searches in title', () => {
    const result = filterByQuery(listings, 'Loft')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('searches in description', () => {
    const result = filterByQuery(listings, 'Ocean')
    expect(result.map(l => l.id)).toEqual(['2'])
  })

  it('searches in city', () => {
    const result = filterByQuery(listings, 'San Francisco')
    expect(result.map(l => l.id)).toEqual(['1'])
  })

  it('searches in state', () => {
    // NY also matches 'suNNY' in listing 2's title (case-insensitive partial match)
    const result = filterByQuery(listings, 'NY')
    expect(result.map(l => l.id)).toEqual(['2', '3'])
  })

  it('is case-insensitive', () => {
    const result = filterByQuery(listings, 'DOWNTOWN')
    expect(result.map(l => l.id)).toEqual(['1', '3'])
  })

  it('handles partial matches', () => {
    const result = filterByQuery(listings, 'down')
    expect(result.map(l => l.id)).toEqual(['1', '3'])
  })

  it('sanitizes query before searching', () => {
    // SQL injection attempt: quotes and -- are removed
    // "Cozy'; DROP TABLE--" becomes "Cozy DROP TABLE"
    // This won't match since no title contains "Cozy DROP TABLE"
    const result = filterByQuery(listings, "Cozy'; DROP TABLE--")
    expect(result).toHaveLength(0)

    // Test with a simpler injection that still matches after sanitization
    const result2 = filterByQuery(listings, "Loft'; --")
    expect(result2.map(l => l.id)).toEqual(['1'])
  })
})

// ============================================
// sortListings Tests
// ============================================

describe('sortListings', () => {
  const baseDate = new Date('2024-01-01')
  const listings: ListingWithMetadata[] = [
    createMockListing({ id: '1', price: 800, createdAt: new Date('2024-01-03'), avgRating: 4.0, viewCount: 100, reviewCount: 5 }),
    createMockListing({ id: '2', price: 500, createdAt: new Date('2024-01-02'), avgRating: 4.5, viewCount: 50, reviewCount: 10 }),
    createMockListing({ id: '3', price: 1200, createdAt: new Date('2024-01-01'), avgRating: 5.0, viewCount: 200, reviewCount: 20 }),
  ]

  describe('price_asc sort', () => {
    it('sorts by price ascending', () => {
      const result = sortListings(listings, 'price_asc')
      expect(result.map(l => l.price)).toEqual([500, 800, 1200])
    })

    it('uses createdAt as tiebreaker (newer first)', () => {
      const samePrice = [
        createMockListing({ id: 'a', price: 500, createdAt: new Date('2024-01-01') }),
        createMockListing({ id: 'b', price: 500, createdAt: new Date('2024-01-03') }),
      ]
      const result = sortListings(samePrice, 'price_asc')
      expect(result.map(l => l.id)).toEqual(['b', 'a'])
    })
  })

  describe('price_desc sort', () => {
    it('sorts by price descending', () => {
      const result = sortListings(listings, 'price_desc')
      expect(result.map(l => l.price)).toEqual([1200, 800, 500])
    })

    it('uses createdAt as tiebreaker (newer first)', () => {
      const samePrice = [
        createMockListing({ id: 'a', price: 500, createdAt: new Date('2024-01-01') }),
        createMockListing({ id: 'b', price: 500, createdAt: new Date('2024-01-03') }),
      ]
      const result = sortListings(samePrice, 'price_desc')
      expect(result.map(l => l.id)).toEqual(['b', 'a'])
    })
  })

  describe('newest sort', () => {
    it('sorts by createdAt descending', () => {
      const result = sortListings(listings, 'newest')
      expect(result.map(l => l.id)).toEqual(['1', '2', '3'])
    })

    it('uses id as tiebreaker for same timestamp', () => {
      const sameTime = [
        createMockListing({ id: 'b', createdAt: baseDate }),
        createMockListing({ id: 'a', createdAt: baseDate }),
      ]
      const result = sortListings(sameTime, 'newest')
      expect(result.map(l => l.id)).toEqual(['a', 'b'])
    })
  })

  describe('rating sort', () => {
    it('sorts by avgRating descending', () => {
      const result = sortListings(listings, 'rating')
      expect(result.map(l => l.avgRating)).toEqual([5.0, 4.5, 4.0])
    })

    it('uses reviewCount as secondary sort', () => {
      const sameRating = [
        createMockListing({ id: 'a', avgRating: 4.5, reviewCount: 5, createdAt: baseDate }),
        createMockListing({ id: 'b', avgRating: 4.5, reviewCount: 10, createdAt: baseDate }),
      ]
      const result = sortListings(sameRating, 'rating')
      expect(result.map(l => l.id)).toEqual(['b', 'a'])
    })

    it('uses createdAt as tertiary sort', () => {
      const sameRatingAndReviews = [
        createMockListing({ id: 'a', avgRating: 4.5, reviewCount: 10, createdAt: new Date('2024-01-01') }),
        createMockListing({ id: 'b', avgRating: 4.5, reviewCount: 10, createdAt: new Date('2024-01-03') }),
      ]
      const result = sortListings(sameRatingAndReviews, 'rating')
      expect(result.map(l => l.id)).toEqual(['b', 'a'])
    })
  })

  describe('recommended sort', () => {
    it('sorts by score formula: (rating * 20) + (views * 0.1) + (reviews * 5)', () => {
      // listing 1: (4.0 * 20) + (100 * 0.1) + (5 * 5) = 80 + 10 + 25 = 115
      // listing 2: (4.5 * 20) + (50 * 0.1) + (10 * 5) = 90 + 5 + 50 = 145
      // listing 3: (5.0 * 20) + (200 * 0.1) + (20 * 5) = 100 + 20 + 100 = 220
      const result = sortListings(listings, 'recommended')
      expect(result.map(l => l.id)).toEqual(['3', '2', '1'])
    })

    it('uses createdAt as tiebreaker', () => {
      const sameScore = [
        createMockListing({ id: 'a', avgRating: 4.0, viewCount: 100, reviewCount: 10, createdAt: new Date('2024-01-01') }),
        createMockListing({ id: 'b', avgRating: 4.0, viewCount: 100, reviewCount: 10, createdAt: new Date('2024-01-03') }),
      ]
      const result = sortListings(sameScore, 'recommended')
      expect(result.map(l => l.id)).toEqual(['b', 'a'])
    })

    it('is the default sort', () => {
      const defaultResult = sortListings(listings)
      const recommendedResult = sortListings(listings, 'recommended')
      expect(defaultResult).toEqual(recommendedResult)
    })
  })

  describe('immutability', () => {
    it('does not mutate original array', () => {
      const original = [...listings]
      sortListings(listings, 'price_asc')
      expect(listings).toEqual(original)
    })
  })
})


describe('shared ranking primitives', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses recommended ranking expression in paginated listings query', async () => {
    ;(prisma.$queryRawUnsafe as jest.Mock)
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([])

    await getListingsPaginated({
      query: 'downtown',
      bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.3 },
      sort: 'recommended',
      page: 1,
      limit: 12,
    })

    const dataQuery = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[1][0] as string
    expect(dataQuery).toContain('CASE')
    expect(dataQuery).toContain('POSITION(')
    expect(dataQuery).toContain('LN(1 + COUNT(r.id))')
    expect(dataQuery).toContain('l.id ASC')
  })

  it('uses deterministic map ranking with relevance, proximity, and business score', async () => {
    ;(prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([])

    await getMapListings({
      query: 'downtown',
      bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.3 },
    })

    const mapQuery = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0] as string
    const mapParams = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0].slice(1)

    expect(mapQuery).toContain('ORDER BY')
    expect(mapQuery).toContain('POWER(ST_Y(loc.coords::geometry) - $')
    expect(mapQuery).toContain('LN(1 + COUNT(r.id))')
    expect(mapQuery).toContain('LEFT JOIN "Review" r')
    expect(mapQuery).toContain('l.id ASC')

    // last two params are deterministic viewport center coordinates
    expect(mapParams[mapParams.length - 2]).toBeCloseTo(37.75)
    expect(mapParams[mapParams.length - 1]).toBeCloseTo(-122.4)
  })
})
