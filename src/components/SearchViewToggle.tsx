'use client';

import { useState } from 'react';
import { Map, List } from 'lucide-react';

interface SearchViewToggleProps {
  children: React.ReactNode;
  mapComponent: React.ReactNode;
}

export default function SearchViewToggle({ children, mapComponent }: SearchViewToggleProps) {
  const [showMap, setShowMap] = useState(false);

  return (
    <>
      {/* Mobile View Toggle Button - Fixed at bottom */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <button
          onClick={() => setShowMap(!showMap)}
          className="flex items-center gap-2 px-5 py-3 bg-zinc-900 text-white rounded-full shadow-lg shadow-zinc-900/25 hover:bg-zinc-800 transition-colors touch-target"
          aria-label={showMap ? 'Show list view' : 'Show map view'}
        >
          {showMap ? (
            <>
              <List className="w-5 h-5" />
              <span className="text-sm font-medium">Show List</span>
            </>
          ) : (
            <>
              <Map className="w-5 h-5" />
              <span className="text-sm font-medium">Show Map</span>
            </>
          )}
        </button>
      </div>

      {/* Mobile Views */}
      <div className="md:hidden flex-1 flex overflow-hidden">
        {/* List View */}
        <div className={`w-full h-full overflow-y-auto scrollbar-hide ${showMap ? 'hidden' : 'block'}`}>
          {children}
        </div>

        {/* Map View */}
        <div className={`w-full h-full ${showMap ? 'block' : 'hidden'}`}>
          {mapComponent}
        </div>
      </div>

      {/* Desktop Split View */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Left Panel: List View */}
        <div className="w-1/2 h-full overflow-y-auto scrollbar-hide">
          {children}
        </div>

        {/* Right Panel: Map View */}
        <div className="flex-1 relative border-l border-zinc-200 ">
          {mapComponent}
        </div>
      </div>
    </>
  );
}
