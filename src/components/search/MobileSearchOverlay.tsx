"use client";

import { useEffect, useRef, useState } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, X } from "lucide-react";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import LocationSearchInput from "@/components/LocationSearchInput";

interface MobileSearchOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Close the overlay */
  onClose: () => void;
  /** Called when user selects a recent search or submits */
  onSearch: (query: string, coords?: { lat: number; lng: number }) => void;
  /** Current search query */
  currentQuery?: string;
}

/**
 * Full-screen search overlay for mobile.
 * Slides up when compact search bar is tapped.
 * Shows recent searches and an input field.
 */
export default function MobileSearchOverlay({
  isOpen,
  onClose,
  onSearch,
  currentQuery = "",
}: MobileSearchOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState(currentQuery);
  const { recentSearches, removeRecentSearch, formatSearch } = useRecentSearches();

  useEffect(() => {
    setInputValue(currentQuery);
  }, [currentQuery]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const input = containerRef.current?.querySelector('input');
        input?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Back button / escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputValue.trim();
    if (value) {
      onSearch(value);
      onClose();
    }
  };

  const handleRecentClick = (location: string) => {
    onSearch(location);
    onClose();
  };

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed inset-0 z-[60] bg-white dark:bg-zinc-900 flex flex-col md:hidden"
          >
            {/* Header with back button and search input */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <button
                onClick={onClose}
                className="flex-shrink-0 p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
              </button>

              <form onSubmit={handleSubmit} className="flex-1">
                <div ref={containerRef} className="relative">
                  <LocationSearchInput
                    value={inputValue}
                    onChange={(v) => setInputValue(v)}
                    onLocationSelect={(loc) => {
                      onSearch(loc.name, { lat: loc.lat, lng: loc.lng });
                      onClose();
                    }}
                    placeholder="Search by city, neighborhood..."
                    id="mobile-search-input"
                  />
                </div>
              </form>
            </div>

            {/* Recent searches */}
            <div className="flex-1 overflow-y-auto px-4 pt-4">
              {recentSearches.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
                    Recent searches
                  </h3>
                  <ul className="space-y-1">
                    {recentSearches.map((search) => {
                      const displayText = formatSearch(search);
                      return (
                        <li key={search.id} className="flex items-center">
                          <button
                            onClick={() => handleRecentClick(search.location)}
                            className="flex-1 flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                          >
                            <Clock className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                {search.location}
                              </div>
                              {displayText !== search.location && (
                                <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                  {displayText}
                                </div>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRecentSearch(search.id);
                            }}
                            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            aria-label={`Remove ${search.location} from recent searches`}
                          >
                            <X className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {recentSearches.length === 0 && (
                <div className="text-center text-sm text-zinc-400 dark:text-zinc-500 mt-8">
                  No recent searches
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
