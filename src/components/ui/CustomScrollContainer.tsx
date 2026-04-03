"use client";

import React, { useRef } from "react";
import { ScrollContainerContext } from "@/contexts/ScrollContainerContext";

interface CustomScrollContainerProps {
  children: React.ReactNode;
  className?: string;
}

const CustomScrollContainer = ({
  children,
  className = "",
}: CustomScrollContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <ScrollContainerContext.Provider value={containerRef}>
      <div className="relative w-full h-screen-safe overflow-hidden bg-surface-canvas">
        <div
          ref={containerRef}
          data-app-scroll-container="true"
          className={`relative h-full w-full overflow-y-auto hide-scrollbar-mobile scroll-smooth ${className}`}
        >
          {children}
        </div>
      </div>
    </ScrollContainerContext.Provider>
  );
};

export default CustomScrollContainer;
