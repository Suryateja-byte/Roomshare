"use client";

import { useEffect, useRef, useState } from "react";
import { saveSearch } from "@/app/actions/saved-search";
import {
  normalizeSearchFilters,
  searchParamsToSearchFilters,
  type SearchFilters,
} from "@/lib/search-utils";
import { Bookmark, Loader2, X, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { FocusTrap } from "@/components/ui/FocusTrap";

interface SaveSearchButtonProps {
  className?: string;
  label?: string;
  forceShowLabel?: boolean;
  variant?: "default" | "toolbar";
}

type AlertFrequency = "INSTANT" | "DAILY" | "WEEKLY";

export default function SaveSearchButton({
  className = "",
  label = "Save Search",
  forceShowLabel = false,
  variant = "default",
}: SaveSearchButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [alertFrequency, setAlertFrequency] = useState<AlertFrequency>("DAILY");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Get current filters from URL using centralized validation
  const getCurrentFilters = (): SearchFilters => {
    return normalizeSearchFilters(
      searchParamsToSearchFilters(new URLSearchParams(searchParams.toString()))
    );
  };

  // Generate a default name based on filters
  const generateDefaultName = (): string => {
    const filters = getCurrentFilters();
    const parts: string[] = [];

    if (filters.locationLabel) {
      parts.push(filters.locationLabel);
    } else if (filters.query) {
      parts.push(filters.query);
    }
    if (filters.vibeQuery) parts.push(filters.vibeQuery);
    if (filters.roomType) parts.push(filters.roomType.replace("_", " "));
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const priceRange = [
        filters.minPrice !== undefined ? `$${filters.minPrice}` : "",
        filters.maxPrice !== undefined ? `$${filters.maxPrice}` : "",
      ]
        .filter(Boolean)
        .join("-");
      if (priceRange) parts.push(priceRange);
    }

    return parts.length > 0 ? parts.join(" - ") : "My Search";
  };

  const handleOpen = () => {
    setName(generateDefaultName());
    setError(null);
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter a name for this search");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await saveSearch({
        name: name.trim(),
        filters: getCurrentFilters(),
        alertEnabled,
        alertFrequency,
      });

      if ("error" in result) {
        setError(result.error ?? "Failed to save search");
      } else {
        setIsOpen(false);
        toast.success("Search saved successfully!");
      }
    } catch (_err) {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerButtonRef}
        onClick={handleOpen}
        aria-label={label}
        className={`inline-flex h-11 items-center gap-2 whitespace-nowrap text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface ${className}`}
      >
        <Bookmark className="w-4 h-4" aria-hidden="true" />
        <span
          className={
            forceShowLabel
              ? ""
              : variant === "toolbar"
                ? "hidden xl:inline"
                : "hidden sm:inline"
          }
          aria-hidden="true"
        >
          {label}
        </span>
      </button>

      {/* Modal */}
      {isOpen && (
        <FocusTrap active={isOpen} returnFocus={true}>
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-on-surface/50"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Modal Content */}
            <div
              className="relative bg-surface-container-lowest rounded-2xl shadow-xl max-w-md w-full p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="save-search-dialog-title"
            >
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface-variant rounded-full hover:bg-surface-container-high transition-colors"
                aria-label="Close save search dialog"
              >
                <X className="w-5 h-5" />
              </button>

              <h2
                id="save-search-dialog-title"
                className="text-xl font-bold text-on-surface mb-4"
              >
                Save This Search
              </h2>

              <div className="space-y-4">
                {/* Search Name */}
                <div>
                  <label
                    htmlFor="save-search-name"
                    className="block text-sm font-medium text-on-surface-variant mb-1"
                  >
                    Search Name
                  </label>
                  <input
                    id="save-search-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Downtown apartments under $1500"
                    className="w-full px-4 py-2.5 border border-outline-variant/20 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-describedby={error ? "save-search-error" : undefined}
                    aria-invalid={!!error}
                  />
                </div>

                {/* Alert Toggle */}
                <div className="p-4 bg-surface-canvas rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {alertEnabled ? (
                        <Bell className="w-5 h-5 text-on-surface-variant" />
                      ) : (
                        <BellOff className="w-5 h-5 text-on-surface-variant" />
                      )}
                      <div>
                        <p className="font-medium text-on-surface">
                          Email Alerts
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Get notified when new listings match
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAlertEnabled(!alertEnabled)}
                      role="switch"
                      aria-checked={alertEnabled}
                      aria-label="Email alerts"
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        alertEnabled
                          ? "bg-primary"
                          : "bg-surface-container-high"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest transition-transform ${
                          alertEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Alert Frequency */}
                  {alertEnabled && (
                    <div className="pt-3 border-t border-outline-variant/20">
                      <label className="block text-sm font-medium text-on-surface-variant mb-2">
                        Alert Frequency
                      </label>
                      <div className="flex gap-2">
                        {(["INSTANT", "DAILY", "WEEKLY"] as const).map(
                          (freq) => (
                            <button
                              key={freq}
                              type="button"
                              onClick={() => setAlertFrequency(freq)}
                              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                alertFrequency === freq
                                  ? "bg-primary text-on-primary"
                                  : "bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high"
                              }`}
                            >
                              {freq === "INSTANT"
                                ? "Instant"
                                : freq === "DAILY"
                                  ? "Daily"
                                  : "Weekly"}
                            </button>
                          )
                        )}
                      </div>
                      {alertFrequency === "INSTANT" && (
                        <p className="mt-2 text-xs text-on-surface-variant">
                          Get notified immediately when a new listing matches
                          your search
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <p
                    id="save-search-error"
                    role="alert"
                    className="text-sm text-red-600"
                  >
                    {error}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 px-4 py-2.5 border border-outline-variant/20 rounded-lg font-medium text-on-surface-variant hover:bg-surface-canvas transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2.5 bg-primary text-on-primary rounded-lg font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Search"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </FocusTrap>
      )}
    </>
  );
}
