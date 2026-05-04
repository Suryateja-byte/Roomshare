"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  priority?: boolean;
  className?: string;
  onImageError?: (index: number) => void;
  onStaticClick?: () => void;
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

function areCarouselPropsEqual(
  prev: ImageCarouselProps,
  next: ImageCarouselProps
): boolean {
  return (
    prev.images === next.images &&
    prev.alt === next.alt &&
    prev.priority === next.priority &&
    prev.className === next.className &&
    prev.onImageError === next.onImageError &&
    prev.onStaticClick === next.onStaticClick
  );
}

const CLICK_DRAG_THRESHOLD_PX = 8;

function ImageCarouselInner({
  images,
  alt,
  priority = false,
  className = "",
  onImageError,
  onStaticClick,
}: ImageCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    dragThreshold: 10,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const fallbackImage =
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80";

  const scrollPrev = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      emblaApi?.scrollPrev();
    },
    [emblaApi]
  );

  const scrollNext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      emblaApi?.scrollNext();
    },
    [emblaApi]
  );

  const scrollTo = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      emblaApi?.scrollTo(index);
    },
    [emblaApi]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        emblaApi?.scrollPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        emblaApi?.scrollNext();
      }
    },
    [emblaApi]
  );

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    suppressNextClickRef.current = false;
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.hypot(deltaX, deltaY) > CLICK_DRAG_THRESHOLD_PX) {
      suppressNextClickRef.current = true;
    }
  }, []);

  const handlePointerEnd = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  const handleClickCapture = useCallback(
    (event: React.MouseEvent) => {
      if (suppressNextClickRef.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressNextClickRef.current = false;
        return;
      }

      const target = event.target;
      const control =
        target instanceof Element
          ? target.closest("[data-carousel-action]")
          : null;

      if (control) {
        const action = control.getAttribute("data-carousel-action");
        if (action) {
          event.preventDefault();
          event.stopPropagation();

          if (action === "previous") {
            emblaApi?.scrollPrev();
          } else if (action === "next") {
            emblaApi?.scrollNext();
          } else if (action === "dot") {
            const index = Number(control.getAttribute("data-carousel-index"));
            if (Number.isInteger(index)) {
              emblaApi?.scrollTo(index);
            }
          }

          return;
        }
      }

      if (
        onStaticClick &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        onStaticClick();
      }
    },
    [emblaApi, onStaticClick]
  );

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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
      onKeyDown={handleKeyDown}
      data-carousel-ready={emblaApi ? "true" : "false"}
      tabIndex={0}
      role="region"
      aria-label={`Image carousel for ${alt}`}
      aria-roledescription="carousel"
    >
      {/* Embla viewport */}
      <div
        ref={emblaRef}
        className="overflow-hidden h-full [touch-action:pan-y]"
      >
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
                loading={index === 0 ? undefined : "lazy"}
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
        data-carousel-action="previous"
        onClick={scrollPrev}
        className={`
          absolute left-1 top-1/2 -translate-y-1/2 z-10
          min-w-[44px] min-h-[44px] rounded-full bg-surface-container-lowest/90
          flex items-center justify-center
          shadow-ambient backdrop-blur-sm
          transition-all duration-200
          hover:bg-surface-container-lowest
          focus:outline-none focus:ring-2 focus:ring-primary/30
          ${showControls ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-2 pointer-events-none"}
        `}
        aria-label="Previous image"
        aria-hidden={!showControls}
        tabIndex={showControls ? 0 : -1}
      >
        <ChevronLeft className="w-5 h-5 text-on-surface-variant" />
      </button>

      <button
        data-carousel-action="next"
        onClick={scrollNext}
        className={`
          absolute right-1 top-1/2 -translate-y-1/2 z-10
          min-w-[44px] min-h-[44px] rounded-full bg-surface-container-lowest/90
          flex items-center justify-center
          shadow-ambient backdrop-blur-sm
          transition-all duration-200
          hover:bg-surface-container-lowest
          focus:outline-none focus:ring-2 focus:ring-primary/30
          ${showControls ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 translate-x-2 pointer-events-none"}
        `}
        aria-label="Next image"
        aria-hidden={!showControls}
        tabIndex={showControls ? 0 : -1}
      >
        <ChevronRight className="w-5 h-5 text-on-surface-variant" />
      </button>

      {/* Screen reader slide position announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        Image {selectedIndex + 1} of {images.length}
      </div>

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
                className="relative p-3 -m-2.5 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1"
                role="tab"
                aria-selected={index === selectedIndex}
                aria-label={`Go to image ${index + 1}`}
              >
                <span
                  className={`block rounded-full transition-[width,background-color] duration-200 h-2 shadow-[0_0_3px_rgb(0_0_0/0.4)] ${
                    index === selectedIndex
                      ? "bg-surface-container-lowest w-6"
                      : "bg-white/80 w-2"
                  }`}
                />
              </button>
            ));
          }
          // Windowed dots: keep selected dot centered when possible
          let start = Math.max(0, selectedIndex - Math.floor(MAX_DOTS / 2));
          if (start + MAX_DOTS > count) start = count - MAX_DOTS;
          const visibleIndices = Array.from(
            { length: MAX_DOTS },
            (_, i) => start + i
          );
          return visibleIndices.map((index) => (
            <button
              key={index}
              data-carousel-action="dot"
              data-carousel-index={index}
              onClick={(e) => scrollTo(e, index)}
              className="relative p-3 -m-2.5 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1"
              role="tab"
              aria-selected={index === selectedIndex}
              aria-label={`Go to image ${index + 1}`}
            >
              <span
                className={`block rounded-full transition-[width,background-color] duration-200 h-2 shadow-[0_0_3px_rgb(0_0_0/0.4)] ${
                  index === selectedIndex
                    ? "bg-surface-container-lowest w-6"
                    : index === visibleIndices[0] ||
                        index === visibleIndices[MAX_DOTS - 1]
                      ? "bg-white/40 w-1.5"
                      : "bg-white/80 w-2"
                }`}
              />
            </button>
          ));
        })()}
      </div>
    </div>
  );
}

export const ImageCarousel = memo(ImageCarouselInner, areCarouselPropsEqual);
export default ImageCarousel;
