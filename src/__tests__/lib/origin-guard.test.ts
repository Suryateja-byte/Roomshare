/**
 * Tests for origin-guard utility
 * Validates allowed-origin/host parsing and enforcement.
 */

describe('origin-guard', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('getAllowedOrigins', () => {
    it('parses a comma-separated ALLOWED_ORIGINS env variable', async () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com,https://api.example.com';
      (process.env as any).NODE_ENV = 'production';
      const { getAllowedOrigins } = await import('@/lib/origin-guard');
      expect(getAllowedOrigins()).toEqual(['https://example.com', 'https://api.example.com']);
    });

    it('adds localhost:3000 in development mode', async () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com';
      (process.env as any).NODE_ENV = 'development';
      const { getAllowedOrigins } = await import('@/lib/origin-guard');
      expect(getAllowedOrigins()).toContain('http://localhost:3000');
    });

    it('returns an empty array when ALLOWED_ORIGINS is unset and not in development', async () => {
      delete process.env.ALLOWED_ORIGINS;
      (process.env as any).NODE_ENV = 'production';
      const { getAllowedOrigins } = await import('@/lib/origin-guard');
      expect(getAllowedOrigins()).toEqual([]);
    });
  });

  describe('isOriginAllowed', () => {
    it('returns true for an origin in the allowed list', async () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com';
      (process.env as any).NODE_ENV = 'production';
      const { isOriginAllowed } = await import('@/lib/origin-guard');
      expect(isOriginAllowed('https://example.com')).toBe(true);
    });

    it('returns false for an origin not in the allowed list', async () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com';
      (process.env as any).NODE_ENV = 'production';
      const { isOriginAllowed } = await import('@/lib/origin-guard');
      expect(isOriginAllowed('https://evil.com')).toBe(false);
    });

    it('returns false for a null origin', async () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com';
      (process.env as any).NODE_ENV = 'production';
      const { isOriginAllowed } = await import('@/lib/origin-guard');
      expect(isOriginAllowed(null)).toBe(false);
    });
  });

  describe('getAllowedHosts', () => {
    it('parses a comma-separated ALLOWED_HOSTS env variable', async () => {
      process.env.ALLOWED_HOSTS = 'example.com,api.example.com';
      (process.env as any).NODE_ENV = 'production';
      const { getAllowedHosts } = await import('@/lib/origin-guard');
      expect(getAllowedHosts()).toEqual(['example.com', 'api.example.com']);
    });
  });

  describe('isHostAllowed', () => {
    it('strips port and matches host-only entry', async () => {
      process.env.ALLOWED_HOSTS = 'example.com';
      (process.env as any).NODE_ENV = 'production';
      const { isHostAllowed } = await import('@/lib/origin-guard');
      // Host header includes port — should still match bare hostname entry
      expect(isHostAllowed('example.com:443')).toBe(true);
    });

    it('returns false for a null host', async () => {
      process.env.ALLOWED_HOSTS = 'example.com';
      (process.env as any).NODE_ENV = 'production';
      const { isHostAllowed } = await import('@/lib/origin-guard');
      expect(isHostAllowed(null)).toBe(false);
    });

    it('matches an exact host:port entry', async () => {
      process.env.ALLOWED_HOSTS = 'example.com:8080';
      (process.env as any).NODE_ENV = 'production';
      const { isHostAllowed } = await import('@/lib/origin-guard');
      expect(isHostAllowed('example.com:8080')).toBe(true);
    });

    it('matches localhost in development without a port', async () => {
      delete process.env.ALLOWED_HOSTS;
      (process.env as any).NODE_ENV = 'development';
      const { isHostAllowed } = await import('@/lib/origin-guard');
      expect(isHostAllowed('localhost')).toBe(true);
    });
  });
});
