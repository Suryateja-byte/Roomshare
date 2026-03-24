"use client";

interface SlotSelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
}

export function SlotSelector({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
}: SlotSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor="slot-selector"
        className="text-sm font-medium text-on-surface-variant"
      >
        Slots
      </label>
      <div className="flex items-center border rounded-lg overflow-hidden">
        <button
          type="button"
          aria-label="Decrease slots"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="px-3 py-2 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &minus;
        </button>
        <input
          id="slot-selector"
          type="number"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-12 text-center border-x py-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="Increase slots"
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="px-3 py-2 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
      <span className="text-xs text-on-surface-variant">{max} available</span>
    </div>
  );
}
