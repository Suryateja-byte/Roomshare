'use client';

import { Home, Users, Building2, LayoutGrid } from 'lucide-react';

const ROOM_TYPE_OPTIONS = [
  { value: 'any', label: 'All', icon: LayoutGrid },
  { value: 'Private Room', label: 'Private', icon: Home },
  { value: 'Shared Room', label: 'Shared', icon: Users },
  { value: 'Entire Place', label: 'Entire', icon: Building2 },
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
export function CategoryTabs({ selectedRoomType, onRoomTypeChange }: CategoryTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
      {ROOM_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => {
        const isSelected = selectedRoomType === value || (!selectedRoomType && value === 'any');

        return (
          <button
            key={value}
            type="button"
            onClick={() => onRoomTypeChange(value === 'any' ? '' : value)}
            className={`
              flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
              transition-all duration-200
              ${isSelected
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-zinc-900/50'
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
