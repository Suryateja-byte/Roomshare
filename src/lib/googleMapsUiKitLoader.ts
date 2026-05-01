"use client";

/**
 * Singleton loader for Google Maps JavaScript API with Places UI Kit.
 * Uses the callback pattern for reliable initialization.
 *
 * IMPORTANT: Must enable "Places UI Kit" in Google Cloud Console (not just Places API).
 *
 * @see https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started
 */

let loadPromise: Promise<void> | null = null;
let isLoaded = false;

// Callback name for Google Maps API
const CALLBACK_NAME = "__googleMapsCallback";
const GOOGLE_MAPS_SCRIPT_SELECTOR =
  'script[src*="maps.googleapis.com/maps/api/js"]';

function clearGoogleMapsCallback(): void {
  delete (window as unknown as { [key: string]: unknown })[CALLBACK_NAME];
}

function removeGoogleMapsScript(script: Element | null | undefined): void {
  if (!script || !script.getAttribute("src")?.includes("maps.googleapis.com")) {
    return;
  }

  script.parentNode?.removeChild(script);
}

/**
 * Loads the Google Maps JavaScript API with Places library.
 * This is a singleton - calling multiple times will return the same promise.
 *
 * @returns Promise that resolves when the Places library is loaded
 * @throws Error if API key is not configured or loading fails
 */
export async function loadPlacesUiKit(): Promise<void> {
  // Return immediately if already loaded
  if (isLoaded && window.google?.maps?.places) {
    return;
  }

  // Return existing promise if loading is in progress
  if (loadPromise) {
    return loadPromise;
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY;

  if (!apiKey || apiKey === "your-google-maps-uikit-browser-key") {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY is not configured. " +
        "Please add your Google Maps API key to .env.local"
    );
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let activeScript: Element | null = null;

    const clearPendingTimers = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      clearPendingTimers();
      isLoaded = true;
      resolve();
    };

    const rejectAndReset = (
      error: Error,
      options?: { removeScript?: Element | null }
    ) => {
      if (settled) return;
      settled = true;
      clearPendingTimers();
      removeGoogleMapsScript(options?.removeScript);
      loadPromise = null;
      isLoaded = false;
      clearGoogleMapsCallback();
      reject(error);
    };

    // Check if already loaded by another script
    if (window.google?.maps?.importLibrary) {
      // Already loaded, just import places
      window.google.maps
        .importLibrary("places")
        .then(() => {
          resolveOnce();
        })
        .catch((error: Error) => {
          rejectAndReset(
            new Error(`Failed to import Places library: ${error.message}`)
          );
        });
      return;
    }

    // Check if script tag already exists but API not ready yet
    const existingScript = document.querySelector(GOOGLE_MAPS_SCRIPT_SELECTOR);
    if (existingScript) {
      activeScript = existingScript;
      // Poll for google.maps to be ready
      intervalId = setInterval(() => {
        if (window.google?.maps?.importLibrary) {
          clearPendingTimers();
          window.google.maps
            .importLibrary("places")
            .then(() => {
              resolveOnce();
            })
            .catch((error: Error) => {
              rejectAndReset(
                new Error(`Failed to import Places library: ${error.message}`)
              );
            });
        }
      }, 100);

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        if (!settled) {
          rejectAndReset(
            new Error("Timeout waiting for Google Maps API to load"),
            { removeScript: activeScript }
          );
        }
      }, 10000);
      return;
    }

    // Create the callback function
    (window as unknown as { [key: string]: () => void })[CALLBACK_NAME] =
      async () => {
        try {
          if (!window.google?.maps?.importLibrary) {
            throw new Error(
              "Google Maps API loaded but importLibrary is not available"
            );
          }

          // Import the places library
          await window.google.maps.importLibrary("places");
          resolveOnce();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("Google Places API error:", error);
          rejectAndReset(
            new Error(`Failed to load Places library: ${errorMessage}`),
            { removeScript: activeScript }
          );
        } finally {
          // Clean up callback
          clearGoogleMapsCallback();
        }
      };

    // Create the script element - using callback pattern (no loading=async)
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;
    activeScript = script;

    script.onerror = () => {
      rejectAndReset(
        new Error(
          "Failed to load Google Maps API script. " +
            "Check your API key and network connection."
        ),
        { removeScript: script }
      );
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Check if Places UI Kit is currently loaded and ready to use.
 */
export function isPlacesUiKitLoaded(): boolean {
  return isLoaded && !!window.google?.maps?.places;
}

/**
 * Reset the loader state (mainly for testing purposes).
 */
export function resetPlacesLoader(): void {
  loadPromise = null;
  isLoaded = false;
  if (typeof window !== "undefined") {
    clearGoogleMapsCallback();
  }
}
