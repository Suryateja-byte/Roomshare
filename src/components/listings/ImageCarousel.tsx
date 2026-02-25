'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageCarouselProps {
  images: string[];
  alt: string;
  priority?: boolean;
  loading?: 'eager' | 'lazy';
  className?: string;
  onImageError?: (index: number) => void;
  /** Called when drag/swipe state changes — use to block parent click */
  onDragStateChange?: (isDragging: boolean) => void;
}

/**
 * ImageCarousel - Embla-based image carousel with navigation dots
 *
 * Features:
 * - Touch/swipe navigation on mobile
 * - Arrow buttons on hover (desktop)
 * - Navigation dots indicating current slide
 * - Lazy loading for non-visible images
 * - Keyboard accessible
 */
/** Max dots to display — window shifts to keep selected dot visible */
const MAX_DOTS = 5;

export function ImageCarousel({
  images,
  alt,
  priority = false,
  loading = 'lazy',
  className = '',
  onImageError,
  onDragStateChange,
}: ImageCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const fallbackImage =
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80";

  const scrollPrev = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    emblaApi?.scrollTo(index);
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Track drag state to prevent parent link click during swipe.
  // Only block clicks when an actual pointer-initiated drag occurs — not on
  // programmatic scrolls from button/dot navigation (which fire 'scroll' events
  // but never fire 'pointerDown'/'pointerUp' on the Embla viewport).
  useEffect(() => {
    if (!emblaApi) return;
    let hasDragged = false;
    let isPointerDown = false;

    const onPointerDown = () => {
      hasDragged = false;
      isPointerDown = true;
    };

    // Embla fires 'scroll' when the carousel position changes during a drag
    const onScroll = () => {
      if (isPointerDown && !hasDragged) {
        hasDragged = true;
        onDragStateChange?.(true);
      }
    };

    const onPointerUp = () => {
      isPointerDown = false;
      if (hasDragged) {
        // Small delay so the click event on the parent link is still blocked
        setTimeout(() => onDragStateChange?.(false), 10);
      }
      hasDragged = false;
    };

    emblaApi.on('pointerDown', onPointerDown);
    emblaApi.on('scroll', onScroll);
    emblaApi.on('pointerUp', onPointerUp);
    return () => {
      emblaApi.off('pointerDown', onPointerDown);
      emblaApi.off('scroll', onScroll);
      emblaApi.off('pointerUp', onPointerUp);
    };
  }, [emblaApi, onDragStateChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      emblaApi?.scrollPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      emblaApi?.scrollNext();
    }
  }, [emblaApi]);

  // Single image - no carousel needed
  if (images.length <= 1) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={images[0] || fallbackImage}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={priority}
          loading={priority ? undefined : loading}
          onError={() => onImageError?.(0)}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden group ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onFocus={() => setShowControls(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setShowControls(false);
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={`Image carousel for ${alt}`}
      aria-roledescription="carousel"
    >
      {/* Embla viewport */}
      <div ref={emblaRef} className="overflow-hidden h-full aspect-[16/9] [touch-action:pan-y]">
        <div className="flex h-full">
          {images.map((src, index) => (
            <div
              key={index}
              className="flex-[0_0_100%] min-w-0 relative h-full"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${images.length}`}
            >
              <Image
                src={src}
                alt={`${alt} - Image ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                priority={priority && index === 0}
                loading={priority && index === 0 ? undefined : index === 0 ? loading : 'lazy'}
                placeholder="blur"
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTRlNGU3Ii8+PC9zdmc+"
                onError={() => onImageError?.(index)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows - visible on hover */}
      <button
        onClick={scrollPrev}
        className={`
          absolute left-1 top-1/2 -translate-y-1/2 z-10
          min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-zinc-800/90
          flex items-center justify-center
          shadow-md backdrop-blur-sm
          transition-all duration-200
          hover:bg-white dark:hover:bg-zinc-700
          focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white
          ${showControls ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-2 pointer-events-none'}
        `}
        aria-label="Previous image"
        aria-hidden={!showControls}
        tabIndex={showControls ? 0 : -1}
      >
        <ChevronLeft className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
      </button>

      <button
        onClick={scrollNext}
        className={`
          absolute right-1 top-1/2 -translate-y-1/2 z-10
          min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-zinc-800/90
          flex items-center justify-center
          shadow-md backdrop-blur-sm
          transition-all duration-200
          hover:bg-white dark:hover:bg-zinc-700
          focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white
          ${showControls ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-2 pointer-events-none'}
        `}
        aria-label="Next image"
        aria-hidden={!showControls}
        tabIndex={showControls ? 0 : -1}
      >
        <ChevronRight className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
      </button>

      {/* Navigation Dots — max 5 visible, window shifts with selection */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5"
        role="tablist"
        aria-label="Image navigation"
      >
        {(() => {
          const count = images.length;
          if (count <= MAX_DOTS) {
            // Show all dots
            return images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => scrollTo(e, index)}
                className="relative p-2.5 -m-2 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1"
                role="tab"
                aria-selected={index === selectedIndex}
                aria-label={`Go to image ${index + 1}`}
              >
                <span
                  className={`block rounded-full transition-all duration-200 ${
                    index === selectedIndex
                      ? 'bg-white w-2.5 h-1.5'
                      : 'bg-white/60 w-1.5 h-1.5'
                  }`}
                />
              </button>
            ));
          }
          // Windowed dots: keep selected dot centered when possible
          let start = Math.max(0, selectedIndex - Math.floor(MAX_DOTS / 2));
          if (start + MAX_DOTS > count) start = count - MAX_DOTS;
          const visibleIndices = Array.from({ length: MAX_DOTS }, (_, i) => start + i);
          return visibleIndices.map((index) => (
            <button
              key={index}
              onClick={(e) => scrollTo(e, index)}
              className="relative p-2.5 -m-2 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1"
              role="tab"
              aria-selected={index === selectedIndex}
              aria-label={`Go to image ${index + 1}`}
            >
              <span
                className={`block rounded-full transition-all duration-200 ${
                  index === selectedIndex
                    ? 'bg-white w-2.5 h-1.5'
                    : (index === visibleIndices[0] || index === visibleIndices[MAX_DOTS - 1])
                      ? 'bg-white/40 w-1 h-1'
                      : 'bg-white/60 w-1.5 h-1.5'
                }`}
              />
            </button>
          ));
        })()}
      </div>
    </div>
  );
}

export default ImageCarousel;
