import { buildSearchUrl, SearchFilters } from '@/lib/search-utils'

describe('buildSearchUrl', () => {
  it('should build URL with query parameter', () => {
    const filters: SearchFilters = { query: 'downtown' }
    const url = buildSearchUrl(filters)
    expect(url).toBe('/search?q=downtown')
  })

  it('should build URL with price filters', () => {
    const filters: SearchFilters = { minPrice: 500, maxPrice: 1000 }
    const url = buildSearchUrl(filters)
    expect(url).toContain('minPrice=500')
    expect(url).toContain('maxPrice=1000')
  })

  it('should build URL with amenities', () => {
    const filters: SearchFilters = { amenities: ['WiFi', 'Parking'] }
    const url = buildSearchUrl(filters)
    expect(url).toContain('amenities=WiFi%2CParking')
  })

  it('should build URL with moveInDate', () => {
    const filters: SearchFilters = { moveInDate: '2024-02-01' }
    const url = buildSearchUrl(filters)
    expect(url).toContain('moveInDate=2024-02-01')
  })

  it('should build URL with leaseDuration', () => {
    const filters: SearchFilters = { leaseDuration: '6 months' }
    const url = buildSearchUrl(filters)
    expect(url).toContain('leaseDuration=6+months')
  })

  it('should build URL with houseRules', () => {
    const filters: SearchFilters = { houseRules: ['No Smoking', 'No Pets'] }
    const url = buildSearchUrl(filters)
    expect(url).toContain('houseRules=No+Smoking%2CNo+Pets')
  })

  it('should build URL with roomType', () => {
    const filters: SearchFilters = { roomType: 'Private' }
    const url = buildSearchUrl(filters)
    expect(url).toContain('roomType=Private')
  })

  it('should build URL with all filters', () => {
    const filters: SearchFilters = {
      query: 'downtown',
      minPrice: 500,
      maxPrice: 1000,
      amenities: ['WiFi'],
      moveInDate: '2024-02-01',
      leaseDuration: '6 months',
      houseRules: ['No Smoking'],
      roomType: 'Private',
    }
    const url = buildSearchUrl(filters)
    expect(url).toContain('q=downtown')
    expect(url).toContain('minPrice=500')
    expect(url).toContain('maxPrice=1000')
    expect(url).toContain('amenities=WiFi')
    expect(url).toContain('moveInDate=2024-02-01')
    expect(url).toContain('leaseDuration=6+months')
    expect(url).toContain('houseRules=No+Smoking')
    expect(url).toContain('roomType=Private')
  })

  it('should handle empty filters', () => {
    const filters: SearchFilters = {}
    const url = buildSearchUrl(filters)
    expect(url).toBe('/search?')
  })

  it('should not include undefined values', () => {
    const filters: SearchFilters = { query: 'test', minPrice: undefined }
    const url = buildSearchUrl(filters)
    expect(url).toBe('/search?q=test')
    expect(url).not.toContain('minPrice')
  })

  it('should not include empty amenities array', () => {
    const filters: SearchFilters = { amenities: [] }
    const url = buildSearchUrl(filters)
    expect(url).not.toContain('amenities')
  })

  it('should not include empty houseRules array', () => {
    const filters: SearchFilters = { houseRules: [] }
    const url = buildSearchUrl(filters)
    expect(url).not.toContain('houseRules')
  })

  it('should handle special characters in query', () => {
    const filters: SearchFilters = { query: 'test & search' }
    const url = buildSearchUrl(filters)
    expect(url).toContain('q=test+%26+search')
  })

  it('should handle city filter', () => {
    const filters: SearchFilters = { city: 'San Francisco' }
    const url = buildSearchUrl(filters)
    // city is not added to URL in current implementation
    expect(url).toBe('/search?')
  })
})

describe('SearchFilters interface', () => {
  it('should allow all optional properties', () => {
    const filters: SearchFilters = {
      query: 'test',
      minPrice: 100,
      maxPrice: 1000,
      amenities: ['WiFi'],
      moveInDate: '2024-01-01',
      leaseDuration: '12 months',
      houseRules: ['No Pets'],
      roomType: 'Shared',
      city: 'NYC',
    }
    expect(filters.query).toBe('test')
    expect(filters.minPrice).toBe(100)
    expect(filters.maxPrice).toBe(1000)
    expect(filters.amenities).toEqual(['WiFi'])
    expect(filters.moveInDate).toBe('2024-01-01')
    expect(filters.leaseDuration).toBe('12 months')
    expect(filters.houseRules).toEqual(['No Pets'])
    expect(filters.roomType).toBe('Shared')
    expect(filters.city).toBe('NYC')
  })
})
