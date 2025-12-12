'use client';

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
const CALLBACK_NAME = '__googleMapsCallback';

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

  if (!apiKey || apiKey === 'your-google-maps-uikit-browser-key') {
    throw new Error(
      'NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY is not configured. ' +
        'Please add your Google Maps API key to .env.local'
    );
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    // Check if already loaded by another script
    if (window.google?.maps?.importLibrary) {
      // Already loaded, just import places
      window.google.maps
        .importLibrary('places')
        .then(() => {
          isLoaded = true;
          resolve();
        })
        .catch((error: Error) => {
          reject(new Error(`Failed to import Places library: ${error.message}`));
        });
      return;
    }

    // Check if script tag already exists but API not ready yet
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existingScript) {
      // Poll for google.maps to be ready
      const checkReady = setInterval(() => {
        if (window.google?.maps?.importLibrary) {
          clearInterval(checkReady);
          window.google.maps
            .importLibrary('places')
            .then(() => {
              isLoaded = true;
              resolve();
            })
            .catch((error: Error) => {
              reject(new Error(`Failed to import Places library: ${error.message}`));
            });
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkReady);
        if (!isLoaded) {
          reject(new Error('Timeout waiting for Google Maps API to load'));
        }
      }, 10000);
      return;
    }

    // Create the callback function
    (window as unknown as { [key: string]: () => void })[CALLBACK_NAME] = async () => {
      try {
        console.log('Google Maps callback fired');
        console.log('google.maps:', window.google?.maps);

        if (!window.google?.maps?.importLibrary) {
          throw new Error('Google Maps API loaded but importLibrary is not available');
        }

        // Import the places library
        const placesLib = await window.google.maps.importLibrary('places');
        console.log('Places library loaded:', placesLib);
        isLoaded = true;
        resolve();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Google Places API error:', error);
        reject(new Error(`Failed to load Places library: ${errorMessage}`));
      } finally {
        // Clean up callback
        delete (window as unknown as { [key: string]: unknown })[CALLBACK_NAME];
      }
    };

    // Create the script element - using callback pattern (no loading=async)
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;

    script.onerror = () => {
      loadPromise = null;
      delete (window as unknown as { [key: string]: unknown })[CALLBACK_NAME];
      reject(
        new Error(
          'Failed to load Google Maps API script. ' +
            'Check your API key and network connection.'
        )
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
}
