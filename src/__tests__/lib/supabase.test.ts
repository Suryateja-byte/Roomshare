describe("Supabase realtime helpers", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  async function loadSupabaseModule() {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };

    const mockSetAuth = jest.fn();
    const mockChannel = jest.fn(() => ({ id: "channel" }));
    const mockCreateClient = jest.fn(() => ({
      realtime: { setAuth: mockSetAuth },
      channel: mockChannel,
    }));

    jest.doMock("@supabase/supabase-js", () => ({
      createClient: mockCreateClient,
    }));

    const module = await import("@/lib/supabase");
    return { module, mockSetAuth, mockChannel };
  }

  afterEach(() => {
    jest.resetModules();
    jest.dontMock("@supabase/supabase-js");
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("fetches a scoped realtime token and installs it on the Supabase client", async () => {
    const { module, mockSetAuth } = await loadSupabaseModule();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "signed-realtime-token", expiresIn: 300 }),
    }) as unknown as typeof fetch;

    const result =
      await module.authenticateRealtimeForConversation("conv-123");

    expect(result).toEqual({ ok: true, expiresIn: 300 });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/messages/realtime-token?conversationId=conv-123",
      {
        method: "GET",
        cache: "no-store",
      }
    );
    expect(mockSetAuth).toHaveBeenCalledWith("signed-realtime-token");
  });

  it("normalizes a missing or invalid expiresIn to null", async () => {
    const { module, mockSetAuth } = await loadSupabaseModule();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "signed-realtime-token", expiresIn: "300" }),
    }) as unknown as typeof fetch;

    const result =
      await module.authenticateRealtimeForConversation("conv-123");

    expect(result).toEqual({ ok: true, expiresIn: null });
    expect(mockSetAuth).toHaveBeenCalledWith("signed-realtime-token");
  });

  it("returns a failed auth result when the token endpoint rejects", async () => {
    const { module, mockSetAuth } = await loadSupabaseModule();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Realtime messaging is not configured" }),
    }) as unknown as typeof fetch;

    const result =
      await module.authenticateRealtimeForConversation("conv-123");

    expect(result).toEqual({ ok: false, status: 503 });
    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  it("creates private chat channels for broadcast and presence authorization", async () => {
    const { module, mockChannel } = await loadSupabaseModule();

    const channel = module.createChatChannel("conv-123");

    expect(channel).toEqual({ id: "channel" });
    expect(mockChannel).toHaveBeenCalledWith("chat:conv-123", {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: "conv-123" },
      },
    });
  });
});
