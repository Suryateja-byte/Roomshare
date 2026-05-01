import {
  loadPlacesUiKit,
  resetPlacesLoader,
} from "@/lib/googleMapsUiKitLoader";

describe("googleMapsUiKitLoader retry behavior", () => {
  beforeEach(() => {
    resetPlacesLoader();
    document.head.innerHTML = "";
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY = "test-key";
    Reflect.deleteProperty(window, "google");
    jest.useRealTimers();
  });

  afterEach(() => {
    resetPlacesLoader();
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY;
    Reflect.deleteProperty(window, "google");
    jest.useRealTimers();
  });

  it("allows retry after importLibrary rejects", async () => {
    const importLibrary = jest
      .fn()
      .mockRejectedValueOnce(new Error("import failed"))
      .mockResolvedValueOnce({});
    window.google = {
      maps: {
        importLibrary,
        places: {},
        Circle: jest.fn() as unknown as typeof google.maps.Circle,
      },
    };

    await expect(loadPlacesUiKit()).rejects.toThrow("import failed");
    await expect(loadPlacesUiKit()).resolves.toBeUndefined();

    expect(importLibrary).toHaveBeenCalledTimes(2);
  });

  it("allows retry after an existing script times out", async () => {
    jest.useFakeTimers();
    const script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=test";
    document.head.appendChild(script);

    const firstAttempt = loadPlacesUiKit();

    jest.advanceTimersByTime(10_000);
    await expect(firstAttempt).rejects.toThrow(
      "Timeout waiting for Google Maps API to load"
    );
    expect(
      document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')
    ).toBeNull();

    const importLibrary = jest.fn().mockResolvedValue({});
    window.google = {
      maps: {
        importLibrary,
        places: {},
        Circle: jest.fn() as unknown as typeof google.maps.Circle,
      },
    };

    await expect(loadPlacesUiKit()).resolves.toBeUndefined();
    expect(importLibrary).toHaveBeenCalledTimes(1);
  });

  it("allows retry after script.onerror without a page reload", async () => {
    const firstAttempt = loadPlacesUiKit();
    const firstScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );

    expect(firstScript).toBeInstanceOf(HTMLScriptElement);
    firstScript?.dispatchEvent(new Event("error"));

    await expect(firstAttempt).rejects.toThrow(
      "Failed to load Google Maps API script"
    );
    expect(
      document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')
    ).toBeNull();

    const secondAttempt = loadPlacesUiKit();
    const secondScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    const importLibrary = jest.fn().mockResolvedValue({});
    window.google = {
      maps: {
        importLibrary,
        places: {},
        Circle: jest.fn() as unknown as typeof google.maps.Circle,
      },
    };

    await (
      window as unknown as { __googleMapsCallback: () => Promise<void> }
    ).__googleMapsCallback();

    await expect(secondAttempt).resolves.toBeUndefined();
    expect(secondScript).toBeInstanceOf(HTMLScriptElement);
    expect(secondScript).not.toBe(firstScript);
    expect(importLibrary).toHaveBeenCalledWith("places");
  });

  it("allows retry after callback import setup fails", async () => {
    const firstAttempt = loadPlacesUiKit();
    const firstScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );

    await (
      window as unknown as { __googleMapsCallback: () => Promise<void> }
    ).__googleMapsCallback();

    await expect(firstAttempt).rejects.toThrow(
      "Google Maps API loaded but importLibrary is not available"
    );
    expect(
      document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')
    ).toBeNull();

    const importLibrary = jest.fn().mockResolvedValue({});
    const secondAttempt = loadPlacesUiKit();
    const secondScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    window.google = {
      maps: {
        importLibrary,
        places: {},
        Circle: jest.fn() as unknown as typeof google.maps.Circle,
      },
    };

    await (
      window as unknown as { __googleMapsCallback: () => Promise<void> }
    ).__googleMapsCallback();

    await expect(secondAttempt).resolves.toBeUndefined();
    expect(secondScript).toBeInstanceOf(HTMLScriptElement);
    expect(secondScript).not.toBe(firstScript);
    expect(importLibrary).toHaveBeenCalledWith("places");
  });
});
