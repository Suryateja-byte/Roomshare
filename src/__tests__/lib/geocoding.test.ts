import { geocodeAddress } from '@/lib/geocoding'

// Mock the Nominatim adapter
const mockForwardGeocode = jest.fn()
jest.mock('@/lib/geocoding/nominatim', () => ({
  forwardGeocode: (...args: unknown[]) => mockForwardGeocode(...args),
}))

// Mock the circuit breaker to just execute the callback directly
jest.mock('@/lib/circuit-breaker', () => ({
  circuitBreakers: {
    nominatimGeocode: {
      execute: (fn: () => Promise<unknown>) => fn(),
    },
  },
  isCircuitOpenError: jest.fn(() => false),
}))

// Mock the logger
jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}))

describe('geocodeAddress', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return coordinates for valid address', async () => {
    mockForwardGeocode.mockResolvedValueOnce({ lat: 37.7749, lng: -122.4194 })

    const result = await geocodeAddress('123 Main St, San Francisco, CA')

    expect(result).toEqual({ lat: 37.7749, lng: -122.4194 })
    expect(mockForwardGeocode).toHaveBeenCalledWith('123 Main St, San Francisco, CA')
  })

  it('should return null when no results found', async () => {
    mockForwardGeocode.mockResolvedValueOnce(null)

    const result = await geocodeAddress('Invalid Address XYZ123')

    expect(result).toBeNull()
  })

  it('should return null on API error', async () => {
    mockForwardGeocode.mockRejectedValueOnce(new Error('Request failed'))

    const result = await geocodeAddress('123 Main St')

    expect(result).toBeNull()
  })

  it('should return null on network error', async () => {
    mockForwardGeocode.mockRejectedValueOnce(new Error('Network error'))

    const result = await geocodeAddress('123 Main St')

    expect(result).toBeNull()
  })

  it('should pass address to forwardGeocode', async () => {
    mockForwardGeocode.mockResolvedValueOnce({ lat: 37.7749, lng: -122.4194 })

    await geocodeAddress('123 Main St, Apt #5')

    expect(mockForwardGeocode).toHaveBeenCalledWith('123 Main St, Apt #5')
  })

  it('should handle undefined return from forwardGeocode', async () => {
    mockForwardGeocode.mockResolvedValueOnce(undefined)

    const result = await geocodeAddress('123 Main St')

    // forwardGeocode returns undefined, which is falsy, so geocodeAddress returns null
    expect(result).toBeNull()
  })
})
