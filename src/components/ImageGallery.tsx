'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, ZoomIn, Grid3X3, ImageOff, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
    images: string[];
    title: string;
}

// Image component with error fallback - uses next/image for optimization
function ImageWithFallback({
    src,
    alt,
    className,
    onError,
    hasError,
    sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
    priority = false,
    ...props
}: {
    src: string;
    alt: string;
    className?: string;
    onError: () => void;
    hasError: boolean;
    sizes?: string;
    priority?: boolean;
    [key: string]: any;
}) {
    if (hasError) {
        return (
            <div className={cn("flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-800", className)}>
                <ImageOff className="w-8 h-8 text-zinc-400 dark:text-zinc-500 mb-2" />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Image unavailable</span>
            </div>
        );
    }

    return (
        <Image
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            className={cn("object-cover", className)}
            onError={onError}
        />
    );
}

// Gallery item with hover effects - uses named group to prevent parent group interference
function GalleryItem({
    src,
    alt,
    onClick,
    hasError,
    onError,
    overlay,
    className,
    priority = false,
    sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
}: {
    src: string;
    alt: string;
    onClick: () => void;
    hasError: boolean;
    onError: () => void;
    overlay?: React.ReactNode;
    className?: string;
    priority?: boolean;
    sizes?: string;
}) {
    return (
        <div
            className={cn("relative group/item cursor-pointer overflow-hidden", className)}
            onClick={onClick}
        >
            <ImageWithFallback
                src={src}
                alt={alt}
                className="transition-transform duration-slow ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover/item:scale-[1.03]"
                hasError={hasError}
                onError={onError}
                priority={priority}
                sizes={sizes}
            />
            <div className="absolute inset-0 bg-black/5 group-hover/item:bg-black/0 transition-colors duration-500 ease-out" />
            {overlay}
        </div>
    );
}

export default function ImageGallery({ images, title }: ImageGalleryProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isZoomed, setIsZoomed] = useState(false);
    // Track which images have failed to load
    const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

    const markImageBroken = (index: number) => {
        setBrokenImages(prev => new Set(prev).add(index));
    };

    const imageCount = images.length;

    const openLightbox = (index: number) => {
        if (imageCount === 0) return;
        setCurrentIndex(index);
        setLightboxOpen(true);
        setIsZoomed(false);
    };

    const closeLightbox = () => {
        setLightboxOpen(false);
        setIsZoomed(false);
    };

    const goToPrevious = useCallback(() => {
        setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
        setIsZoomed(false);
    }, [images.length]);

    const goToNext = useCallback(() => {
        setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
        setIsZoomed(false);
    }, [images.length]);

    const toggleZoom = () => {
        setIsZoomed((prev) => !prev);
    };

    // Keyboard navigation
    useEffect(() => {
        if (!lightboxOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    closeLightbox();
                    break;
                case 'ArrowLeft':
                    goToPrevious();
                    break;
                case 'ArrowRight':
                    goToNext();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        // Prevent body scroll when lightbox is open
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [lightboxOpen, goToPrevious, goToNext]);

    // Container classes shared across all layouts
    const containerClasses = "w-full h-[400px] md:h-[500px] rounded-3xl overflow-hidden shadow-sm dark:shadow-none bg-zinc-100 dark:bg-zinc-900";

    // Render gallery based on image count
    const renderGallery = () => {
        // 0 images - Placeholder
        if (imageCount === 0) {
            return (
                <div className={cn(containerClasses, "flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800")}>
                    <div className="p-6 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
                        <ImageIcon className="w-10 h-10" />
                    </div>
                    <p className="font-medium text-lg">No photos added yet</p>
                    <p className="text-sm mt-1 opacity-70">Listing preview will appear here</p>
                </div>
            );
        }

        // 1 image - Full hero
        if (imageCount === 1) {
            return (
                <div className={containerClasses}>
                    <GalleryItem
                        src={images[0]}
                        alt={title}
                        onClick={() => openLightbox(0)}
                        hasError={brokenImages.has(0)}
                        onError={() => markImageBroken(0)}
                        className="w-full h-full"
                        priority
                        sizes="(max-width: 768px) 100vw, 100vw"
                    />
                </div>
            );
        }

        // 2 images - Split layout
        if (imageCount === 2) {
            return (
                <div className={cn(containerClasses, "grid grid-cols-1 md:grid-cols-2 gap-2")}>
                    <GalleryItem
                        src={images[0]}
                        alt={`${title} - Image 1`}
                        onClick={() => openLightbox(0)}
                        hasError={brokenImages.has(0)}
                        onError={() => markImageBroken(0)}
                        className="h-full"
                        priority
                        sizes="(max-width: 768px) 100vw, 50vw"
                    />
                    <GalleryItem
                        src={images[1]}
                        alt={`${title} - Image 2`}
                        onClick={() => openLightbox(1)}
                        hasError={brokenImages.has(1)}
                        onError={() => markImageBroken(1)}
                        className="h-full"
                        sizes="(max-width: 768px) 100vw, 50vw"
                    />
                </div>
            );
        }

        // 3 images - 2/3 + 1/3 stacked layout
        if (imageCount === 3) {
            return (
                <div className={cn(containerClasses, "grid grid-cols-1 md:grid-cols-3 gap-2")}>
                    <GalleryItem
                        src={images[0]}
                        alt={`${title} - Main`}
                        onClick={() => openLightbox(0)}
                        hasError={brokenImages.has(0)}
                        onError={() => markImageBroken(0)}
                        className="md:col-span-2 h-full"
                        priority
                        sizes="(max-width: 768px) 100vw, 66vw"
                    />
                    <div className="hidden md:flex flex-col gap-2 h-full">
                        <GalleryItem
                            src={images[1]}
                            alt={`${title} - Image 2`}
                            onClick={() => openLightbox(1)}
                            hasError={brokenImages.has(1)}
                            onError={() => markImageBroken(1)}
                            className="h-full"
                            sizes="33vw"
                        />
                        <GalleryItem
                            src={images[2]}
                            alt={`${title} - Image 3`}
                            onClick={() => openLightbox(2)}
                            hasError={brokenImages.has(2)}
                            onError={() => markImageBroken(2)}
                            className="h-full"
                            sizes="33vw"
                        />
                    </div>
                </div>
            );
        }

        // 4+ images - Bento grid layout
        return (
            <div className={cn(containerClasses, "grid grid-cols-1 md:grid-cols-4 gap-2")}>
                {/* Main Image (50% width) */}
                <GalleryItem
                    src={images[0]}
                    alt={`${title} - Main`}
                    onClick={() => openLightbox(0)}
                    hasError={brokenImages.has(0)}
                    onError={() => markImageBroken(0)}
                    className="md:col-span-2 h-full"
                    priority
                    sizes="(max-width: 768px) 100vw, 50vw"
                />

                {/* Side Images Grid */}
                <div className="hidden md:grid grid-cols-2 grid-rows-2 gap-2 col-span-2 h-full">
                    {/* Tall image spanning 2 rows */}
                    <GalleryItem
                        src={images[1]}
                        alt={`${title} - Image 2`}
                        onClick={() => openLightbox(1)}
                        hasError={brokenImages.has(1)}
                        onError={() => markImageBroken(1)}
                        className="row-span-2"
                        sizes="25vw"
                    />
                    {/* Top right */}
                    <GalleryItem
                        src={images[2]}
                        alt={`${title} - Image 3`}
                        onClick={() => openLightbox(2)}
                        hasError={brokenImages.has(2)}
                        onError={() => markImageBroken(2)}
                        sizes="25vw"
                    />
                    {/* Bottom right with "more" overlay */}
                    <GalleryItem
                        src={images[3]}
                        alt={`${title} - Image 4`}
                        onClick={() => openLightbox(3)}
                        hasError={brokenImages.has(3)}
                        onError={() => markImageBroken(3)}
                        sizes="25vw"
                        overlay={imageCount > 4 ? (
                            <div className="absolute inset-0 bg-black/50 hover:bg-black/40 transition-colors flex items-center justify-center">
                                <span className="text-white font-medium text-sm border border-white/50 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full">
                                    +{imageCount - 4} more
                                </span>
                            </div>
                        ) : undefined}
                    />
                </div>

                {/* Mobile: Show all photos button */}
                {imageCount > 1 && (
                    <button
                        onClick={() => openLightbox(0)}
                        className="md:hidden absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-full text-zinc-900 text-sm font-medium shadow-lg"
                    >
                        <Grid3X3 className="w-4 h-4" />
                        View all {imageCount} photos
                    </button>
                )}
            </div>
        );
    };

    return (
        <>
            {/* Dynamic Gallery */}
            <div className="relative">
                {renderGallery()}
            </div>

            {/* Lightbox Modal */}
            {lightboxOpen && (
                <div
                    className="fixed inset-0 z-modal bg-black/95 flex flex-col"
                    onClick={closeLightbox}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 text-white">
                        <span className="text-sm font-medium">
                            {currentIndex + 1} / {images.length}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleZoom();
                                }}
                                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
                                title={isZoomed ? 'Zoom out' : 'Zoom in'}
                                aria-label={isZoomed ? 'Zoom out' : 'Zoom in'}
                            >
                                <ZoomIn className={cn("w-5 h-5", isZoomed && "text-primary")} />
                            </button>
                            <button
                                onClick={closeLightbox}
                                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
                                title="Close (Esc)"
                                aria-label="Close gallery"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Main Image Area */}
                    <div
                        className="flex-1 flex items-center justify-center px-4 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Previous Button */}
                        {images.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    goToPrevious();
                                }}
                                className="absolute left-4 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
                                title="Previous (←)"
                                aria-label="Previous image"
                            >
                                <ChevronLeft className="w-6 h-6 text-white" />
                            </button>
                        )}

                        {/* Image */}
                        <div
                            className={cn(
                                "relative w-full max-w-4xl h-[calc(100vh-180px)] transition-transform duration-200",
                                isZoomed ? "cursor-zoom-out scale-150" : "cursor-zoom-in scale-100"
                            )}
                            onClick={toggleZoom}
                        >
                            <ImageWithFallback
                                src={images[currentIndex]}
                                alt={`${title} - Image ${currentIndex + 1}`}
                                className="object-contain"
                                hasError={brokenImages.has(currentIndex)}
                                onError={() => markImageBroken(currentIndex)}
                                sizes="100vw"
                            />
                        </div>

                        {/* Next Button */}
                        {images.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    goToNext();
                                }}
                                className="absolute right-4 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
                                title="Next (→)"
                                aria-label="Next image"
                            >
                                <ChevronRight className="w-6 h-6 text-white" />
                            </button>
                        )}
                    </div>

                    {/* Thumbnail Strip */}
                    {images.length > 1 && (
                        <div className="px-4 py-3 overflow-x-auto">
                            <div className="flex gap-2 justify-center">
                                {images.map((img, i) => (
                                    <button
                                        key={i}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentIndex(i);
                                            setIsZoomed(false);
                                        }}
                                        className={cn(
                                            "relative w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 transition-all",
                                            currentIndex === i
                                                ? "ring-2 ring-white ring-offset-2 ring-offset-black"
                                                : "opacity-50 hover:opacity-100"
                                        )}
                                        aria-label={`View image ${i + 1}${currentIndex === i ? ' (current)' : ''}`}
                                    >
                                        <ImageWithFallback
                                            src={img}
                                            alt={`Thumbnail ${i + 1}`}
                                            hasError={brokenImages.has(i)}
                                            onError={() => markImageBroken(i)}
                                            sizes="64px"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Keyboard hint */}
                    <div className="text-center text-zinc-500 text-xs pb-3">
                        Use ← → arrow keys to navigate • Esc to close
                    </div>
                </div>
            )}
        </>
    );
}
