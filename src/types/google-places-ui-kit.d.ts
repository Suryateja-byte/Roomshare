/**
 * TypeScript declarations for Google Places UI Kit web components.
 * These components are rendered by the Places UI Kit library and must not be
 * extracted or redrawn in custom UI.
 *
 * @see https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-list
 */

import 'react';

// Types for Google Places API
interface PlacesSearchRequest {
  fields: string[];
  includedTypes?: string[];
  textQuery?: string;
  locationRestriction?: {
    center: { lat: number; lng: number };
    radius: number;
  };
  locationBias?: {
    center: { lat: number; lng: number };
    radius: number;
  };
  maxResultCount?: number;
}

interface GooglePlace {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: { lat: () => number; lng: () => number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  regularOpeningHours?: { isOpen?: () => boolean };
  googleMapsURI?: string;
}

interface PlacesSearchResponse {
  places: GooglePlace[];
}

// Circle class type for google.maps.Circle
interface GoogleMapsCircle {
  getCenter(): { lat: () => number; lng: () => number };
  getRadius(): number;
  setCenter(center: { lat: number; lng: number }): void;
  setRadius(radius: number): void;
}

interface GoogleMapsCircleOptions {
  center: { lat: number; lng: number };
  radius: number;
}

// Google Maps Window extension
declare global {
  interface Window {
    google?: {
      maps?: {
        importLibrary: (library: string) => Promise<unknown>;
        places?: {
          Place?: {
            searchNearby: (request: PlacesSearchRequest) => Promise<PlacesSearchResponse>;
            searchByText: (request: PlacesSearchRequest) => Promise<PlacesSearchResponse>;
          };
        };
        LatLng?: new (lat: number, lng: number) => { lat: () => number; lng: () => number };
        Circle?: new (options: GoogleMapsCircleOptions) => GoogleMapsCircle;
      };
    };
  }

  // Also declare the namespace for use in type annotations
  namespace google.maps {
    class Circle {
      constructor(options: GoogleMapsCircleOptions);
      getCenter(): { lat: () => number; lng: () => number };
      getRadius(): number;
      setCenter(center: { lat: number; lng: number }): void;
      setRadius(radius: number): void;
    }
  }
}

// Module augmentation for React JSX
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /**
       * The main Place Search element that renders a list of places.
       */
      'gmp-place-search': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          selectable?: boolean | string;
          slot?: string;
        },
        HTMLElement
      >;

      /**
       * Nearby Search request element.
       */
      'gmp-place-nearby-search-request': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'max-result-count'?: number | string;
        },
        HTMLElement
      >;

      /**
       * Text Search request element.
       */
      'gmp-place-text-search-request': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'text-query'?: string;
          'max-result-count'?: number | string;
        },
        HTMLElement
      >;

      /**
       * Displays all place content.
       */
      'gmp-place-all-content': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;

      /**
       * Displays detailed information about a place.
       */
      'gmp-place-details-compact': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          place?: string;
        },
        HTMLElement
      >;

      /**
       * Required attribution element - DO NOT remove/alter/obscure.
       */
      'gmp-place-attribution': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'color-scheme'?: 'light' | 'dark';
        },
        HTMLElement
      >;
    }
  }
}

export {};
