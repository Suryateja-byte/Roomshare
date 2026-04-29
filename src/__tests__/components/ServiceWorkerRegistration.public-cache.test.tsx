import "@testing-library/jest-dom";
import { act, render, waitFor } from "@testing-library/react";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PUBLIC_CACHE_INVALIDATED_EVENT } from "@/lib/public-cache/client";

type EventSourceListener = (event: MessageEvent) => void;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    value,
  });
}

describe("ServiceWorkerRegistration public cache coherence", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalServiceWorker = navigator.serviceWorker;
  const originalCaches = window.caches;
  const originalReadyState = document.readyState;
  const originalVisibilityState = document.visibilityState;
  const originalEventSource = global.EventSource;
  const originalFetch = global.fetch;

  class MockEventSource {
    static instances: MockEventSource[] = [];

    url: string;
    close = jest.fn();
    private listeners = new Map<string, EventSourceListener[]>();

    constructor(url: string) {
      this.url = url;
      MockEventSource.instances.push(this);
    }

    addEventListener(type: string, listener: EventSourceListener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    emit(type: string, data: unknown) {
      const event = new MessageEvent(type, { data: JSON.stringify(data) });
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  const postMessageMock = jest.fn();
  const registerMock = jest.fn();
  const getRegistrationsMock = jest.fn();
  const updateMock = jest.fn();
  const addServiceWorkerListenerMock = jest.fn();
  const removeServiceWorkerListenerMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setNodeEnv("production");
    MockEventSource.instances = [];

    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: "complete",
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    registerMock.mockResolvedValue({
      installing: null,
      addEventListener: jest.fn(),
      update: updateMock,
      active: { postMessage: postMessageMock },
    });
    getRegistrationsMock.mockResolvedValue([]);

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: { postMessage: postMessageMock },
        register: registerMock,
        addEventListener: addServiceWorkerListenerMock,
        removeEventListener: removeServiceWorkerListenerMock,
        getRegistrations: getRegistrationsMock,
        ready: Promise.resolve({
          active: { postMessage: postMessageMock },
        }),
      },
    });

    Object.defineProperty(window, "caches", {
      configurable: true,
      value: {
        keys: jest.fn().mockResolvedValue([]),
        delete: jest.fn(),
      },
    });

    Object.defineProperty(global, "EventSource", {
      configurable: true,
      value: MockEventSource,
    });
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: MockEventSource,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: originalCaches,
    });
    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: originalReadyState,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: originalVisibilityState,
    });
    Object.defineProperty(global, "EventSource", {
      configurable: true,
      value: originalEventSource,
    });
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: originalEventSource,
    });
    global.fetch = originalFetch;
    setNodeEnv(originalNodeEnv);
  });

  it("polls the cache-floor route and emits a purge when the token changes", async () => {
    const eventSpy = jest.fn();
    window.addEventListener(
      PUBLIC_CACHE_INVALIDATED_EVENT,
      eventSpy as EventListener
    );

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cacheFloorToken: "token-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cacheFloorToken: "token-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cacheFloorToken: "token-2" }),
      }) as typeof fetch;

    render(<ServiceWorkerRegistration publicCacheCoherenceEnabled />);

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });
      expect(global.fetch).toHaveBeenCalledWith("/api/public-cache/state", {
        cache: "no-store",
      });
    });

    expect(postMessageMock).toHaveBeenLastCalledWith({
      type: "PUBLIC_CACHE_FLOOR",
      payload: { cacheFloorToken: "token-1" },
    });
    postMessageMock.mockClear();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    expect(postMessageMock).toHaveBeenLastCalledWith({
      type: "PUBLIC_CACHE_FLOOR",
      payload: { cacheFloorToken: "token-1" },
    });
    postMessageMock.mockClear();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(postMessageMock).toHaveBeenCalledWith({
        type: "PUBLIC_CACHE_FLOOR",
        payload: { cacheFloorToken: "token-2" },
      });
      expect(postMessageMock).toHaveBeenCalledWith({
        type: "CLEAR_DYNAMIC_CACHE",
      });
      expect(eventSpy).toHaveBeenCalledTimes(1);
    });

    window.removeEventListener(
      PUBLIC_CACHE_INVALIDATED_EVENT,
      eventSpy as EventListener
    );
  });

  it("clears dynamic caches when an SSE invalidation arrives", async () => {
    const eventSpy = jest.fn();
    window.addEventListener(
      PUBLIC_CACHE_INVALIDATED_EVENT,
      eventSpy as EventListener
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cacheFloorToken: "token-1",
        latestCursor: "cursor-1",
      }),
    }) as typeof fetch;
    const cachesMock = window.caches as unknown as {
      keys: jest.Mock;
      delete: jest.Mock;
    };
    cachesMock.keys.mockResolvedValueOnce([
      "roomshare-dynamic-v1",
      "roomshare-static-v1",
      "roomshare-dynamic-v2",
    ]);

    render(<ServiceWorkerRegistration publicCacheCoherenceEnabled />);

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });

    postMessageMock.mockClear();

    MockEventSource.instances[0].emit("public-cache.invalidate", {
      cursor: "cursor-2",
      cacheFloorToken: "token-2",
      unitCacheKey: "unit-cache-key",
      projectionEpoch: "7",
    });

    await waitFor(() => {
      expect(postMessageMock).toHaveBeenCalledWith({
        type: "PUBLIC_CACHE_INVALIDATED",
        payload: {
          cursor: "cursor-2",
          cacheFloorToken: "token-2",
          unitCacheKey: "unit-cache-key",
          projectionEpoch: "7",
          broadcast: false,
        },
      });
      expect(postMessageMock).toHaveBeenCalledWith({
        type: "CLEAR_DYNAMIC_CACHE",
      });
      expect(cachesMock.delete).toHaveBeenCalledWith("roomshare-dynamic-v1");
      expect(cachesMock.delete).toHaveBeenCalledWith("roomshare-dynamic-v2");
      expect(cachesMock.delete).not.toHaveBeenCalledWith("roomshare-static-v1");
      expect(eventSpy).toHaveBeenCalledTimes(1);
    });

    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(2);

    window.removeEventListener(
      PUBLIC_CACHE_INVALIDATED_EVENT,
      eventSpy as EventListener
    );
  });
});
