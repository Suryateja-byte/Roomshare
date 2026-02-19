'use client';

import dynamic from 'next/dynamic';
import { ComponentProps, useState, useEffect } from 'react';

// Re-export controlled component types for consumers
export type {
    MapViewState,
    MapBounds,
    MapViewStateChangeEvent,
    MapComponentProps,
} from '@/components/Map';

// M2-MAP FIX: Detect WebGL support before mounting the map
function hasWebGLSupport(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
    } catch {
        return false;
    }
}

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

// Fallback UI when WebGL is not available
function WebGLFallback() {
    return (
        <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
                <p className="text-zinc-600 dark:text-zinc-400 font-medium mb-2">
                    Map unavailable
                </p>
                <p className="text-zinc-500 dark:text-zinc-500 text-sm">
                    Your browser does not support WebGL, which is required for the interactive map.
                    Try updating your browser or enabling hardware acceleration.
                </p>
            </div>
        </div>
    );
}

/**
 * DynamicMap - Lazy-loaded wrapper for MapComponent.
 *
 * Checks for WebGL support before loading the map bundle.
 * Passes through all MapComponent props including controlled mode props:
 * - viewState / onViewStateChange for controlled viewport
 * - selectedListingId / onSelectedListingChange for controlled selection
 * - disableAutoFit to prevent automatic viewport changes
 *
 * @see MapComponent for full prop documentation
 */
export default function DynamicMap(props: DynamicMapProps) {
    const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

    useEffect(() => {
        setWebglSupported(hasWebGLSupport());
    }, []);

    // Still checking
    if (webglSupported === null) {
        return (
            <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
                <div className="text-zinc-400 dark:text-zinc-500 text-sm">Loading map...</div>
            </div>
        );
    }

    if (!webglSupported) {
        return <WebGLFallback />;
    }

    return <MapComponent {...props} />;
}
