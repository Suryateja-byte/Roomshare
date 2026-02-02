"use client";

/**
 * ListingCardCarousel - Image carousel for listing cards
 *
 * Features:
 * - CSS scroll-snap based (no external library)
 * - Lazy loading for non-visible images
 * - Controls appear on hover (desktop) or always visible (mobile)
 * - Keyboard navigation when focused
 * - A11y: aria-labels, live region for index
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListingCardCarouselProps {
  images: string[];
  alt: string;
  /** Maximum images to display (default: 5) */
  maxImages?: number;
  /** Called when image fails to load */
  onImageError?: () => void;
}

export default function ListingCardCarousel({
  images,
  alt,
  maxImages = 5,
  onImageError,
}: ListingCardCarouselProps) {
  // Limit images to maxImages
  const displayImages = images.slice(0, maxImages);
  const totalImages = displayImages.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  // Initialize with first two images if available (no useEffect needed)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(
    () => new Set(totalImages > 1 ? [0, 1] : [0]),
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track scroll position to update current index
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const itemWidth = container.offsetWidth;
    const newIndex = Math.round(scrollLeft / itemWidth);
    setCurrentIndex(Math.min(Math.max(0, newIndex), totalImages - 1));
  }, [totalImages]);

  // Scroll to specific index
  const scrollToIndex = useCallback(
    (index: number) => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      const targetIndex = Math.min(Math.max(0, index), totalImages - 1);
      container.scrollTo({
        left: targetIndex * container.offsetWidth,
        behavior: "smooth",
      });
      setCurrentIndex(targetIndex);

      // Preload adjacent images
      setLoadedImages((prev) => {
        const newSet = new Set(prev);
        newSet.add(targetIndex);
        if (targetIndex > 0) newSet.add(targetIndex - 1);
        if (targetIndex < totalImages - 1) newSet.add(targetIndex + 1);
        return newSet;
      });
    },
    [totalImages],
  );

  // Navigate prev/next
  const goToPrev = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      scrollToIndex(currentIndex - 1);
    },
    [currentIndex, scrollToIndex],
  );

  const goToNext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      scrollToIndex(currentIndex + 1);
    },
    [currentIndex, scrollToIndex],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollToIndex(currentIndex - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollToIndex(currentIndex + 1);
      }
    },
    [currentIndex, scrollToIndex],
  );

  // Show controls on interaction (hover/touch)
  const handleInteractionStart = useCallback(() => {
    setIsInteracting(true);
    // Clear any pending hide timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
  }, []);

  const handleInteractionEnd = useCallback(() => {
    // Delay hiding controls to allow clicking
    interactionTimeoutRef.current = setTimeout(() => {
      setIsInteracting(false);
    }, 150);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, []);

  // Single image - no carousel needed
  if (totalImages <= 1) {
    return (
      <Image
        src={displayImages[0]}
        alt={alt}
        fill
        className="object-cover group-hover:scale-105 transition-transform duration-normal ease-out"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        onError={onImageError}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={handleInteractionStart}
      onMouseLeave={handleInteractionEnd}
      onTouchStart={handleInteractionStart}
      onTouchEnd={handleInteractionEnd}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={`Image carousel for ${alt}`}
      aria-roledescription="carousel"
    >
      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        className="flex w-full h-full snap-x snap-mandatory overflow-x-auto scrollbar-hide"
        onScroll={handleScroll}
        style={{ scrollSnapType: "x mandatory" }}
      >
        {displayImages.map((src, index) => (
          <div
            key={index}
            className="relative shrink-0 w-full h-full snap-center"
            role="group"
            aria-roledescription="slide"
            aria-label={`Image ${index + 1} of ${totalImages}`}
          >
            {/* Only load images that are visible or adjacent */}
            {loadedImages.has(index) || Math.abs(index - currentIndex) <= 1 ? (
              <Image
                src={src}
                alt={`${alt} - Image ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                onError={index === 0 ? onImageError : undefined}
                loading={index === 0 ? "eager" : "lazy"}
                priority={index === 0}
              />
            ) : (
              <div className="w-full h-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {/* Navigation buttons - visible on hover/touch */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none transition-opacity duration-200",
          isInteracting ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Previous button - 44px touch target with visual 32px appearance */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={goToPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Previous image"
          >
            <span className="w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-md flex items-center justify-center hover:bg-white dark:hover:bg-zinc-700 transition-colors">
              <ChevronLeft className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
            </span>
          </button>
        )}

        {/* Next button - 44px touch target with visual 32px appearance */}
        {currentIndex < totalImages - 1 && (
          <button
            type="button"
            onClick={goToNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Next image"
          >
            <span className="w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-md flex items-center justify-center hover:bg-white dark:hover:bg-zinc-700 transition-colors">
              <ChevronRight className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
            </span>
          </button>
        )}
      </div>

      {/* Dots indicator */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10"
        role="tablist"
        aria-label="Image navigation"
      >
        {displayImages.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              scrollToIndex(index);
            }}
            className="relative p-2.5 -m-2 flex items-center justify-center"
            role="tab"
            aria-selected={index === currentIndex}
            aria-label={`Go to image ${index + 1}`}
          >
            <span
              className={cn(
                "block w-1.5 h-1.5 rounded-full transition-all duration-200",
                index === currentIndex
                  ? "bg-white w-3 shadow-sm"
                  : "bg-white/60 group-hover/dot:bg-white/80",
              )}
            />
          </button>
        ))}
      </div>

      {/* Live region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Image {currentIndex + 1} of {totalImages}
      </div>
    </div>
  );
}
