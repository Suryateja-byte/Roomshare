import "@testing-library/jest-dom";
import { act, render, waitFor } from "@testing-library/react";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PUBLIC_CACHE_INVALIDATED_EVENT } from "@/lib/public-cache/client";

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
  const originalFetch = global.fetch;

  const postMessageMock = jest.fn();
  const registerMock = jest.fn();
  const getRegistrationsMock = jest.fn();
  const updateMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setNodeEnv("production");

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

    expect(postMessageMock).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    expect(postMessageMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
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
});
