describe("phase04 flags", () => {
  const originalEnv = process.env;
  const setNodeEnv = (value: NodeJS.ProcessEnv["NODE_ENV"]) => {
    process.env = { ...process.env, NODE_ENV: value };
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_PHASE04_PROJECTION_READS;
    delete process.env.KILL_SWITCH_FORCE_LIST_ONLY;
    delete process.env.KILL_SWITCH_FORCE_CLUSTERS_ONLY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults projection reads on outside production and off in production", async () => {
    setNodeEnv("test");
    let flags = await import("@/lib/flags/phase04");
    expect(flags.isPhase04ProjectionReadsEnabled()).toBe(true);

    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "production" };
    flags = await import("@/lib/flags/phase04");
    expect(flags.isPhase04ProjectionReadsEnabled()).toBe(false);
  });

  it("honors explicit projection-read overrides", async () => {
    process.env.FEATURE_PHASE04_PROJECTION_READS = "false";
    let flags = await import("@/lib/flags/phase04");
    expect(flags.isPhase04ProjectionReadsEnabled()).toBe(false);

    jest.resetModules();
    process.env = {
      ...originalEnv,
      FEATURE_PHASE04_PROJECTION_READS: "true",
    };
    flags = await import("@/lib/flags/phase04");
    expect(flags.isPhase04ProjectionReadsEnabled()).toBe(true);
  });

  it("resolves list and cluster kill switches from env", async () => {
    let flags = await import("@/lib/flags/phase04");
    expect(flags.PHASE04_KILL_SWITCHES).toEqual({
      force_list_only: false,
      force_clusters_only: false,
    });
    expect(flags.isPhase04KillSwitchActive("force_list_only")).toBe(false);
    expect(flags.isPhase04KillSwitchActive("force_clusters_only")).toBe(false);

    jest.resetModules();
    process.env = {
      ...originalEnv,
      KILL_SWITCH_FORCE_LIST_ONLY: "true",
      KILL_SWITCH_FORCE_CLUSTERS_ONLY: "true",
    };
    flags = await import("@/lib/flags/phase04");
    expect(flags.isPhase04KillSwitchActive("force_list_only")).toBe(true);
    expect(flags.isPhase04KillSwitchActive("force_clusters_only")).toBe(true);
  });
});
