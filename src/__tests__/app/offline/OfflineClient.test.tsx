import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import OfflineClient from "@/app/offline/OfflineClient";

describe("OfflineClient", () => {
  it("auto-retries once when the browser comes back online", () => {
    const reloadPage = jest.fn();
    render(<OfflineClient reloadPage={reloadPage} />);

    act(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });

    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it("keeps a manual retry action", () => {
    const reloadPage = jest.fn();
    render(<OfflineClient reloadPage={reloadPage} />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});
