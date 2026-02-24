/**
 * Unit tests for FilterModal component
 *
 * Tests the presentational filter drawer:
 * 1. Renders with role="dialog" and aria-modal="true"
 * 2. Close button has aria-label
 * 3. Amenity toggles have aria-pressed
 * 4. onApply fires when apply button is clicked
 * 5. onClose fires when close button is clicked
 * 6. Renders null when isOpen=false
 * 7. House rule toggles have aria-pressed
 */

// Mock createPortal to render inline instead of into document.body
jest.mock("react-dom", () => {
  const actual = jest.requireActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  X: ({ className }: { className?: string }) => (
    <svg data-testid="x-icon" className={className} />
  ),
}));

// Mock Button component to pass through props
jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
    "aria-pressed": ariaPressed,
    "aria-disabled": ariaDisabled,
    disabled,
    "data-testid": testId,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
    "aria-pressed"?: boolean;
    "aria-disabled"?: boolean;
    disabled?: boolean;
    "data-testid"?: string;
    className?: string;
    variant?: string;
    size?: string;
    type?: string;
    "data-active"?: boolean;
  }) => (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-disabled={ariaDisabled}
      disabled={disabled}
      data-testid={testId}
      className={className}
    >
      {children}
    </button>
  ),
}));

// Mock Input component
jest.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

// Mock FocusTrap to just render children
jest.mock("@/components/ui/FocusTrap", () => ({
  FocusTrap: ({
    children,
  }: {
    children: React.ReactNode;
    active?: boolean;
  }) => <div data-testid="focus-trap">{children}</div>,
}));

// Mock DatePicker
jest.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder,
    id,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    id?: string;
    minDate?: string;
  }) => (
    <input
      data-testid="date-picker"
      id={id}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

// Mock Select components
jest.mock("@/components/ui/select", () => ({
  Select: ({
    children,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => <div data-testid="select-root">{children}</div>,
  SelectTrigger: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
  }) => (
    <button data-testid={`select-trigger-${id}`} id={id}>
      {children}
    </button>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
    disabled?: boolean;
  }) => (
    <div data-testid={`select-item-${value}`} data-value={value}>
      {children}
    </div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

// Mock PriceRangeFilter
jest.mock("@/components/search/PriceRangeFilter", () => ({
  PriceRangeFilter: () => (
    <div data-testid="price-range-filter">Price Range</div>
  ),
}));

// Mock DrawerZeroState
jest.mock("@/components/search/DrawerZeroState", () => ({
  DrawerZeroState: ({
    suggestions,
    onRemoveSuggestion,
  }: {
    suggestions: { type: string; label: string; priority: number }[];
    onRemoveSuggestion: (s: { type: string; label: string; priority: number }) => void;
  }) => (
    <div data-testid="drawer-zero-state">
      {suggestions.map((s) => (
        <button key={s.type} onClick={() => onRemoveSuggestion(s)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
}));

// Mock getLanguageName
jest.mock("@/lib/languages", () => ({
  getLanguageName: (code: string) => {
    const names: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
    };
    return names[code] || code;
  },
}));

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterModal } from "@/components/search/FilterModal";

// Default props factory
function makeProps(overrides?: Partial<React.ComponentProps<typeof FilterModal>>) {
  return {
    isOpen: true,
    onClose: jest.fn(),
    onApply: jest.fn(),
    onClearAll: jest.fn(),
    hasActiveFilters: false,
    activeFilterCount: 0,
    moveInDate: "",
    leaseDuration: "any",
    roomType: "any",
    amenities: [] as string[],
    houseRules: [] as string[],
    languages: [] as string[],
    genderPreference: "any",
    householdGender: "any",
    onMoveInDateChange: jest.fn(),
    onLeaseDurationChange: jest.fn(),
    onRoomTypeChange: jest.fn(),
    onToggleAmenity: jest.fn(),
    onToggleHouseRule: jest.fn(),
    onToggleLanguage: jest.fn(),
    onGenderPreferenceChange: jest.fn(),
    onHouseholdGenderChange: jest.fn(),
    languageSearch: "",
    onLanguageSearchChange: jest.fn(),
    filteredLanguages: ["en", "es", "fr"],
    minMoveInDate: "2025-01-01",
    amenityOptions: ["WiFi", "Parking", "Laundry"] as const,
    houseRuleOptions: ["No Smoking", "No Pets"] as const,
    ...overrides,
  };
}

describe("FilterModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when closed", () => {
    it("renders null when isOpen is false", () => {
      const { container } = render(<FilterModal {...makeProps({ isOpen: false })} />);
      expect(container.innerHTML).toBe("");
    });
  });

  describe("dialog attributes", () => {
    it('renders with role="dialog"', () => {
      render(<FilterModal {...makeProps()} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    });

    it('has aria-modal="true"', () => {
      render(<FilterModal {...makeProps()} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("has aria-labelledby pointing to title", () => {
      render(<FilterModal {...makeProps()} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-labelledby", "filter-drawer-title");
    });
  });

  describe("close button", () => {
    it('has aria-label="Close filters"', () => {
      render(<FilterModal {...makeProps()} />);
      const closeButton = screen.getByRole("button", {
        name: "Close filters",
      });
      expect(closeButton).toBeInTheDocument();
    });

    it("calls onClose when clicked", () => {
      const onClose = jest.fn();
      render(<FilterModal {...makeProps({ onClose })} />);

      const closeButton = screen.getByRole("button", {
        name: "Close filters",
      });
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("amenity toggles", () => {
    it("renders amenity buttons", () => {
      render(<FilterModal {...makeProps()} />);

      expect(screen.getByText("WiFi")).toBeInTheDocument();
      expect(screen.getByText("Parking")).toBeInTheDocument();
      expect(screen.getByText("Laundry")).toBeInTheDocument();
    });

    it("has aria-pressed=false for inactive amenities", () => {
      render(<FilterModal {...makeProps({ amenities: [] })} />);

      const wifiBtn = screen.getByText("WiFi").closest("button");
      expect(wifiBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("has aria-pressed=true for active amenities", () => {
      render(<FilterModal {...makeProps({ amenities: ["WiFi"] })} />);

      const wifiBtn = screen.getByText("WiFi").closest("button");
      expect(wifiBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("calls onToggleAmenity when amenity is clicked", () => {
      const onToggleAmenity = jest.fn();
      render(<FilterModal {...makeProps({ onToggleAmenity })} />);

      const wifiBtn = screen.getByText("WiFi").closest("button");
      fireEvent.click(wifiBtn!);
      expect(onToggleAmenity).toHaveBeenCalledWith("WiFi");
    });
  });

  describe("house rule toggles", () => {
    it("renders house rule buttons", () => {
      render(<FilterModal {...makeProps()} />);

      expect(screen.getByText("No Smoking")).toBeInTheDocument();
      expect(screen.getByText("No Pets")).toBeInTheDocument();
    });

    it("has aria-pressed=false for inactive house rules", () => {
      render(<FilterModal {...makeProps({ houseRules: [] })} />);

      const btn = screen.getByText("No Smoking").closest("button");
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("has aria-pressed=true for active house rules", () => {
      render(
        <FilterModal {...makeProps({ houseRules: ["No Smoking"] })} />,
      );

      const btn = screen.getByText("No Smoking").closest("button");
      expect(btn).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("apply button", () => {
    it("calls onApply when clicked", () => {
      const onApply = jest.fn();
      render(<FilterModal {...makeProps({ onApply })} />);

      const applyBtn = screen.getByTestId("filter-modal-apply");
      fireEvent.click(applyBtn);
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('shows "Show Results" by default', () => {
      render(<FilterModal {...makeProps()} />);

      const applyBtn = screen.getByTestId("filter-modal-apply");
      expect(applyBtn).toHaveTextContent("Show Results");
    });

    it("shows formattedCount when provided", () => {
      render(
        <FilterModal {...makeProps({ formattedCount: "Show 42 listings" })} />,
      );

      const applyBtn = screen.getByTestId("filter-modal-apply");
      expect(applyBtn).toHaveTextContent("Show 42 listings");
    });
  });

  describe("clear all button", () => {
    it("is visible when hasActiveFilters is true", () => {
      render(
        <FilterModal
          {...makeProps({ hasActiveFilters: true, activeFilterCount: 2 })}
        />,
      );

      const clearBtn = screen.getByTestId("filter-modal-clear-all");
      expect(clearBtn).toBeInTheDocument();
    });

    it("is not visible when hasActiveFilters is false", () => {
      render(<FilterModal {...makeProps({ hasActiveFilters: false })} />);

      expect(screen.queryByTestId("filter-modal-clear-all")).not.toBeInTheDocument();
    });

    it("calls onClearAll when clicked", () => {
      const onClearAll = jest.fn();
      render(
        <FilterModal
          {...makeProps({ hasActiveFilters: true, onClearAll })}
        />,
      );

      const clearBtn = screen.getByTestId("filter-modal-clear-all");
      fireEvent.click(clearBtn);
      expect(onClearAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("filter count badge", () => {
    it("shows filter count when activeFilterCount > 0", () => {
      render(
        <FilterModal
          {...makeProps({ activeFilterCount: 3 })}
        />,
      );

      // The count badge is inside the title
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("does not show count badge when activeFilterCount is 0", () => {
      render(<FilterModal {...makeProps({ activeFilterCount: 0 })} />);

      // Title should just be "Filters" without a count
      const title = screen.getByText("Filters");
      expect(title).toBeInTheDocument();
    });
  });

  describe("language filter", () => {
    it("renders available language buttons", () => {
      render(<FilterModal {...makeProps()} />);

      expect(screen.getByText("English")).toBeInTheDocument();
      expect(screen.getByText("Spanish")).toBeInTheDocument();
      expect(screen.getByText("French")).toBeInTheDocument();
    });

    it("calls onToggleLanguage when language button is clicked", () => {
      const onToggleLanguage = jest.fn();
      render(<FilterModal {...makeProps({ onToggleLanguage })} />);

      const langBtn = screen.getByText("English").closest("button");
      fireEvent.click(langBtn!);
      expect(onToggleLanguage).toHaveBeenCalledWith("en");
    });
  });

  describe("zero-count warning (P4)", () => {
    it("apply button has amber bg when count === 0", () => {
      render(
        <FilterModal
          {...makeProps({
            count: 0,
            isCountLoading: false,
            formattedCount: "0 listings",
            drawerSuggestions: [
              { type: "price", label: "Remove price filter", priority: 1 },
            ],
            onRemoveFilterSuggestion: jest.fn(),
          })}
        />,
      );

      const applyBtn = screen.getByTestId("filter-modal-apply");
      expect(applyBtn.className).toContain("bg-amber-500");
      expect(applyBtn.className).not.toContain("bg-indigo-500");
    });

    it("apply button keeps indigo bg when count > 0", () => {
      render(
        <FilterModal
          {...makeProps({
            count: 10,
            isCountLoading: false,
            formattedCount: "10 listings",
          })}
        />,
      );

      const applyBtn = screen.getByTestId("filter-modal-apply");
      expect(applyBtn.className).toContain("bg-indigo-500");
      expect(applyBtn.className).not.toContain("bg-amber-500");
    });

    it("renders DrawerZeroState when count === 0 with suggestions", () => {
      render(
        <FilterModal
          {...makeProps({
            count: 0,
            isCountLoading: false,
            formattedCount: "0 listings",
            drawerSuggestions: [
              { type: "price", label: "Remove price filter", priority: 1 },
            ],
            onRemoveFilterSuggestion: jest.fn(),
          })}
        />,
      );

      expect(screen.getByTestId("drawer-zero-state")).toBeInTheDocument();
      expect(screen.getByText("Remove price filter")).toBeInTheDocument();
    });

    it("does NOT render DrawerZeroState when count > 0", () => {
      render(
        <FilterModal
          {...makeProps({
            count: 5,
            isCountLoading: false,
            formattedCount: "5 listings",
          })}
        />,
      );

      expect(screen.queryByTestId("drawer-zero-state")).not.toBeInTheDocument();
    });

    it("does NOT render DrawerZeroState when loading", () => {
      render(
        <FilterModal
          {...makeProps({
            count: 0,
            isCountLoading: true,
            formattedCount: "listings",
            drawerSuggestions: [
              { type: "price", label: "Remove price filter", priority: 1 },
            ],
            onRemoveFilterSuggestion: jest.fn(),
          })}
        />,
      );

      expect(screen.queryByTestId("drawer-zero-state")).not.toBeInTheDocument();
    });
  });
});
