"use client";

import { Home, Users, Building2, LayoutGrid } from "lucide-react";

const ROOM_TYPE_OPTIONS = [
  { value: "any", label: "All", icon: LayoutGrid },
  { value: "Private Room", label: "Private", icon: Home },
  { value: "Shared Room", label: "Shared", icon: Users },
  { value: "Entire Place", label: "Entire", icon: Building2 },
] as const;

interface CategoryTabsProps {
  selectedRoomType: string;
  onRoomTypeChange: (value: string) => void;
}

/**
 * CategoryTabs - Quick filter tabs for Room Type
 *
 * Presentational component - receives state via props.
 * All filter logic remains in SearchForm.
 */
export function CategoryTabs({
  selectedRoomType,
  onRoomTypeChange,
}: CategoryTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-surface-container-high rounded-xl">
      {ROOM_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => {
        const isSelected =
          selectedRoomType === value || (!selectedRoomType && value === "any");

        return (
          <button
            key={value}
            type="button"
            onClick={() => onRoomTypeChange(value === "any" ? "" : value)}
            className={`
              flex items-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium
              transition-all duration-200
              ${
                isSelected
                  ? "bg-surface-container-lowest text-on-surface shadow-ambient-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/50"
              }
            `}
            aria-pressed={isSelected}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default CategoryTabs;
