"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useTransition,
} from "react";
import {
  Home,
  Building2,
  PawPrint,
  Sofa,
  CalendarClock,
  DollarSign,
  Users,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/**
 * Category definitions that map to existing filter params.
 * Each category is a shortcut that applies one or more URL filters.
 */
const CATEGORIES = [
  {
    id: "entire",
    label: "Entire Place",
    icon: Building2,
    params: { roomType: "Entire Place" },
  },
  {
    id: "private",
    label: "Private Room",
    icon: Home,
    params: { roomType: "Private Room" },
  },
  {
    id: "pet",
    label: "Pet Friendly",
    icon: PawPrint,
    params: { houseRules: "Pets allowed" },
  },
  {
    id: "furnished",
    label: "Furnished",
    icon: Sofa,
    params: { amenities: "Furnished" },
  },
  {
    id: "shortTerm",
    label: "Short Term",
    icon: CalendarClock,
    params: { leaseDuration: "Month-to-month" },
  },
  {
    id: "budget",
    label: "Under $1000",
    icon: DollarSign,
    params: { maxPrice: "1000" },
  },
  {
    id: "shared",
    label: "Shared Room",
    icon: Users,
    params: { roomType: "Shared Room" },
  },
  {
    id: "wifi",
    label: "Wifi",
    icon: Sparkles,
    params: { amenities: "Wifi" },
  },
] as const;

/** Check if a category's params match the current URL */
function isCategoryActive(
  categoryParams: Record<string, string>,
  searchParams: URLSearchParams
): boolean {
  return Object.entries(categoryParams).every(([key, value]) => {
    // Price params: "Under $1000" should show active when maxPrice <= 1000
    // (not just exact match). Prevents user confusion when NLP sets maxPrice=800
    // — the category should appear active since a stricter budget IS "under $1000".
    if (key === "maxPrice") {
      const current = searchParams.get(key);
      if (!current) return false;
      return Number(current) <= Number(value);
    }

    const current = searchParams.getAll(key);
    if (current.length === 0) {
      const single = searchParams.get(key);
      return single === value;
    }
    // For array params (amenities, houseRules), check if value is included
    return (
      current.includes(value) ||
      (current.length === 1 && current[0].split(",").includes(value))
    );
  });
}

export function CategoryBar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Compute active category set once per URL change (not 8x per render)
  const searchParamsString = searchParams.toString();
  const activeCategoryIds = useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    return new Set(
      CATEGORIES.filter((cat) => isCategoryActive(cat.params, params)).map(
        (cat) => cat.id
      )
    );
  }, [searchParamsString]);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkOverflow);
      ro.disconnect();
    };
  }, [checkOverflow]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const handleSelect = (categoryParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    const isActive = isCategoryActive(categoryParams, params);

    if (isActive) {
      // Toggle off — remove the category's params
      for (const [key, value] of Object.entries(categoryParams)) {
        // Price params: always delete when toggling off (user wants to remove budget cap)
        if (key === "maxPrice" || key === "minPrice") {
          params.delete(key);
          continue;
        }
        const existing = params.getAll(key);
        if (existing.length <= 1) {
          // Simple param or comma-separated
          const current = params.get(key);
          if (current === value) {
            params.delete(key);
          } else if (current?.includes(",")) {
            const parts = current.split(",").filter((p) => p !== value);
            if (parts.length > 0) {
              params.set(key, parts.join(","));
            } else {
              params.delete(key);
            }
          }
        }
      }
    } else {
      // Toggle on — add or merge
      for (const [key, value] of Object.entries(categoryParams)) {
        const current = params.get(key);
        if (key === "amenities" || key === "houseRules") {
          // Array params — append if not already present
          if (current) {
            const parts = current.split(",");
            if (!parts.includes(value)) {
              params.set(key, [...parts, value].join(","));
            }
          } else {
            params.set(key, value);
          }
        } else {
          params.set(key, value);
        }
      }
    }

    // Reset pagination
    params.delete("cursor");
    params.delete("page");
    params.delete("cursorStack");
    params.delete("pageNumber");

    startTransition(() => {
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    });
  };

  return (
    <nav
      className="relative border-b border-outline-variant/20 bg-surface-container-lowest"
      aria-label="Category filters"
    >
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center w-8 h-8 bg-surface-container-lowest border border-outline-variant/20 rounded-full shadow-sm hover:shadow-md transition-shadow ml-2"
          aria-label="Scroll categories left"
        >
          <ChevronLeft className="w-4 h-4 text-on-surface" />
        </button>
      )}

      {/* Fade left edge */}
      {canScrollLeft && (
        <div
          className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-surface-container-lowest to-transparent pointer-events-none z-10"
          aria-hidden="true"
        />
      )}

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-4 sm:gap-6 md:gap-8 px-4 sm:px-6 pt-6 pb-4 overflow-x-auto scrollbar-hide scroll-smooth"
        style={{ cursor: "grab" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") scroll("right");
          if (e.key === "ArrowLeft") scroll("left");
        }}
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategoryIds.has(cat.id);

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleSelect(cat.params)}
              disabled={isPending}
              title={cat.label}
              className={`
                flex flex-col items-center gap-2 pt-2 pb-3 min-w-[56px] text-xs font-medium
                transition-all duration-200 flex-shrink-0 border-b-2
                ${
                  isActive
                    ? "border-on-surface text-on-surface"
                    : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant/30"
                }
                disabled:opacity-60 disabled:cursor-not-allowed
              `}
              aria-pressed={isActive}
            >
              <Icon
                className={`w-6 h-6 overflow-visible ${isActive ? "opacity-100" : "opacity-70"}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span className="whitespace-nowrap">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Fade right edge */}
      {canScrollRight && (
        <div
          className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-surface-container-lowest to-transparent pointer-events-none z-10"
          aria-hidden="true"
        />
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center w-8 h-8 bg-surface-container-lowest border border-outline-variant/20 rounded-full shadow-sm hover:shadow-md transition-shadow mr-2"
          aria-label="Scroll categories right"
        >
          <ChevronRight className="w-4 h-4 text-on-surface" />
        </button>
      )}
    </nav>
  );
}

export default CategoryBar;
