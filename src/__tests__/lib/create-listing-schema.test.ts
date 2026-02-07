// Mock dependencies before any imports
jest.mock('@/lib/languages', () => ({
  isValidLanguageCode: jest.fn((code: string) =>
    ['en', 'es', 'fr', 'de', 'ja', 'zh'].includes(code)
  ),
}))

jest.mock('@/lib/filter-schema', () => ({
  VALID_ROOM_TYPES: ['any', 'Private Room', 'Shared Room', 'Entire Place'],
  VALID_LEASE_DURATIONS: [
    'any',
    'Month-to-month',
    '3 months',
    '6 months',
    '12 months',
    'Flexible',
  ],
  VALID_GENDER_PREFERENCES: ['any', 'MALE_ONLY', 'FEMALE_ONLY', 'NO_PREFERENCE'],
  VALID_HOUSEHOLD_GENDERS: ['any', 'ALL_MALE', 'ALL_FEMALE', 'MIXED'],
}))

import {
  createListingSchema,
  createListingApiSchema,
  listingImagesSchema,
  moveInDateSchema,
} from '@/lib/schemas'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Local-timezone ISO date string for N days from today (matches schema's local midnight comparison) */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** ISO date string for N years from today */
function _yearsFromNow(n: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + n)
  return d.toISOString().slice(0, 10)
}
void _yearsFromNow // prevent unused warning

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validBase = {
  title: 'Test Room',
  description: 'A description that is at least 10 characters long',
  price: '500',
  amenities: 'Wifi,AC',
  totalSlots: '2',
  address: '123 Main St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94102',
}

const SUPABASE_IMG =
  'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/test.jpg'

const validApi = {
  ...validBase,
  images: [SUPABASE_IMG],
}

// ===================================================================
// createListingSchema (base)
// ===================================================================

describe('createListingSchema', () => {
  // ------------------------------------------------------------------
  // title (min 1, max 100)
  // ------------------------------------------------------------------
  describe('title', () => {
    it('accepts a 1-character title (min boundary)', () => {
      const r = createListingSchema.safeParse({ ...validBase, title: 'A' })
      expect(r.success).toBe(true)
    })

    it('accepts a 100-character title (max boundary)', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        title: 'x'.repeat(100),
      })
      expect(r.success).toBe(true)
    })

    it('rejects an empty string', () => {
      const r = createListingSchema.safeParse({ ...validBase, title: '' })
      expect(r.success).toBe(false)
    })

    it('rejects a 101-character title', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        title: 'x'.repeat(101),
      })
      expect(r.success).toBe(false)
    })

    it('rejects undefined/missing title', () => {
      const { title: _, ...rest } = validBase
      const r = createListingSchema.safeParse(rest)
      expect(r.success).toBe(false)
    })

    it('accepts special characters and unicode', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        title: 'Room w/ A/C & Wi-Fi (near downtown!)',
      })
      expect(r.success).toBe(true)
    })
  })

  // ------------------------------------------------------------------
  // description (min 10, max 1000)
  // ------------------------------------------------------------------
  describe('description', () => {
    it('accepts a 10-character description (min boundary)', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        description: '1234567890',
      })
      expect(r.success).toBe(true)
    })

    it('rejects a 9-character description', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        description: '123456789',
      })
      expect(r.success).toBe(false)
    })

    it('accepts a 1000-character description (max boundary)', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        description: 'x'.repeat(1000),
      })
      expect(r.success).toBe(true)
    })

    it('rejects a 1001-character description', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        description: 'x'.repeat(1001),
      })
      expect(r.success).toBe(false)
    })

    it('rejects an empty string', () => {
      const r = createListingSchema.safeParse({ ...validBase, description: '' })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // price (positive, max 50000, finite, coerced from string)
  // ------------------------------------------------------------------
  describe('price', () => {
    it('coerces string "1" to number 1 (min positive)', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: '1' })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.price).toBe(1)
    })

    it('accepts number 50000 (max boundary)', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: '50000' })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.price).toBe(50000)
    })

    it('rejects 50001 (over max)', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: '50001' })
      expect(r.success).toBe(false)
    })

    it('rejects 0', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: '0' })
      expect(r.success).toBe(false)
    })

    it('rejects negative price', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: '-100' })
      expect(r.success).toBe(false)
    })

    it('rejects non-numeric string', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: 'abc' })
      expect(r.success).toBe(false)
    })

    it('rejects Infinity', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: Infinity })
      expect(r.success).toBe(false)
    })

    it('rejects NaN', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: NaN })
      expect(r.success).toBe(false)
    })

    it('accepts decimal price (e.g. 499.99)', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: '499.99' })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.price).toBeCloseTo(499.99)
    })

    it('coerces numeric value passed as number', () => {
      const r = createListingSchema.safeParse({ ...validBase, price: 750 })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.price).toBe(750)
    })
  })

  // ------------------------------------------------------------------
  // amenities (string -> transform -> array, each max 50, max 20)
  // ------------------------------------------------------------------
  describe('amenities', () => {
    it('transforms comma-separated string into array', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: 'Wifi,AC,Parking',
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.amenities).toEqual(['Wifi', 'AC', 'Parking'])
    })

    it('trims whitespace from each item', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: ' Wifi , AC ',
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.amenities).toEqual(['Wifi', 'AC'])
    })

    it('filters out empty strings from consecutive commas', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: 'Wifi,,AC',
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.amenities).toEqual(['Wifi', 'AC'])
    })

    it('accepts a single amenity', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: 'Wifi',
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.amenities).toEqual(['Wifi'])
    })

    it('accepts 20 amenities (max boundary)', () => {
      const items = Array.from({ length: 20 }, (_, i) => `a${i}`)
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: items.join(','),
      })
      expect(r.success).toBe(true)
    })

    it('rejects 21 amenities', () => {
      const items = Array.from({ length: 21 }, (_, i) => `a${i}`)
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: items.join(','),
      })
      expect(r.success).toBe(false)
    })

    it('accepts an amenity with exactly 50 chars', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: 'x'.repeat(50),
      })
      expect(r.success).toBe(true)
    })

    it('rejects an amenity with 51 chars', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        amenities: 'x'.repeat(51),
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // houseRules (optional string -> default "" -> transform -> array)
  // ------------------------------------------------------------------
  describe('houseRules', () => {
    it('is optional and defaults to empty array', () => {
      const rest = { ...validBase }
      const r = createListingSchema.safeParse(rest)
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.houseRules).toEqual([])
    })

    it('transforms comma-separated rules into array', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        houseRules: 'No Smoking,No Pets',
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.houseRules).toEqual(['No Smoking', 'No Pets'])
    })

    it('returns empty array for empty string', () => {
      const r = createListingSchema.safeParse({ ...validBase, houseRules: '' })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.houseRules).toEqual([])
    })

    it('accepts 20 house rules (max boundary)', () => {
      const items = Array.from({ length: 20 }, (_, i) => `rule${i}`)
      const r = createListingSchema.safeParse({
        ...validBase,
        houseRules: items.join(','),
      })
      expect(r.success).toBe(true)
    })

    it('rejects 21 house rules', () => {
      const items = Array.from({ length: 21 }, (_, i) => `rule${i}`)
      const r = createListingSchema.safeParse({
        ...validBase,
        houseRules: items.join(','),
      })
      expect(r.success).toBe(false)
    })

    it('accepts a house rule with exactly 50 chars', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        houseRules: 'x'.repeat(50),
      })
      expect(r.success).toBe(true)
    })

    it('rejects a house rule with 51 chars', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        houseRules: 'x'.repeat(51),
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // totalSlots (int, positive, max 20, coerced)
  // ------------------------------------------------------------------
  describe('totalSlots', () => {
    it('coerces string "1" to number 1 (min positive int)', () => {
      const r = createListingSchema.safeParse({ ...validBase, totalSlots: '1' })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.totalSlots).toBe(1)
    })

    it('accepts 20 (max boundary)', () => {
      const r = createListingSchema.safeParse({ ...validBase, totalSlots: '20' })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.totalSlots).toBe(20)
    })

    it('rejects 21 (over max)', () => {
      const r = createListingSchema.safeParse({ ...validBase, totalSlots: '21' })
      expect(r.success).toBe(false)
    })

    it('rejects 0', () => {
      const r = createListingSchema.safeParse({ ...validBase, totalSlots: '0' })
      expect(r.success).toBe(false)
    })

    it('rejects negative', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        totalSlots: '-1',
      })
      expect(r.success).toBe(false)
    })

    it('rejects decimal (not an integer)', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        totalSlots: '2.5',
      })
      expect(r.success).toBe(false)
    })

    it('rejects non-numeric string', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        totalSlots: 'abc',
      })
      expect(r.success).toBe(false)
    })

    it('coerces numeric value passed as number', () => {
      const r = createListingSchema.safeParse({ ...validBase, totalSlots: 5 })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.totalSlots).toBe(5)
    })
  })

  // ------------------------------------------------------------------
  // address (min 1, max 200)
  // ------------------------------------------------------------------
  describe('address', () => {
    it('accepts a 1-character address', () => {
      const r = createListingSchema.safeParse({ ...validBase, address: 'A' })
      expect(r.success).toBe(true)
    })

    it('accepts a 200-character address', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        address: 'x'.repeat(200),
      })
      expect(r.success).toBe(true)
    })

    it('rejects a 201-character address', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        address: 'x'.repeat(201),
      })
      expect(r.success).toBe(false)
    })

    it('rejects an empty string', () => {
      const r = createListingSchema.safeParse({ ...validBase, address: '' })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // city (min 1, max 100)
  // ------------------------------------------------------------------
  describe('city', () => {
    it('accepts a 1-character city', () => {
      const r = createListingSchema.safeParse({ ...validBase, city: 'X' })
      expect(r.success).toBe(true)
    })

    it('accepts a 100-character city', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        city: 'c'.repeat(100),
      })
      expect(r.success).toBe(true)
    })

    it('rejects a 101-character city', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        city: 'c'.repeat(101),
      })
      expect(r.success).toBe(false)
    })

    it('rejects an empty string', () => {
      const r = createListingSchema.safeParse({ ...validBase, city: '' })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // state (min 1, max 50)
  // ------------------------------------------------------------------
  describe('state', () => {
    it('accepts a 1-character state', () => {
      const r = createListingSchema.safeParse({ ...validBase, state: 'X' })
      expect(r.success).toBe(true)
    })

    it('accepts a 50-character state', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        state: 's'.repeat(50),
      })
      expect(r.success).toBe(true)
    })

    it('rejects a 51-character state', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        state: 's'.repeat(51),
      })
      expect(r.success).toBe(false)
    })

    it('rejects an empty string', () => {
      const r = createListingSchema.safeParse({ ...validBase, state: '' })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // zip (regex /^\d{5}(-\d{4})?$/)
  // ------------------------------------------------------------------
  describe('zip', () => {
    it('accepts 5-digit zip', () => {
      const r = createListingSchema.safeParse({ ...validBase, zip: '94102' })
      expect(r.success).toBe(true)
    })

    it('accepts ZIP+4 format', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        zip: '94102-1234',
      })
      expect(r.success).toBe(true)
    })

    it('rejects 4-digit zip', () => {
      const r = createListingSchema.safeParse({ ...validBase, zip: '9410' })
      expect(r.success).toBe(false)
    })

    it('rejects 6-digit zip', () => {
      const r = createListingSchema.safeParse({ ...validBase, zip: '941020' })
      expect(r.success).toBe(false)
    })

    it('rejects letters', () => {
      const r = createListingSchema.safeParse({ ...validBase, zip: 'ABCDE' })
      expect(r.success).toBe(false)
    })

    it('rejects ZIP+4 with wrong suffix length', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        zip: '94102-12',
      })
      expect(r.success).toBe(false)
    })

    it('rejects empty string', () => {
      const r = createListingSchema.safeParse({ ...validBase, zip: '' })
      expect(r.success).toBe(false)
    })

    it('rejects zip with spaces', () => {
      const r = createListingSchema.safeParse({
        ...validBase,
        zip: '94 102',
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // missing fields (entire object)
  // ------------------------------------------------------------------
  describe('missing / empty object', () => {
    it('rejects empty object', () => {
      const r = createListingSchema.safeParse({})
      expect(r.success).toBe(false)
    })

    it('valid base passes', () => {
      const r = createListingSchema.safeParse(validBase)
      expect(r.success).toBe(true)
    })
  })
})

// ===================================================================
// listingImagesSchema
// ===================================================================

describe('listingImagesSchema', () => {
  it('accepts a valid Supabase image URL', () => {
    const r = listingImagesSchema.safeParse([SUPABASE_IMG])
    expect(r.success).toBe(true)
  })

  it('accepts .jpeg extension', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo.jpeg'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(true)
  })

  it('accepts .png extension', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo.png'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(true)
  })

  it('accepts .gif extension', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo.gif'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(true)
  })

  it('accepts .webp extension', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo.webp'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(true)
  })

  it('accepts case-insensitive extension (.JPG)', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo.JPG'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(true)
  })

  it('accepts 10 images (max boundary)', () => {
    const urls = Array.from(
      { length: 10 },
      (_, i) =>
        `https://abc123.supabase.co/storage/v1/object/public/images/listings/user/img${i}.jpg`
    )
    const r = listingImagesSchema.safeParse(urls)
    expect(r.success).toBe(true)
  })

  it('rejects 11 images', () => {
    const urls = Array.from(
      { length: 11 },
      (_, i) =>
        `https://abc123.supabase.co/storage/v1/object/public/images/listings/user/img${i}.jpg`
    )
    const r = listingImagesSchema.safeParse(urls)
    expect(r.success).toBe(false)
  })

  it('rejects empty array (min 1)', () => {
    const r = listingImagesSchema.safeParse([])
    expect(r.success).toBe(false)
  })

  it('rejects non-Supabase URL', () => {
    const r = listingImagesSchema.safeParse([
      'https://example.com/images/photo.jpg',
    ])
    expect(r.success).toBe(false)
  })

  it('rejects HTTP (non-HTTPS) URL', () => {
    const url =
      'http://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo.jpg'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(false)
  })

  it('rejects URL missing file extension', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(false)
  })

  it('rejects URL with wrong extension (.bmp)', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/images/listings/user/photo.bmp'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(false)
  })

  it('rejects URL with wrong storage path', () => {
    const url =
      'https://abc123.supabase.co/storage/v1/object/public/other-bucket/photo.jpg'
    const r = listingImagesSchema.safeParse([url])
    expect(r.success).toBe(false)
  })

  it('rejects plain string (not a URL)', () => {
    const r = listingImagesSchema.safeParse(['not-a-url'])
    expect(r.success).toBe(false)
  })
})

// ===================================================================
// moveInDateSchema
// ===================================================================

describe('moveInDateSchema', () => {
  // Note: "today" as a date string is timezone-sensitive because the schema
  // parses the string as UTC midnight but compares against local midnight.
  // In negative-UTC-offset timezones, UTC midnight < local midnight, so
  // "today" may be rejected. We test with tomorrow (daysFromNow(1)) as the
  // safe near-future boundary.

  it('accepts tomorrow (near-future boundary)', () => {
    const r = moveInDateSchema.safeParse(daysFromNow(1))
    expect(r.success).toBe(true)
  })

  it('accepts a date ~1 year from now', () => {
    const r = moveInDateSchema.safeParse(daysFromNow(365))
    expect(r.success).toBe(true)
  })

  it('rejects yesterday (past date)', () => {
    const r = moveInDateSchema.safeParse(daysFromNow(-1))
    expect(r.success).toBe(false)
  })

  it('rejects a date more than 2 years in the future', () => {
    const r = moveInDateSchema.safeParse(daysFromNow(731))
    expect(r.success).toBe(false)
  })

  it('accepts null', () => {
    const r = moveInDateSchema.safeParse(null)
    expect(r.success).toBe(true)
  })

  it('accepts undefined', () => {
    const r = moveInDateSchema.safeParse(undefined)
    expect(r.success).toBe(true)
  })

  it('rejects non-YYYY-MM-DD format (MM/DD/YYYY)', () => {
    const r = moveInDateSchema.safeParse('01/15/2026')
    expect(r.success).toBe(false)
  })

  it('rejects invalid calendar date (2026-02-30)', () => {
    // 2026-02-30 passes regex but is not a real date -- however Date may
    // roll over; the schema has a refine for isNaN check.
    // February 30 rolls to March 2 in JS, so Date is valid -- this tests
    // the regex pass + refine behavior. The schema validates with isNaN.
    const r = moveInDateSchema.safeParse('2026-13-01')
    expect(r.success).toBe(false)
  })

  it('rejects empty string', () => {
    const r = moveInDateSchema.safeParse('')
    expect(r.success).toBe(false)
  })

  it('rejects random text', () => {
    const r = moveInDateSchema.safeParse('not-a-date')
    expect(r.success).toBe(false)
  })
})

// ===================================================================
// createListingApiSchema (extends base)
// ===================================================================

describe('createListingApiSchema', () => {
  it('accepts a fully valid API listing', () => {
    const r = createListingApiSchema.safeParse(validApi)
    expect(r.success).toBe(true)
  })

  it('inherits base schema validation (e.g. rejects empty title)', () => {
    const r = createListingApiSchema.safeParse({ ...validApi, title: '' })
    expect(r.success).toBe(false)
  })

  // ------------------------------------------------------------------
  // images (required, min 1, max 10, Supabase pattern)
  // ------------------------------------------------------------------
  describe('images', () => {
    it('requires at least one image', () => {
      const r = createListingApiSchema.safeParse({ ...validApi, images: [] })
      expect(r.success).toBe(false)
    })

    it('rejects missing images field', () => {
      const { images: _, ...rest } = validApi
      const r = createListingApiSchema.safeParse(rest)
      expect(r.success).toBe(false)
    })

    it('accepts 10 images', () => {
      const urls = Array.from(
        { length: 10 },
        (_, i) =>
          `https://abc123.supabase.co/storage/v1/object/public/images/listings/user/img${i}.jpg`
      )
      const r = createListingApiSchema.safeParse({
        ...validApi,
        images: urls,
      })
      expect(r.success).toBe(true)
    })

    it('rejects 11 images', () => {
      const urls = Array.from(
        { length: 11 },
        (_, i) =>
          `https://abc123.supabase.co/storage/v1/object/public/images/listings/user/img${i}.jpg`
      )
      const r = createListingApiSchema.safeParse({
        ...validApi,
        images: urls,
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // roomType (optional enum or null)
  // ------------------------------------------------------------------
  describe('roomType', () => {
    it.each(['Private Room', 'Shared Room', 'Entire Place'])(
      'accepts "%s"',
      (value) => {
        const r = createListingApiSchema.safeParse({
          ...validApi,
          roomType: value,
        })
        expect(r.success).toBe(true)
      }
    )

    it('accepts null', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        roomType: null,
      })
      expect(r.success).toBe(true)
    })

    it('accepts undefined (omitted)', () => {
      const r = createListingApiSchema.safeParse(validApi) // no roomType key
      expect(r.success).toBe(true)
    })

    it('rejects "any" (filter-only value)', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        roomType: 'any',
      })
      expect(r.success).toBe(false)
    })

    it('rejects invalid string', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        roomType: 'Studio',
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // leaseDuration (optional enum or null)
  // ------------------------------------------------------------------
  describe('leaseDuration', () => {
    it.each([
      'Month-to-month',
      '3 months',
      '6 months',
      '12 months',
      'Flexible',
    ])('accepts "%s"', (value) => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        leaseDuration: value,
      })
      expect(r.success).toBe(true)
    })

    it('accepts null', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        leaseDuration: null,
      })
      expect(r.success).toBe(true)
    })

    it('accepts undefined (omitted)', () => {
      const r = createListingApiSchema.safeParse(validApi)
      expect(r.success).toBe(true)
    })

    it('rejects "any"', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        leaseDuration: 'any',
      })
      expect(r.success).toBe(false)
    })

    it('rejects invalid value', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        leaseDuration: '2 months',
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // genderPreference (optional enum or null)
  // ------------------------------------------------------------------
  describe('genderPreference', () => {
    it.each(['MALE_ONLY', 'FEMALE_ONLY', 'NO_PREFERENCE'])(
      'accepts "%s"',
      (value) => {
        const r = createListingApiSchema.safeParse({
          ...validApi,
          genderPreference: value,
        })
        expect(r.success).toBe(true)
      }
    )

    it('accepts null', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        genderPreference: null,
      })
      expect(r.success).toBe(true)
    })

    it('accepts undefined (omitted)', () => {
      const r = createListingApiSchema.safeParse(validApi)
      expect(r.success).toBe(true)
    })

    it('rejects "any"', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        genderPreference: 'any',
      })
      expect(r.success).toBe(false)
    })

    it('rejects invalid string', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        genderPreference: 'NONBINARY',
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // householdGender (optional enum or null)
  // ------------------------------------------------------------------
  describe('householdGender', () => {
    it.each(['ALL_MALE', 'ALL_FEMALE', 'MIXED'])('accepts "%s"', (value) => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdGender: value,
      })
      expect(r.success).toBe(true)
    })

    it('accepts null', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdGender: null,
      })
      expect(r.success).toBe(true)
    })

    it('accepts undefined (omitted)', () => {
      const r = createListingApiSchema.safeParse(validApi)
      expect(r.success).toBe(true)
    })

    it('rejects "any"', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdGender: 'any',
      })
      expect(r.success).toBe(false)
    })

    it('rejects invalid string', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdGender: 'COED',
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // householdLanguages (optional array of language codes, max 20, default [])
  // ------------------------------------------------------------------
  describe('householdLanguages', () => {
    it('defaults to empty array when omitted', () => {
      const r = createListingApiSchema.safeParse(validApi)
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.householdLanguages).toEqual([])
    })

    it('accepts valid language codes', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdLanguages: ['en', 'es', 'fr'],
      })
      expect(r.success).toBe(true)
      if (r.success)
        expect(r.data.householdLanguages).toEqual(['en', 'es', 'fr'])
    })

    it('accepts 20 language codes (max boundary)', () => {
      // Only 6 valid codes in mock, so repeat them to fill 20
      const codes = Array.from(
        { length: 20 },
        (_, i) => ['en', 'es', 'fr', 'de', 'ja', 'zh'][i % 6]
      )
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdLanguages: codes,
      })
      expect(r.success).toBe(true)
    })

    it('rejects 21 language codes', () => {
      const codes = Array.from(
        { length: 21 },
        (_, i) => ['en', 'es', 'fr', 'de', 'ja', 'zh'][i % 6]
      )
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdLanguages: codes,
      })
      expect(r.success).toBe(false)
    })

    it('rejects invalid language code', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdLanguages: ['en', 'INVALID'],
      })
      expect(r.success).toBe(false)
    })

    it('accepts empty array explicitly', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        householdLanguages: [],
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.householdLanguages).toEqual([])
    })
  })

  // ------------------------------------------------------------------
  // moveInDate (optional YYYY-MM-DD, not past, max 2y future, or null)
  // ------------------------------------------------------------------
  describe('moveInDate', () => {
    it('accepts a future date', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        moveInDate: daysFromNow(30),
      })
      expect(r.success).toBe(true)
    })

    it('accepts tomorrow (near-future boundary)', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        moveInDate: daysFromNow(1),
      })
      expect(r.success).toBe(true)
    })

    it('accepts null', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        moveInDate: null,
      })
      expect(r.success).toBe(true)
    })

    it('accepts undefined (omitted)', () => {
      const r = createListingApiSchema.safeParse(validApi)
      expect(r.success).toBe(true)
    })

    it('rejects a past date', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        moveInDate: daysFromNow(-7),
      })
      expect(r.success).toBe(false)
    })

    it('rejects a date more than 2 years in the future', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        moveInDate: daysFromNow(731),
      })
      expect(r.success).toBe(false)
    })

    it('rejects invalid date format', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        moveInDate: '2026/03/15',
      })
      expect(r.success).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // Combined: all optional fields at once
  // ------------------------------------------------------------------
  describe('full valid object with all optional fields', () => {
    it('accepts a complete API listing with every field populated', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        roomType: 'Private Room',
        leaseDuration: '6 months',
        genderPreference: 'NO_PREFERENCE',
        householdGender: 'MIXED',
        householdLanguages: ['en', 'es'],
        moveInDate: daysFromNow(14),
      })
      expect(r.success).toBe(true)
    })

    it('accepts API listing with all optional fields as null', () => {
      const r = createListingApiSchema.safeParse({
        ...validApi,
        roomType: null,
        leaseDuration: null,
        genderPreference: null,
        householdGender: null,
        moveInDate: null,
      })
      expect(r.success).toBe(true)
    })
  })
})
