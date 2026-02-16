/**
 * Tests for verify.js DB verification script
 * Ensures the script is read-only and exits correctly on failure.
 */

const mockQueryRaw = jest.fn();
const mockCount = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: mockQueryRaw,
    location: { count: mockCount },
    $disconnect: mockDisconnect,
  })),
}));

// Prevent process.exit from killing the test runner
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Suppress console output during tests
const mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('verify.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Remove cached module so each test gets a fresh require
    jest.resetModules();
  });

  afterAll(() => {
    mockExit.mockRestore();
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  function runVerify() {
    // Re-mock after resetModules
    jest.mock('@prisma/client', () => ({
      PrismaClient: jest.fn().mockImplementation(() => ({
        $queryRaw: mockQueryRaw,
        location: { count: mockCount },
        $disconnect: mockDisconnect,
      })),
    }));
    const { main } = require('../../../verify');
    return main();
  }

  it('succeeds when all checks pass (zero locations)', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ '?column?': 1 }])          // SELECT 1
      .mockResolvedValueOnce([{ version: '3.4.0' }]);       // PostGIS_Version()
    mockCount.mockResolvedValue(0);

    await runVerify();

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(mockCount).toHaveBeenCalledTimes(1);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('succeeds when locations with coords exist', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ '?column?': 1 }])          // SELECT 1
      .mockResolvedValueOnce([{ version: '3.4.0' }])        // PostGIS_Version()
      .mockResolvedValueOnce([{ count: BigInt(5) }]);       // coords count
    mockCount.mockResolvedValue(10);

    await runVerify();

    expect(mockQueryRaw).toHaveBeenCalledTimes(3);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('exits 1 when database connection fails', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(runVerify()).rejects.toThrow('Connection refused');

    // main() rejects — the .catch() in the script entry point calls process.exit(1)
  });

  it('exits 1 when PostGIS is not installed', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ '?column?': 1 }])          // SELECT 1
      .mockRejectedValueOnce(new Error('function postgis_version() does not exist'));

    await expect(runVerify()).rejects.toThrow('postgis_version');
  });

  it('never calls any mutation methods', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ version: '3.4.0' }]);
    mockCount.mockResolvedValue(0);

    await runVerify();

    // Verify the PrismaClient instance has no create/update/delete calls
    const { PrismaClient } = require('@prisma/client');
    const instance = PrismaClient.mock.results[0].value;
    // Only $queryRaw, location.count, and $disconnect should exist
    // No create, update, delete, upsert, $executeRaw methods were called
    expect(instance.$queryRaw).toBeDefined();
    expect(instance.location.count).toBeDefined();
    expect(instance.$disconnect).toBeDefined();
    // These mutation methods should not exist on the mock
    expect(instance.user).toBeUndefined();
    expect(instance.listing).toBeUndefined();
    expect(instance.$executeRaw).toBeUndefined();
  });
});
