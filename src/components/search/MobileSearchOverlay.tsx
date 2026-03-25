"use client";

import { useEffect, useRef } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, Clock, X } from "lucide-react";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { FocusTrap } from "@/components/ui/FocusTrap";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface MobileSearchOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Close the overlay */
  onClose: () => void;
  /** Called when user selects a recent search or submits */
  onSearch: (query: string) => void;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const { recentSearches, removeRecentSearch, formatSearch } =
    useRecentSearches();

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      // Small delay to let animation start
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
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
  useBodyScrollLock(isOpen);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputRef.current?.value.trim();
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
            className="fixed inset-0 z-[60] bg-surface-container-lowest flex flex-col md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <FocusTrap active={isOpen}>
              {/* Header with back button and search input */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-outline-variant/20">
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-5 h-5 text-on-surface-variant" />
                </button>

                <form onSubmit={handleSubmit} className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                    <input
                      ref={inputRef}
                      type="text"
                      defaultValue={currentQuery}
                      placeholder="Search by city, neighborhood..."
                      aria-label="Search by city or neighborhood"
                      className="w-full h-10 pl-9 pr-4 bg-surface-container-high rounded-full text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      enterKeyHint="search"
                    />
                  </div>
                </form>
              </div>

              {/* Recent searches */}
              <div className="flex-1 overflow-y-auto px-4 pt-4">
                {recentSearches.length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
                      Recent searches
                    </h3>
                    <ul className="space-y-1">
                      {recentSearches.map((search) => {
                        const displayText = formatSearch(search);
                        return (
                          <li key={search.id} className="flex items-center">
                            <button
                              onClick={() => handleRecentClick(search.location)}
                              className="flex-1 flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-canvas transition-colors text-left"
                            >
                              <Clock className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-on-surface truncate">
                                  {search.location}
                                </div>
                                {displayText !== search.location && (
                                  <div className="text-xs text-on-surface-variant truncate">
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
                              className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
                              aria-label={`Remove ${search.location} from recent searches`}
                            >
                              <X className="w-3.5 h-3.5 text-on-surface-variant" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                {recentSearches.length === 0 && (
                  <div className="text-center text-sm text-on-surface-variant mt-8">
                    No recent searches
                  </div>
                )}
              </div>
            </FocusTrap>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
