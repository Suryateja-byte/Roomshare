'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CustomScrollContainerProps {
    children: React.ReactNode;
    className?: string;
}

const CustomScrollContainer = ({ children, className = "" }: CustomScrollContainerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollTrackRef = useRef<HTMLDivElement>(null);

    const [scrollProgress, setScrollProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [scrollLabel, setScrollLabel] = useState("00");

    // Sync Custom Scrollbar with Container Scroll
    const handleScroll = () => {
        const container = containerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const maxScroll = scrollHeight - clientHeight;
        const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;

        setScrollProgress(progress);
        setScrollLabel(Math.round(progress * 100).toString().padStart(2, '0'));
    };

    // Handle Dragging Logic
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current || !scrollTrackRef.current) return;

            e.preventDefault();

            const trackRect = scrollTrackRef.current.getBoundingClientRect();
            const trackHeight = trackRect.height;
            const thumbHeight = 64; // Height of the expanded pill
            const availableHeight = trackHeight - thumbHeight;

            // Calculate cursor position relative to track
            const relativeY = e.clientY - trackRect.top - (thumbHeight / 2);
            const ratio = Math.max(0, Math.min(1, relativeY / availableHeight));

            const container = containerRef.current;
            const maxScroll = container.scrollHeight - container.clientHeight;

            container.scrollTop = ratio * maxScroll;
        };

        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Attach Scroll Listener
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            handleScroll(); // Init
        }
        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
        };
    }, []);

    return (
        <div className="relative w-full h-screen overflow-hidden bg-background">
            {/* Hide Native Scrollbar */}
            <style>{`
        .custom-scroll-hide::-webkit-scrollbar { display: none; }
        .custom-scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

            {/* --- THE CUSTOM SCROLLBAR UI --- */}
            <div
                ref={scrollTrackRef}
                className="fixed top-0 right-0 bottom-0 w-16 z-[9999] flex flex-col items-center justify-center mix-blend-exclusion pointer-events-none"
            >
                <div
                    className="h-[90vh] w-full relative pointer-events-auto group"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {/* Track Line */}
                    <div className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-white transition-opacity duration-300 ${isHovered || isDragging ? 'opacity-20' : 'opacity-0'}`} />

                    {/* Draggable Thumb */}
                    <div
                        onMouseDown={handleMouseDown}
                        style={{
                            top: `${scrollProgress * 100}%`,
                            transform: `translate(-50%, ${scrollProgress * -100}%)`
                        }}
                        className={`
              absolute left-1/2 cursor-grab active:cursor-grabbing
              flex flex-col items-center justify-center
              transition-all duration-300 ease-out
              backdrop-blur-sm shadow-[0_0_15px_rgba(255,255,255,0.4)]
              ${(isHovered || isDragging) ? 'w-10 h-16 rounded-full bg-white text-black scale-100' : 'w-1.5 h-12 rounded-full bg-white scale-90'}
            `}
                    >
                        <span className={`text-[10px] font-bold tracking-tighter transition-opacity duration-200 ${(isHovered || isDragging) ? 'opacity-100 delay-100' : 'opacity-0'}`}>
                            {scrollLabel}
                        </span>
                    </div>
                </div>
            </div>

            {/* --- SCROLLABLE CONTENT AREA --- */}
            <div
                ref={containerRef}
                className={`w-full h-full overflow-y-auto custom-scroll-hide scroll-smooth ${className}`}
            >
                {children}
            </div>
        </div>
    );
};

export default CustomScrollContainer;
