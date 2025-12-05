'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
    images: string[];
    title: string;
}

export default function ImageGallery({ images, title }: ImageGalleryProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isZoomed, setIsZoomed] = useState(false);

    const mainImage = images[0];
    const galleryImages = images.slice(1, 5);
    const hasMoreImages = images.length > 5;

    const openLightbox = (index: number) => {
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

    return (
        <>
            {/* Gallery Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[400px] md:h-[500px] rounded-3xl overflow-hidden">
                {/* Main Image */}
                <div
                    className="md:col-span-2 h-full relative group cursor-pointer"
                    onClick={() => openLightbox(0)}
                >
                    <img
                        src={mainImage}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn className="w-4 h-4" />
                        Click to enlarge
                    </div>
                </div>

                {/* Gallery Images */}
                {galleryImages.length > 0 && (
                    <div className="hidden md:grid grid-cols-2 gap-4 col-span-2 h-full">
                        {galleryImages.map((img, i) => (
                            <div
                                key={i}
                                className="relative group overflow-hidden cursor-pointer"
                                onClick={() => openLightbox(i + 1)}
                            >
                                <img
                                    src={img}
                                    alt={`${title} - Image ${i + 2}`}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />

                                {/* Show "View all" button on the last visible image if there are more */}
                                {i === galleryImages.length - 1 && hasMoreImages && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-full text-zinc-900 text-sm font-medium">
                                            <Grid3X3 className="w-4 h-4" />
                                            View all {images.length} photos
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Mobile: Show all photos button */}
                {images.length > 1 && (
                    <button
                        onClick={() => openLightbox(0)}
                        className="md:hidden absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-full text-zinc-900 text-sm font-medium shadow-lg"
                    >
                        <Grid3X3 className="w-4 h-4" />
                        View all {images.length} photos
                    </button>
                )}
            </div>

            {/* Lightbox Modal */}
            {lightboxOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex flex-col"
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
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                title={isZoomed ? 'Zoom out' : 'Zoom in'}
                            >
                                <ZoomIn className={cn("w-5 h-5", isZoomed && "text-primary")} />
                            </button>
                            <button
                                onClick={closeLightbox}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                title="Close (Esc)"
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
                                className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
                                title="Previous (←)"
                            >
                                <ChevronLeft className="w-6 h-6 text-white" />
                            </button>
                        )}

                        {/* Image */}
                        <div
                            className={cn(
                                "max-w-full max-h-full overflow-auto transition-transform duration-200",
                                isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
                            )}
                            onClick={toggleZoom}
                        >
                            <img
                                src={images[currentIndex]}
                                alt={`${title} - Image ${currentIndex + 1}`}
                                className={cn(
                                    "max-h-[calc(100vh-180px)] object-contain transition-transform duration-200",
                                    isZoomed ? "scale-150" : "scale-100"
                                )}
                                draggable={false}
                            />
                        </div>

                        {/* Next Button */}
                        {images.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    goToNext();
                                }}
                                className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
                                title="Next (→)"
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
                                            "w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 transition-all",
                                            currentIndex === i
                                                ? "ring-2 ring-white ring-offset-2 ring-offset-black"
                                                : "opacity-50 hover:opacity-100"
                                        )}
                                    >
                                        <img
                                            src={img}
                                            alt={`Thumbnail ${i + 1}`}
                                            className="w-full h-full object-cover"
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
