describe("instrumentation startup", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NEXT_RUNTIME: "nodejs",
      NODE_ENV: "test",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.dontMock("../lib/env");
    jest.dontMock("../lib/shutdown");
  });

  it("validates server env before startup warnings", async () => {
    const calls: string[] = [];
    const getServerEnv = jest.fn(() => {
      calls.push("validate");
      return process.env;
    });
    const logStartupWarnings = jest.fn(() => {
      calls.push("warnings");
    });

    jest.doMock("../lib/env", () => ({
      getServerEnv,
      logStartupWarnings,
    }));
    jest.doMock("../lib/shutdown", () => ({
      registerShutdownHandlers: jest.fn(),
    }));

    const { register } = await import("../../instrumentation");
    await register();

    expect(getServerEnv).toHaveBeenCalledTimes(1);
    expect(logStartupWarnings).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["validate", "warnings"]);
  });
});
