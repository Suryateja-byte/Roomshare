import { parseSearchParams, MAX_SAFE_PAGE } from '@/lib/search-params'

const formatLocalDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().split('T')[0]
}

const today = formatLocalDate(new Date())
const tomorrow = formatLocalDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const nextYearDate = new Date()
nextYearDate.setFullYear(nextYearDate.getFullYear() + 1)
const nextYear = formatLocalDate(nextYearDate)
const farFutureDate = new Date()
farFutureDate.setFullYear(farFutureDate.getFullYear() + 3)
const farFuture = formatLocalDate(farFutureDate)

const manyLanguages = [
  'en', 'es', 'zh', 'hi', 'ar', 'pt', 'ru', 'ja', 'de', 'fr',
  'ko', 'vi', 'it', 'nl', 'pl', 'tr', 'th', 'te', 'ta', 'bn',
  'pa', 'gu', 'mr', 'kn', 'ml', 'ur'
]

describe('parseSearchParams - query cases', () => {
  const cases: Array<[string, string | string[] | undefined, string | undefined]> = [
    ['simple', 'downtown', 'downtown'],
    ['trimmed', '  downtown  ', 'downtown'],
    ['single char', 'a', 'a'],
    ['single char trimmed', '  a ', 'a'],
    ['whitespace only', '   ', undefined],
    ['tabs/newlines', '\n\t', undefined],
    ['unicode', '北京', '北京'],
    ['punctuation', 'St. Louis', 'St. Louis'],
    ['comma', 'Austin, TX', 'Austin, TX'],
    ['plus', 'room + bath', 'room + bath'],
    ['hyphen', 'co-living', 'co-living'],
    ['array uses first', ['first', 'second'], 'first'],
  ]

  test.each(cases)('%s', (_label, q, expected) => {
    const result = parseSearchParams({ q })
    expect(result.q).toBe(expected)
    expect(result.filterParams.query).toBe(expected)
  })
})

describe('parseSearchParams - price cases', () => {
  const cases: Array<[string, string | undefined, string | undefined, number | undefined, number | undefined]> = [
    ['min zero', '0', undefined, 0, undefined],
    ['max zero', undefined, '0', undefined, 0],
    ['negative min clamps', '-50', undefined, 0, undefined],
    ['negative max clamps', undefined, '-10', undefined, 0],
    ['normal range', '500', '1000', 500, 1000],
    ['swap range', '2000', '1000', 1000, 2000],
    ['trim min', ' 750 ', undefined, 750, undefined],
    ['trim max', undefined, ' 2500 ', undefined, 2500],
    ['min too large clamps', '10000000000', undefined, 1000000000, undefined],
    ['max too large clamps', undefined, '10000000000', undefined, 1000000000],
    ['min infinity ignored', 'Infinity', undefined, undefined, undefined],
    ['max overflow ignored', undefined, '1e309', undefined, undefined],
    ['min NaN ignored', 'NaN', undefined, undefined, undefined],
    ['decimal min', '0.99', undefined, 0.99, undefined],
    ['decimal max', undefined, '1234.56', undefined, 1234.56],
  ]

  test.each(cases)('%s', (_label, minPrice, maxPrice, expectedMin, expectedMax) => {
    const result = parseSearchParams({ minPrice, maxPrice })
    expect(result.filterParams.minPrice).toBe(expectedMin)
    expect(result.filterParams.maxPrice).toBe(expectedMax)
  })
})

describe('parseSearchParams - amenity cases', () => {
  const cases: Array<[string, string | string[] | undefined, string[] | undefined]> = [
    ['single', 'Wifi', ['Wifi']],
    ['case normalize', 'wifi', ['Wifi']],
    ['comma list', 'Wifi,Parking', ['Wifi', 'Parking']],
    ['array list', ['Parking', 'Kitchen'], ['Parking', 'Kitchen']],
    ['dedupe', ['Parking', 'parking', 'PARKING'], ['Parking']],
    ['invalid dropped', 'Invalid', undefined],
    ['mixed valid/invalid', 'Wifi,Invalid', ['Wifi']],
    ['full set', 'Wifi,Parking,Kitchen,Pool,AC,Dryer,Washer,Gym', ['Wifi', 'Parking', 'Kitchen', 'Pool', 'AC', 'Dryer', 'Washer', 'Gym']],
    ['empty string', '', undefined],
    ['trimmed values', ['Wifi', ' Parking '], ['Wifi', 'Parking']],
  ]

  test.each(cases)('%s', (_label, amenities, expected) => {
    const result = parseSearchParams({ amenities })
    expect(result.filterParams.amenities).toEqual(expected)
  })
})

describe('parseSearchParams - house rules cases', () => {
  const cases: Array<[string, string | string[] | undefined, string[] | undefined]> = [
    ['single', 'Pets allowed', ['Pets allowed']],
    ['case normalize', 'pets allowed', ['Pets allowed']],
    ['comma list', 'Pets allowed,Smoking allowed', ['Pets allowed', 'Smoking allowed']],
    ['array list', ['Guests allowed', 'Couples allowed'], ['Guests allowed', 'Couples allowed']],
    ['dedupe', ['Guests allowed', 'guests allowed'], ['Guests allowed']],
    ['invalid dropped', 'No pets', undefined],
    ['mixed valid/invalid', 'Pets allowed,Invalid', ['Pets allowed']],
    ['full set', 'Pets allowed,Smoking allowed,Couples allowed,Guests allowed', ['Pets allowed', 'Smoking allowed', 'Couples allowed', 'Guests allowed']],
    ['empty string', '', undefined],
    ['trimmed values', ['Pets allowed', ' Guests allowed '], ['Pets allowed', 'Guests allowed']],
  ]

  test.each(cases)('%s', (_label, houseRules, expected) => {
    const result = parseSearchParams({ houseRules })
    expect(result.filterParams.houseRules).toEqual(expected)
  })
})

describe('parseSearchParams - language cases', () => {
  const cases: Array<[string, string | string[] | undefined, string[] | undefined]> = [
    ['code', 'en', ['en']],
    ['uppercase code', 'EN', ['en']],
    ['legacy name', 'English', ['en']],
    ['legacy pair', ['English', 'Spanish'], ['en', 'es']],
    ['dedupe codes', ['es', 'Spanish'], ['es']],
    ['invalid dropped', 'xyz', undefined],
    ['comma list', 'en,es', ['en', 'es']],
    ['array dedupe', ['en', 'es', 'en'], ['en', 'es']],
    ['mandarin alias', 'Mandarin', ['zh']],
    ['telugu alias', 'Telugu', ['te']],
    ['mixed with invalid', ['en', 'invalid', 'es'], ['en', 'es']],
    ['max items', manyLanguages, manyLanguages.slice(0, 20)],
  ]

  test.each(cases)('%s', (_label, languages, expected) => {
    const result = parseSearchParams({ languages })
    expect(result.filterParams.languages).toEqual(expected)
  })
})

describe('parseSearchParams - enum cases', () => {
  const cases: Array<[string, Partial<{ roomType: string; leaseDuration: string; genderPreference: string; householdGender: string }>, Partial<{ roomType?: string; leaseDuration?: string; genderPreference?: string; householdGender?: string }>]> = [
    ['room type valid', { roomType: 'Private Room' }, { roomType: 'Private Room' }],
    ['room type any', { roomType: 'any' }, { roomType: undefined }],
    ['room type invalid', { roomType: 'private room' }, { roomType: undefined }],
    ['lease duration valid', { leaseDuration: '6 months' }, { leaseDuration: '6 months' }],
    ['lease duration any', { leaseDuration: 'any' }, { leaseDuration: undefined }],
    ['lease duration invalid', { leaseDuration: '6 Months' }, { leaseDuration: undefined }],
    ['gender pref valid', { genderPreference: 'MALE_ONLY' }, { genderPreference: 'MALE_ONLY' }],
    ['gender pref any', { genderPreference: 'any' }, { genderPreference: undefined }],
    ['household gender valid', { householdGender: 'MIXED' }, { householdGender: 'MIXED' }],
    ['household gender invalid', { householdGender: 'all_male' }, { householdGender: undefined }],
  ]

  test.each(cases)('%s', (_label, input, expected) => {
    const result = parseSearchParams(input)
    expect(result.filterParams.roomType).toBe(expected.roomType)
    expect(result.filterParams.leaseDuration).toBe(expected.leaseDuration)
    expect(result.filterParams.genderPreference).toBe(expected.genderPreference)
    expect(result.filterParams.householdGender).toBe(expected.householdGender)
  })
})

describe('parseSearchParams - date cases', () => {
  const cases: Array<[string, string | undefined, string | undefined]> = [
    ['today valid', today, today],
    ['tomorrow valid', tomorrow, tomorrow],
    ['next year valid', nextYear, nextYear],
    ['trimmed valid', ` ${tomorrow} `, tomorrow],
    ['invalid format slash', '2024/01/01', undefined],
    ['invalid format short', '2024-1-1', undefined],
    ['invalid format time', `${tomorrow}T00:00:00`, undefined],
    ['invalid date', '2024-02-30', undefined],
    ['past date', '2000-01-01', undefined],
    ['far future', farFuture, undefined],
  ]

  test.each(cases)('%s', (_label, moveInDate, expected) => {
    const result = parseSearchParams({ moveInDate })
    expect(result.filterParams.moveInDate).toBe(expected)
  })
})

describe('parseSearchParams - bounds cases', () => {
  test('lat only -> no bounds', () => {
    const result = parseSearchParams({ lat: '10' })
    expect(result.filterParams.bounds).toBeUndefined()
  })

  test('lng only -> no bounds', () => {
    const result = parseSearchParams({ lng: '10' })
    expect(result.filterParams.bounds).toBeUndefined()
  })

  test('invalid lat/lng -> no bounds', () => {
    const result = parseSearchParams({ lat: 'abc', lng: 'def' })
    expect(result.filterParams.bounds).toBeUndefined()
  })

  test('incomplete explicit bounds -> no bounds', () => {
    const result = parseSearchParams({ minLat: '1', maxLat: '2', minLng: '3' })
    expect(result.filterParams.bounds).toBeUndefined()
  })

  test('explicit bounds swap min/max lat', () => {
    const result = parseSearchParams({ minLat: '20', maxLat: '10', minLng: '3', maxLng: '4' })
    expect(result.filterParams.bounds).toEqual({ minLat: 10, maxLat: 20, minLng: 3, maxLng: 4 })
  })

  test('explicit bounds preserve antimeridian lng', () => {
    const result = parseSearchParams({ minLat: '1', maxLat: '2', minLng: '170', maxLng: '-170' })
    expect(result.filterParams.bounds).toEqual({ minLat: 1, maxLat: 2, minLng: 170, maxLng: -170 })
  })

  test('lat at 90 clamps maxLat', () => {
    const result = parseSearchParams({ lat: '90', lng: '0' })
    expect(result.filterParams.bounds?.maxLat).toBe(90)
  })

  test('lat at -90 clamps minLat', () => {
    const result = parseSearchParams({ lat: '-90', lng: '0' })
    expect(result.filterParams.bounds?.minLat).toBe(-90)
  })

  test('lng at 180 clamps maxLng', () => {
    const result = parseSearchParams({ lat: '0', lng: '180' })
    expect(result.filterParams.bounds?.maxLng).toBe(180)
  })

  test('lng at -180 clamps minLng', () => {
    const result = parseSearchParams({ lat: '0', lng: '-180' })
    expect(result.filterParams.bounds?.minLng).toBe(-180)
  })

  test('explicit bounds override lat/lng', () => {
    const result = parseSearchParams({ minLat: '1', maxLat: '2', minLng: '3', maxLng: '4', lat: '50', lng: '60' })
    expect(result.filterParams.bounds).toEqual({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 })
  })
})

describe('parseSearchParams - sort cases', () => {
  const sorts = ['recommended', 'price_asc', 'price_desc', 'newest', 'rating'] as const
  test.each(sorts)('valid sort: %s', (sort) => {
    const result = parseSearchParams({ sort })
    expect(result.sortOption).toBe(sort)
  })

  const invalidSorts = ['BAD', 'price', 'desc', 'new', '']
  test.each(invalidSorts)('invalid sort: %s', (sort) => {
    const result = parseSearchParams({ sort })
    expect(result.sortOption).toBe('recommended')
  })
})

describe('parseSearchParams - page cases', () => {
  const cases: Array<[string, string | undefined, number]> = [
    ['undefined page', undefined, 1],
    ['page zero', '0', 1],
    ['page negative', '-5', 1],
    ['page normal', '2', 2],
    ['page too large', '9999', MAX_SAFE_PAGE],
  ]

  test.each(cases)('%s', (_label, page, expected) => {
    const result = parseSearchParams({ page })
    expect(result.requestedPage).toBe(expected)
  })
})
