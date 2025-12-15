'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CustomScrollContainerProps {
    children: React.ReactNode;
    className?: string;
}

const CustomScrollContainer = ({ children, className = "" }: CustomScrollContainerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);

    const [scrollProgress, setScrollProgress] = useState(0);
    const [thumbHeight, setThumbHeight] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isScrollable, setIsScrollable] = useState(false);
    const [containerHeight, setContainerHeight] = useState(0);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Calculate thumb size based on content ratio
    const updateThumbHeight = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const { scrollHeight, clientHeight } = container;
        const ratio = clientHeight / scrollHeight;
        // Minimum thumb height of 40px, max of 120px
        const newThumbHeight = Math.max(40, Math.min(120, ratio * clientHeight));
        setThumbHeight(newThumbHeight);
        setContainerHeight(clientHeight);
        setIsScrollable(scrollHeight > clientHeight);
    }, []);

    // Show scrollbar and auto-hide after delay
    const showScrollbar = useCallback(() => {
        setIsVisible(true);
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        hideTimeoutRef.current = setTimeout(() => {
            if (!isDragging) {
                setIsVisible(false);
            }
        }, 1500);
    }, [isDragging]);

    // Sync scrollbar with container scroll
    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const maxScroll = scrollHeight - clientHeight;
        const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;

        setScrollProgress(progress);
        showScrollbar();
    }, [showScrollbar]);

    // Handle drag start
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    // Handle dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            e.preventDefault();

            const container = containerRef.current;
            const containerRect = container.getBoundingClientRect();
            const availableHeight = containerRect.height - thumbHeight;

            // Calculate cursor position relative to container
            const relativeY = e.clientY - containerRect.top - (thumbHeight / 2);
            const ratio = Math.max(0, Math.min(1, relativeY / availableHeight));

            const maxScroll = container.scrollHeight - container.clientHeight;
            container.scrollTop = ratio * maxScroll;
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            // Trigger hide timeout after drag ends
            showScrollbar();
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isDragging, thumbHeight, showScrollbar]);

    // Attach scroll listener and calculate initial thumb height
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            updateThumbHeight();
            handleScroll();
        }

        // Update thumb height on resize
        const resizeObserver = new ResizeObserver(() => {
            updateThumbHeight();
        });

        if (container) {
            resizeObserver.observe(container);
        }

        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
                resizeObserver.disconnect();
            }
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, [handleScroll, updateThumbHeight]);

    // Calculate thumb position using state values (avoid ref access during render)
    const thumbPosition = containerHeight > 0
        ? scrollProgress * (containerHeight - thumbHeight)
        : 0;

    return (
        <div className="relative w-full h-screen overflow-hidden bg-background">
            {/* Hide Native Scrollbar */}
            <style>{`
                .custom-scroll-hide::-webkit-scrollbar { display: none; }
                .custom-scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* Scrollable Content Area */}
            <div
                ref={containerRef}
                className={`w-full h-full overflow-y-auto custom-scroll-hide scroll-smooth ${className}`}
            >
                {children}
            </div>

            {/* Custom Scrollbar - Positioned inside container */}
            {isScrollable && (
                <div
                    className={`
                        absolute top-0 right-1 bottom-0 w-2 z-50
                        pointer-events-none
                        transition-opacity duration-300
                        ${(isVisible || isDragging) ? 'opacity-100' : 'opacity-0'}
                    `}
                >
                    {/* Scrollbar Thumb */}
                    <div
                        ref={thumbRef}
                        onMouseDown={handleMouseDown}
                        onMouseEnter={() => showScrollbar()}
                        style={{
                            height: thumbHeight,
                            transform: `translateY(${thumbPosition}px)`,
                        }}
                        className={`
                            absolute right-0 w-1.5 rounded-full
                            pointer-events-auto cursor-grab active:cursor-grabbing
                            bg-zinc-400/60 dark:bg-zinc-500/60
                            hover:bg-zinc-500/80 dark:hover:bg-zinc-400/80
                            hover:w-2
                            transition-all duration-150
                            ${isDragging ? 'bg-zinc-600 dark:bg-zinc-300 w-2' : ''}
                        `}
                    />
                </div>
            )}
        </div>
    );
};

export default CustomScrollContainer;
