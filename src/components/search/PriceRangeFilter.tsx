"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import * as Slider from "@radix-ui/react-slider";
import type { PriceHistogramBucket } from "@/app/api/search/facets/route";
import { PriceHistogram } from "./PriceHistogram";
import { formatPriceCompact } from "@/lib/format";

interface PriceRangeFilterProps {
  minPrice: number;
  maxPrice: number;
  absoluteMin: number;
  absoluteMax: number;
  histogram: PriceHistogramBucket[] | null;
  onChange: (min: number, max: number) => void;
}

const HISTOGRAM_HEIGHT = 80;

export function PriceRangeFilter({
  minPrice,
  maxPrice,
  absoluteMin,
  absoluteMax,
  histogram,
  onChange,
}: PriceRangeFilterProps) {
  // Local sliding state for immediate visual feedback during drag
  const [localMin, setLocalMin] = useState(minPrice);
  const [localMax, setLocalMax] = useState(maxPrice);
  const isDragging = useRef(false);

  // Sync local state when props change (from external reset/URL sync/category bar)
  useEffect(() => {
    if (!isDragging.current) {
      setLocalMin(minPrice);
      setLocalMax(maxPrice);
    }
  }, [minPrice, maxPrice]);

  const range = absoluteMax - absoluteMin;
  const step = range <= 1000 ? 10 : range <= 5000 ? 25 : 50;

  const handleValueChange = useCallback((values: number[]) => {
    isDragging.current = true;
    setLocalMin(values[0]);
    setLocalMax(values[1]);
  }, []);

  const handleValueCommit = useCallback(
    (values: number[]) => {
      isDragging.current = false;
      const [min, max] = values;
      onChange(Math.min(min, max), Math.max(min, max));
    },
    [onChange]
  );

  const isAtMax = localMax >= absoluteMax;
  const rangeLabel = `${formatPriceCompact(localMin)} – ${isAtMax ? `${formatPriceCompact(absoluteMax)}+` : formatPriceCompact(localMax)}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-on-surface">
          Price Range
        </label>
        <span className="text-sm text-on-surface-variant">{rangeLabel}</span>
      </div>

      {/* Histogram + Slider container */}
      <div className="relative" style={{ height: HISTOGRAM_HEIGHT + 40 }}>
        {/* Histogram bars */}
        <PriceHistogram
          buckets={histogram}
          selectedMin={localMin}
          selectedMax={localMax}
          height={HISTOGRAM_HEIGHT}
        />

        {/* Radix Slider */}
        <Slider.Root
          className="absolute inset-x-0 flex items-center select-none touch-none"
          style={{ top: HISTOGRAM_HEIGHT - 10, height: 44 }}
          min={absoluteMin}
          max={absoluteMax}
          step={step}
          value={[localMin, localMax]}
          onValueChange={handleValueChange}
          onValueCommit={handleValueCommit}
          aria-label="Price range"
        >
          <Slider.Track className="relative h-1 w-full rounded-full bg-surface-container-high">
            <Slider.Range className="absolute h-full rounded-full bg-on-surface" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-6 h-6 bg-surface-container-lowest border-2 border-outline-variant/20 rounded-full shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-grab active:cursor-grabbing transition-shadow"
            aria-label="Minimum price"
          />
          <Slider.Thumb
            className="block w-6 h-6 bg-surface-container-lowest border-2 border-outline-variant/20 rounded-full shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-grab active:cursor-grabbing transition-shadow"
            aria-label="Maximum price"
          />
        </Slider.Root>
      </div>
    </div>
  );
}
