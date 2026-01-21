'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageCarouselProps {
  images: string[];
  alt: string;
  priority?: boolean;
  className?: string;
  onImageError?: (index: number) => void;
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
export function ImageCarousel({
  images,
  alt,
  priority = false,
  className = '',
  onImageError,
}: ImageCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showControls, setShowControls] = useState(false);

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
          src={images[0] || '/placeholder-listing.jpg'}
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
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={`Image carousel for ${alt}`}
      aria-roledescription="carousel"
    >
      {/* Embla viewport */}
      <div ref={emblaRef} className="overflow-hidden h-full">
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
                loading={index === 0 ? undefined : 'lazy'}
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
          absolute left-2 top-1/2 -translate-y-1/2 z-10
          w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90
          flex items-center justify-center
          shadow-md backdrop-blur-sm
          transition-all duration-200
          hover:bg-white dark:hover:bg-zinc-700
          focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white
          ${showControls ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}
        `}
        aria-label="Previous image"
      >
        <ChevronLeft className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
      </button>

      <button
        onClick={scrollNext}
        className={`
          absolute right-2 top-1/2 -translate-y-1/2 z-10
          w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90
          flex items-center justify-center
          shadow-md backdrop-blur-sm
          transition-all duration-200
          hover:bg-white dark:hover:bg-zinc-700
          focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white
          ${showControls ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}
        `}
        aria-label="Next image"
      >
        <ChevronRight className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
      </button>

      {/* Navigation Dots */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5"
        role="tablist"
        aria-label="Image navigation"
      >
        {images.map((_, index) => (
          <button
            key={index}
            onClick={(e) => scrollTo(e, index)}
            className={`
              w-1.5 h-1.5 rounded-full transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1
              ${index === selectedIndex
                ? 'bg-white w-2.5'
                : 'bg-white/60 hover:bg-white/80'
              }
            `}
            role="tab"
            aria-selected={index === selectedIndex}
            aria-label={`Go to image ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default ImageCarousel;
