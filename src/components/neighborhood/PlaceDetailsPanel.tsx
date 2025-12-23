'use client';

/**
 * PlaceDetailsPanel - Slide-in panel showing place details
 *
 * Uses Google Places UI Kit's gmp-place-details-compact web component
 * to display full place information while preserving attribution.
 *
 * This component is used for Pro users to get detailed POI information.
 */

import { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistance } from '@/lib/geo/distance';
import type { POI } from '@/lib/places/types';
import { loadPlacesUiKit } from '@/lib/googleMapsUiKitLoader';

interface PlaceDetailsPanelProps {
  /** The POI to display details for */
  poi: POI | null;
  /** Callback when panel is closed */
  onClose: () => void;
  /** Optional class name */
  className?: string;
}

export function PlaceDetailsPanel({
  poi,
  onClose,
  className = '',
}: PlaceDetailsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const detailsContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load Google Maps and render place details
  useEffect(() => {
    if (!poi || !detailsContainerRef.current) return;

    let mounted = true;
    setIsLoading(true);
    setLoadError(null);

    const loadDetails = async () => {
      try {
        await loadPlacesUiKit();

        if (!mounted || !detailsContainerRef.current) return;

        // Clear previous content
        detailsContainerRef.current.innerHTML = '';

        // Create the place details compact element
        const detailsElement = document.createElement('gmp-place-details-compact');
        detailsElement.setAttribute('place', poi.placeId);

        // Style the web component container
        detailsElement.style.display = 'block';
        detailsElement.style.width = '100%';

        detailsContainerRef.current.appendChild(detailsElement);

        // Wait for the element to load
        await new Promise((resolve) => setTimeout(resolve, 100));

        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load place details:', error);
        if (mounted) {
          setLoadError('Failed to load place details');
          setIsLoading(false);
        }
      }
    };

    loadDetails();

    return () => {
      mounted = false;
    };
  }, [poi]);

  // Handle keyboard navigation and focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap: keep Tab cycling within the panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if on first element, go to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab: if on last element, go to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    if (poi) {
      document.addEventListener('keydown', handleKeyDown);
      // Focus the close button on open
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>('button');
      firstFocusable?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [poi, onClose]);

  // Don't render if no POI
  if (!poi) {
    return null;
  }

  const googleMapsUrl = poi.googleMapsURI || `https://www.google.com/maps/place/?q=place_id:${poi.placeId}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination_place_id=${poi.placeId}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          fixed right-0 top-0 bottom-0 w-full max-w-md
          bg-background border-l shadow-2xl z-50
          animate-in slide-in-from-right duration-300
          flex flex-col
          ${className}
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-details-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex-1 min-w-0">
            <h2
              id="place-details-title"
              className="font-semibold text-lg truncate"
              title={poi.name}
            >
              {poi.name}
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              {poi.distanceMiles !== undefined && (
                <span className="font-medium text-foreground">
                  {formatDistance(poi.distanceMiles)}
                </span>
              )}
              {poi.walkMins !== undefined && (
                <span>~{poi.walkMins} min walk</span>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 ml-2"
            aria-label="Close details"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          )}

          {/* Error state */}
          {loadError && !isLoading && (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{loadError}</p>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          )}

          {/* Google Places UI Kit details container */}
          <div
            ref={detailsContainerRef}
            className={isLoading || loadError ? 'hidden' : ''}
          />

          {/* Attribution - required by Google ToS */}
          <div className="mt-4 pt-4 border-t">
            <gmp-place-attribution></gmp-place-attribution>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t bg-muted/30">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.open(directionsUrl, '_blank')}
              aria-label="Get directions (opens in new tab)"
            >
              <Navigation className="h-4 w-4 mr-2" aria-hidden="true" />
              Directions
              <span className="sr-only">(opens in new tab)</span>
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => window.open(googleMapsUrl, '_blank')}
              aria-label="Open in Google Maps (opens in new tab)"
            >
              <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
              Open in Maps
              <span className="sr-only">(opens in new tab)</span>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// Declare the custom elements for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-place-details-compact': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { place?: string },
        HTMLElement
      >;
      'gmp-place-attribution': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

export default PlaceDetailsPanel;
