import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SortSelect from "@/components/SortSelect";

jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  createPortal: (node: unknown) => node,
}));

// Mock next/navigation
const mockPush = jest.fn();
const mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock the Select components from Radix UI to render native elements
let onValueChangeFn: ((value: string) => void) | undefined;

jest.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => {
    onValueChangeFn = onValueChange;
    return (
      <div data-testid="select-root" data-value={value}>
        {children}
      </div>
    );
  },
  SelectTrigger: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <button data-testid="select-trigger" {...props}>
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
  }) => (
    <button
      data-testid={`select-item-${value}`}
      onClick={() => onValueChangeFn?.(value)}
    >
      {children}
    </button>
  ),
  SelectValue: ({
    placeholder,
    children,
  }: {
    placeholder?: string;
    children?: React.ReactNode;
  }) => <span>{children || placeholder}</span>,
}));

describe("SortSelect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.delete("sort");
    mockSearchParams.delete("page");
  });

  it("renders sort select with label", () => {
    render(<SortSelect currentSort="recommended" />);
    expect(screen.getByTestId("desktop-sort-trigger")).toHaveTextContent(
      "Recommended"
    );
  });

  it("renders all sort options", () => {
    render(<SortSelect currentSort="recommended" />);

    expect(screen.getByTestId("select-item-recommended")).toBeInTheDocument();
    expect(screen.getByTestId("select-item-price_asc")).toBeInTheDocument();
    expect(screen.getByTestId("select-item-price_desc")).toBeInTheDocument();
    expect(screen.getByTestId("select-item-newest")).toBeInTheDocument();
    expect(screen.getByTestId("select-item-rating")).toBeInTheDocument();
  });

  it("shows current sort as selected", () => {
    render(<SortSelect currentSort="price_asc" />);
    // The component renders the current label in SelectValue
    const selectRoot = screen.getByTestId("select-root");
    expect(selectRoot).toHaveAttribute("data-value", "price_asc");
    expect(screen.getByTestId("desktop-sort-trigger")).toHaveTextContent(
      "Price: Low to High"
    );
  });

  it("navigates with sort param on change", async () => {
    render(<SortSelect currentSort="recommended" />);

    await userEvent.click(screen.getByTestId("select-item-price_desc"));

    expect(mockPush).toHaveBeenCalledWith("/search?sort=price_desc");
  });

  it("removes sort param when selecting recommended", async () => {
    render(<SortSelect currentSort="price_asc" />);

    await userEvent.click(screen.getByTestId("select-item-recommended"));

    expect(mockPush).toHaveBeenCalledWith("/search");
  });

  it("removes page param when changing sort", async () => {
    mockSearchParams.set("page", "3");

    render(<SortSelect currentSort="recommended" />);

    await userEvent.click(screen.getByTestId("select-item-newest"));

    expect(mockPush).toHaveBeenCalled();
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).not.toContain("page=");
  });

  it("opens the mobile sort sheet in the modal layer", async () => {
    render(<SortSelect currentSort="recommended" />);

    const mobileTrigger = await screen.findByRole("button", {
      name: /sort: recommended/i,
    });

    await userEvent.click(mobileTrigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("z-modal");
    expect(within(dialog).getByText("Sort by")).toBeInTheDocument();
  });

  it("closes the mobile sort sheet after picking an option", async () => {
    render(<SortSelect currentSort="recommended" />);

    const mobileTrigger = await screen.findByRole("button", {
      name: /sort: recommended/i,
    });
    await userEvent.click(mobileTrigger);

    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Newest First" })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockPush).toHaveBeenCalledWith("/search?sort=newest");
  });
});
