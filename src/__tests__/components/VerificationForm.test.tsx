import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerificationForm from "@/app/verify/VerificationForm";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

jest.mock("@/app/actions/verification", () => ({
  submitVerificationRequest: jest.fn(),
}));

describe("VerificationForm", () => {
  it("keeps upload inputs keyboard reachable and shows focus on dropzones", async () => {
    const user = userEvent.setup();
    const { container } = render(<VerificationForm />);

    const documentInput =
      container.querySelector<HTMLInputElement>("#document-upload");
    const selfieInput =
      container.querySelector<HTMLInputElement>("#selfie-upload");
    const documentDropzone = container.querySelector<HTMLLabelElement>(
      'label[for="document-upload"]'
    );
    const selfieDropzone = container.querySelector<HTMLLabelElement>(
      'label[for="selfie-upload"]'
    );

    expect(documentInput).toBeInTheDocument();
    expect(selfieInput).toBeInTheDocument();
    expect(documentInput).toHaveClass("peer", "sr-only");
    expect(selfieInput).toHaveClass("peer", "sr-only");
    expect(documentInput).not.toHaveClass("hidden");
    expect(selfieInput).not.toHaveClass("hidden");

    expect(documentDropzone).toHaveClass(
      "peer-focus-visible:ring-2",
      "peer-focus-visible:ring-primary/30"
    );
    expect(selfieDropzone).toHaveClass(
      "peer-focus-visible:ring-2",
      "peer-focus-visible:ring-primary/30"
    );

    expect(screen.getByLabelText(/click to upload/i)).toBe(documentInput);
    expect(screen.getByLabelText(/upload a selfie/i)).toBe(selfieInput);

    await user.tab();
    expect(screen.getByRole("button", { name: /passport/i })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("button", { name: /driver's license/i })
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /national id/i })).toHaveFocus();
    await user.tab();
    expect(documentInput).toHaveFocus();
    await user.tab();
    expect(selfieInput).toHaveFocus();
  });
});
