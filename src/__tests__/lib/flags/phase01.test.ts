describe("phase01 flags", () => {
  const originalEnv = process.env;
  const setNodeEnv = (value: NodeJS.ProcessEnv["NODE_ENV"]) => {
    process.env = { ...process.env, NODE_ENV: value };
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_PHASE01_CANONICAL_WRITES;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults canonical writes to true in non-production", async () => {
    setNodeEnv("test");
    const { isPhase01CanonicalWritesEnabled } = await import("@/lib/flags/phase01");
    expect(isPhase01CanonicalWritesEnabled()).toBe(true);
  });

  it("defaults canonical writes to false in production", async () => {
    setNodeEnv("production");
    const { isPhase01CanonicalWritesEnabled } = await import("@/lib/flags/phase01");
    expect(isPhase01CanonicalWritesEnabled()).toBe(false);
  });

  it("reads FEATURE_PHASE01_CANONICAL_WRITES", async () => {
    process.env.FEATURE_PHASE01_CANONICAL_WRITES = "true";
    const { isPhase01CanonicalWritesEnabled } = await import("@/lib/flags/phase01");
    expect(isPhase01CanonicalWritesEnabled()).toBe(true);
  });

  it("exports the stub kill switches and keeps them false", async () => {
    const { PHASE01_KILL_SWITCHES, isKillSwitchActive } = await import(
      "@/lib/flags/phase01"
    );

    expect(PHASE01_KILL_SWITCHES).toEqual({
      disable_new_publication: false,
      pause_identity_reconcile: false,
    });
    expect(isKillSwitchActive("disable_new_publication")).toBe(false);
    expect(isKillSwitchActive("pause_identity_reconcile")).toBe(false);
  });
});
