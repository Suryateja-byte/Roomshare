'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';

// Re-export controlled component types for consumers
export type {
    MapViewState,
    MapBounds,
    MapViewStateChangeEvent,
    MapComponentProps,
} from '@/components/Map';

// Dynamic import for Map component - defers maplibre-gl bundle until needed
const MapComponent = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
            <div className="text-zinc-400 dark:text-zinc-500 text-sm">Loading map...</div>
        </div>
    ),
});

type DynamicMapProps = ComponentProps<typeof MapComponent>;

/**
 * DynamicMap - Lazy-loaded wrapper for MapComponent.
 *
 * Passes through all MapComponent props including controlled mode props:
 * - viewState / onViewStateChange for controlled viewport
 * - selectedListingId / onSelectedListingChange for controlled selection
 * - disableAutoFit to prevent automatic viewport changes
 *
 * @see MapComponent for full prop documentation
 */
export default function DynamicMap(props: DynamicMapProps) {
    return <MapComponent {...props} />;
}
