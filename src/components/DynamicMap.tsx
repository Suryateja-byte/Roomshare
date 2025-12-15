'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';

// Dynamic import for Map component - defers 944KB mapbox-gl bundle until needed
const MapComponent = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
            <div className="text-zinc-400 dark:text-zinc-500 text-sm">Loading map...</div>
        </div>
    ),
});

type DynamicMapProps = ComponentProps<typeof MapComponent>;

export default function DynamicMap({ listings }: DynamicMapProps) {
    return <MapComponent listings={listings} />;
}
