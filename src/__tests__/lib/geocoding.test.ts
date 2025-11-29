import { geocodeAddress } from '@/lib/geocoding'

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('geocodeAddress', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, NEXT_PUBLIC_MAPBOX_TOKEN: 'test-token' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return coordinates for valid address', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          {
            center: [-122.4194, 37.7749],
          },
        ],
      }),
    })

    const result = await geocodeAddress('123 Main St, San Francisco, CA')

    expect(result).toEqual({ lat: 37.7749, lng: -122.4194 })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.mapbox.com/geocoding/v5/mapbox.places')
    )
  })

  it('should return null when no Mapbox token', async () => {
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN

    const result = await geocodeAddress('123 Main St')

    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should return null when no results found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [],
      }),
    })

    const result = await geocodeAddress('Invalid Address XYZ123')

    expect(result).toBeNull()
  })

  it('should return null on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const result = await geocodeAddress('123 Main St')

    expect(result).toBeNull()
  })

  it('should return null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await geocodeAddress('123 Main St')

    expect(result).toBeNull()
  })

  it('should encode address properly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [{ center: [-122.4194, 37.7749] }],
      }),
    })

    await geocodeAddress('123 Main St, Apt #5')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('123 Main St, Apt #5'))
    )
  })

  it('should handle response with missing features', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    const result = await geocodeAddress('123 Main St')

    expect(result).toBeNull()
  })

  it('should use correct API URL format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [{ center: [0, 0] }],
      }),
    })

    await geocodeAddress('test')

    const calledUrl = mockFetch.mock.calls[0][0]
    expect(calledUrl).toContain('api.mapbox.com/geocoding/v5/mapbox.places')
    expect(calledUrl).toContain('access_token=test-token')
    expect(calledUrl).toContain('limit=1')
  })
})
