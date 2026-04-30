"use client";

import Image, { type ImageProps } from "next/image";
import { useState, useRef, useEffect } from "react";
import { Skeleton } from "@/components/skeletons/Skeleton";

interface LazyImageProps
  extends Omit<ImageProps, "onLoad" | "onError" | "priority"> {
  fallback?: React.ReactNode;
  showSkeleton?: boolean;
  threshold?: number;
  rootMargin?: string;
  priority?: boolean;
}

export function LazyImage({
  src,
  alt,
  width,
  height,
  fallback,
  showSkeleton = true,
  threshold = 0.1,
  rootMargin = "100px",
  className = "",
  priority = false,
  preload,
  loading,
  fetchPriority,
  ...props
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const shouldLoadImmediately =
    priority || preload === true || loading === "eager";
  const [isInView, setIsInView] = useState(shouldLoadImmediately);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldLoadImmediately) return;

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, rootMargin, shouldLoadImmediately]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const computedWidth = typeof width === "number" ? width : undefined;
  const computedHeight = typeof height === "number" ? height : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        width: computedWidth,
        height: computedHeight,
      }}
    >
      {/* Skeleton placeholder */}
      {showSkeleton && !isLoaded && (
        <Skeleton
          variant="rectangular"
          width="100%"
          height="100%"
          className="absolute inset-0"
        />
      )}

      {/* Error fallback */}
      {hasError &&
        (fallback || (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container-high ">
            <svg
              className="h-8 w-8 text-on-surface-variant"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </div>
        ))}

      {/* Actual image */}
      {isInView && !hasError && (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={`transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          preload={preload ?? priority}
          loading={priority || preload ? undefined : loading}
          fetchPriority={priority ? "high" : fetchPriority}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      )}
    </div>
  );
}

// Blur placeholder variant for hero images
interface BlurImageProps extends LazyImageProps {
  blurDataURL?: string;
}

export function BlurImage({ blurDataURL, ...props }: BlurImageProps) {
  return (
    <LazyImage
      {...props}
      placeholder={blurDataURL ? "blur" : "empty"}
      blurDataURL={blurDataURL}
      showSkeleton={!blurDataURL}
    />
  );
}
