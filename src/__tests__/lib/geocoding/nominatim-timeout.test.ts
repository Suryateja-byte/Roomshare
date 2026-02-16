const mockFetchWithTimeout = jest.fn();
jest.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  FetchTimeoutError: jest.requireActual('@/lib/fetch-with-timeout').FetchTimeoutError,
}));

import { forwardGeocode, reverseGeocode, searchBoundary } from '@/lib/geocoding/nominatim';
import { FetchTimeoutError } from '@/lib/fetch-with-timeout';

describe('Nominatim adapter timeout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwardGeocode uses fetchWithTimeout with 5000ms', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '37.77', lon: '-122.41' }],
    });
    await forwardGeocode('San Francisco');
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org/search'),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('reverseGeocode uses fetchWithTimeout with 5000ms', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'SF' }),
    });
    await reverseGeocode(37.77, -122.41);
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org/reverse'),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('searchBoundary uses fetchWithTimeout with 5000ms', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: 'SF', boundingbox: ['37.7','37.8','-122.5','-122.4'] }],
    });
    await searchBoundary('San Francisco');
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org/search'),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('passes caller signal through', async () => {
    const controller = new AbortController();
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '37.77', lon: '-122.41' }],
    });
    await forwardGeocode('test', { signal: controller.signal });
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('propagates FetchTimeoutError', async () => {
    mockFetchWithTimeout.mockRejectedValue(
      new FetchTimeoutError('https://nominatim.openstreetmap.org/search?q=test', 5000),
    );
    await expect(forwardGeocode('test')).rejects.toThrow(FetchTimeoutError);
  });
});
