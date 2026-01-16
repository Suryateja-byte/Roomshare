"use client";

import { ReactNode } from "react";

interface SearchLayoutViewProps {
  children: ReactNode;
}

/**
 * SearchLayoutView - Manages the split view layout for search
 *
 * Handles:
 * - List/Map split view rendering
 * - Map toggle visibility
 * - Mobile vs desktop layout differences
 *
 * This is a stub implementation - full implementation pending
 */
export default function SearchLayoutView({ children }: SearchLayoutViewProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Results list from page */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
