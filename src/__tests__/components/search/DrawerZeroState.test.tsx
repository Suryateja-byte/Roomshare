import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DrawerZeroState } from "@/components/search/DrawerZeroState";
import type { FilterSuggestion } from "@/lib/near-matches";

describe("DrawerZeroState", () => {
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    mockOnRemove.mockClear();
  });

  it("renders nothing when no suggestions", () => {
    const { container } = render(
      <DrawerZeroState suggestions={[]} onRemoveSuggestion={mockOnRemove} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders "No exact matches" warning text', () => {
    const suggestions: FilterSuggestion[] = [
      { type: "price", label: "Remove price filter", priority: 1 },
    ];
    render(
      <DrawerZeroState
        suggestions={suggestions}
        onRemoveSuggestion={mockOnRemove}
      />
    );
    expect(screen.getByText("No exact matches for these filters")).toBeInTheDocument();
  });

  it("renders at most 2 suggestion pills", () => {
    const suggestions: FilterSuggestion[] = [
      { type: "price", label: "Remove price filter", priority: 1 },
      { type: "date", label: "Remove date filter", priority: 2 },
      { type: "roomType", label: "Remove room type filter", priority: 3 },
    ];
    render(
      <DrawerZeroState
        suggestions={suggestions}
        onRemoveSuggestion={mockOnRemove}
      />
    );
    expect(screen.getByText("Remove price filter")).toBeInTheDocument();
    expect(screen.getByText("Remove date filter")).toBeInTheDocument();
    expect(screen.queryByText("Remove room type filter")).not.toBeInTheDocument();
  });

  it("calls onRemoveSuggestion with correct suggestion on click", () => {
    const suggestions: FilterSuggestion[] = [
      { type: "price", label: "Remove price filter", priority: 1 },
      { type: "date", label: "Remove date filter", priority: 2 },
    ];
    render(
      <DrawerZeroState
        suggestions={suggestions}
        onRemoveSuggestion={mockOnRemove}
      />
    );

    fireEvent.click(screen.getByText("Remove price filter"));
    expect(mockOnRemove).toHaveBeenCalledWith(suggestions[0]);

    fireEvent.click(screen.getByText("Remove date filter"));
    expect(mockOnRemove).toHaveBeenCalledWith(suggestions[1]);
  });
});
