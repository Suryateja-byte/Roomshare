const mockFetchWithTimeout = jest.fn();
jest.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  FetchTimeoutError: jest.requireActual('@/lib/fetch-with-timeout').FetchTimeoutError,
}));

import { searchPhoton } from '@/lib/geocoding/photon';
import { FetchTimeoutError } from '@/lib/fetch-with-timeout';

describe('Photon adapter timeout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses fetchWithTimeout with 5000ms', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });
    await searchPhoton('test');
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining('photon.komoot.io/api'),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('passes caller signal through', async () => {
    const controller = new AbortController();
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });
    await searchPhoton('test', { signal: controller.signal });
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('propagates FetchTimeoutError', async () => {
    mockFetchWithTimeout.mockRejectedValue(
      new FetchTimeoutError('https://photon.komoot.io/api?q=test', 5000),
    );
    await expect(searchPhoton('test')).rejects.toThrow(FetchTimeoutError);
  });
});
