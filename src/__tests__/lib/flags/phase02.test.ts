/**
 * Tests for src/lib/flags/phase02.ts
 */

export {}; // Make this a module to avoid block-scoped variable conflicts

const originalEnv = { ...process.env };
const setNodeEnv = (value: NodeJS.ProcessEnv["NODE_ENV"]) => {
  process.env = { ...process.env, NODE_ENV: value };
};

afterEach(() => {
  // Restore env after each test
  Object.keys(process.env).forEach((k) => {
    if (!(k in originalEnv)) delete process.env[k];
  });
  Object.keys(originalEnv).forEach((k) => {
    process.env[k] = originalEnv[k];
  });
  jest.resetModules();
});

describe("isPhase02ProjectionWritesEnabled()", () => {
  it("returns true in non-production when FEATURE_PHASE02_PROJECTION_WRITES is unset", async () => {
    delete process.env.FEATURE_PHASE02_PROJECTION_WRITES;
    setNodeEnv("test");
    jest.resetModules();
    const { isPhase02ProjectionWritesEnabled } = await import("@/lib/flags/phase02");
    expect(isPhase02ProjectionWritesEnabled()).toBe(true);
  });

  it("returns false in production when FEATURE_PHASE02_PROJECTION_WRITES is unset", async () => {
    delete process.env.FEATURE_PHASE02_PROJECTION_WRITES;
    setNodeEnv("production");
    jest.resetModules();
    const { isPhase02ProjectionWritesEnabled } = await import("@/lib/flags/phase02");
    expect(isPhase02ProjectionWritesEnabled()).toBe(false);
  });

  it("returns true when FEATURE_PHASE02_PROJECTION_WRITES=true", async () => {
    process.env.FEATURE_PHASE02_PROJECTION_WRITES = "true";
    jest.resetModules();
    const { isPhase02ProjectionWritesEnabled } = await import("@/lib/flags/phase02");
    expect(isPhase02ProjectionWritesEnabled()).toBe(true);
  });

  it("returns false when FEATURE_PHASE02_PROJECTION_WRITES=false", async () => {
    process.env.FEATURE_PHASE02_PROJECTION_WRITES = "false";
    jest.resetModules();
    const { isPhase02ProjectionWritesEnabled } = await import("@/lib/flags/phase02");
    expect(isPhase02ProjectionWritesEnabled()).toBe(false);
  });
});

describe("PHASE02_KILL_SWITCHES", () => {
  it("defines all three kill switch keys", async () => {
    const { PHASE02_KILL_SWITCHES } = await import("@/lib/flags/phase02");
    expect(PHASE02_KILL_SWITCHES).toHaveProperty("disable_new_publication");
    expect(PHASE02_KILL_SWITCHES).toHaveProperty("pause_geocode_publish");
    expect(PHASE02_KILL_SWITCHES).toHaveProperty("pause_backfills_and_repairs");
  });
});

describe("isKillSwitchActive()", () => {
  it("returns false for disable_new_publication when env unset", async () => {
    delete process.env.KILL_SWITCH_DISABLE_NEW_PUBLICATION;
    jest.resetModules();
    const { isKillSwitchActive } = await import("@/lib/flags/phase02");
    expect(isKillSwitchActive("disable_new_publication")).toBe(false);
  });

  it("returns true for disable_new_publication when env=true", async () => {
    process.env.KILL_SWITCH_DISABLE_NEW_PUBLICATION = "true";
    jest.resetModules();
    const { isKillSwitchActive } = await import("@/lib/flags/phase02");
    expect(isKillSwitchActive("disable_new_publication")).toBe(true);
  });

  it("returns false for pause_geocode_publish when env unset", async () => {
    delete process.env.KILL_SWITCH_PAUSE_GEOCODE_PUBLISH;
    jest.resetModules();
    const { isKillSwitchActive } = await import("@/lib/flags/phase02");
    expect(isKillSwitchActive("pause_geocode_publish")).toBe(false);
  });

  it("returns true for pause_geocode_publish when env=true", async () => {
    process.env.KILL_SWITCH_PAUSE_GEOCODE_PUBLISH = "true";
    jest.resetModules();
    const { isKillSwitchActive } = await import("@/lib/flags/phase02");
    expect(isKillSwitchActive("pause_geocode_publish")).toBe(true);
  });

  it("returns false for pause_backfills_and_repairs when env unset", async () => {
    delete process.env.KILL_SWITCH_PAUSE_BACKFILLS_AND_REPAIRS;
    jest.resetModules();
    const { isKillSwitchActive } = await import("@/lib/flags/phase02");
    expect(isKillSwitchActive("pause_backfills_and_repairs")).toBe(false);
  });

  it("returns true for pause_backfills_and_repairs when env=true", async () => {
    process.env.KILL_SWITCH_PAUSE_BACKFILLS_AND_REPAIRS = "true";
    jest.resetModules();
    const { isKillSwitchActive } = await import("@/lib/flags/phase02");
    expect(isKillSwitchActive("pause_backfills_and_repairs")).toBe(true);
  });
});
