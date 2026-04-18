import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateCollisionModal from "@/components/listings/CreateCollisionModal";
import type { CollisionSibling } from "@/lib/listings/collision-detector";

function createSibling(
  overrides: Partial<CollisionSibling> = {}
): CollisionSibling {
  return {
    id: "listing-1",
    title: "Mission Room",
    moveInDate: "2026-04-20",
    availableUntil: null,
    openSlots: 1,
    totalSlots: 2,
    createdAt: "2026-04-18T10:00:00.000Z",
    status: "ACTIVE",
    statusReason: null,
    canUpdate: true,
    ...overrides,
  };
}

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

function renderModal(siblings: CollisionSibling[] = [createSibling()]) {
  const onUpdate = jest.fn();
  const onAddDate = jest.fn();
  const onCreateSeparate = jest.fn();
  const onCancel = jest.fn();

  render(
    <CreateCollisionModal
      open={true}
      siblings={siblings}
      onUpdate={onUpdate}
      onAddDate={onAddDate}
      onCreateSeparate={onCreateSeparate}
      onCancel={onCancel}
    />
  );

  return {
    onUpdate,
    onAddDate,
    onCreateSeparate,
    onCancel,
  };
}

describe("CreateCollisionModal", () => {
  it("renders all three radio options", () => {
    renderModal();

    expect(screen.getByTestId("collision-radio-update")).toBeInTheDocument();
    expect(screen.getByTestId("collision-radio-add-date")).toBeInTheDocument();
    expect(
      screen.getByTestId("collision-radio-create-separate")
    ).toBeInTheDocument();
  });

  it("disables the update option when canUpdate is false", () => {
    renderModal([createSibling({ canUpdate: false })]);

    expect(screen.getByTestId("collision-radio-update")).toBeDisabled();
    expect(
      screen.getByText("This listing is closed to updates.")
    ).toBeInTheDocument();
  });

  it("keeps Continue disabled until a choice is selected", () => {
    renderModal();

    expect(screen.getByTestId("collision-continue")).toBeDisabled();
  });

  it("requires a reason before continuing with create-separate", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("collision-radio-create-separate"));
    const continueButton = screen.getByTestId("collision-continue");
    expect(continueButton).toBeDisabled();

    await user.type(screen.getByTestId("collision-reason-textarea"), "Too short");
    expect(continueButton).toBeDisabled();

    await user.clear(screen.getByTestId("collision-reason-textarea"));
    await user.type(
      screen.getByTestId("collision-reason-textarea"),
      "Separate entrance and lease terms."
    );

    expect(continueButton).toBeEnabled();
  });

  it("fires onUpdate when the update option is continued", async () => {
    const user = userEvent.setup();
    const sibling = createSibling();
    const { onUpdate } = renderModal([sibling]);

    await user.click(screen.getByTestId("collision-radio-update"));
    await user.click(screen.getByTestId("collision-continue"));

    expect(onUpdate).toHaveBeenCalledWith(sibling);
  });

  it("fires onAddDate when the add-date option is continued", async () => {
    const user = userEvent.setup();
    const sibling = createSibling();
    const { onAddDate } = renderModal([sibling]);

    await user.click(screen.getByTestId("collision-radio-add-date"));
    await user.click(screen.getByTestId("collision-continue"));

    expect(onAddDate).toHaveBeenCalledWith(sibling);
  });

  it("fires onCreateSeparate with the typed reason", async () => {
    const user = userEvent.setup();
    const { onCreateSeparate } = renderModal();

    await user.click(screen.getByTestId("collision-radio-create-separate"));
    await user.type(
      screen.getByTestId("collision-reason-textarea"),
      "Separate entrance and lease terms."
    );
    await user.click(screen.getByTestId("collision-continue"));

    expect(onCreateSeparate).toHaveBeenCalledWith(
      "Separate entrance and lease terms."
    );
  });

  it("fires onCancel from the Cancel button", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderModal();

    await user.click(screen.getByTestId("collision-cancel"));

    expect(onCancel).toHaveBeenCalled();
  });

  it("fires onCancel when Escape is pressed", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderModal();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
  });

  it("adjusts the body copy for singular and plural listing counts", () => {
    const { rerender } = render(
      <CreateCollisionModal
        open={true}
        siblings={[createSibling()]}
        onUpdate={jest.fn()}
        onAddDate={jest.fn()}
        onCreateSeparate={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(
      screen.getByText("You already have 1 listing at this address.")
    ).toBeInTheDocument();

    rerender(
      <CreateCollisionModal
        open={true}
        siblings={[createSibling(), createSibling({ id: "listing-2" })]}
        onUpdate={jest.fn()}
        onAddDate={jest.fn()}
        onCreateSeparate={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(
      screen.getByText("You already have 2 listings at this address.")
    ).toBeInTheDocument();
  });
});
