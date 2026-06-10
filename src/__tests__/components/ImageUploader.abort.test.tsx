/**
 * Tests for ImageUploader unmount / AbortController safety
 *
 * Verifies that:
 *   - Unmounting during an upload aborts in-flight requests
 *   - No "setState on unmounted component" warnings occur
 *   - Object URLs are revoked on cleanup
 */

import { render, act, fireEvent, screen, waitFor } from "@testing-library/react";
import ImageUploader from "@/components/listings/ImageUploader";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Track AbortController instances
let capturedSignals: AbortSignal[] = [];

// Controllable fetch mock
let fetchResolvers: Array<{
  resolve: (value: Response) => void;
  reject: (reason: Error) => void;
}> = [];

beforeEach(() => {
  capturedSignals = [];
  fetchResolvers = [];

  // Mock fetch to capture signals and allow manual resolution
  global.fetch = jest
    .fn()
    .mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.signal) {
        capturedSignals.push(options.signal);
      }
      return new Promise<Response>((resolve, reject) => {
        fetchResolvers.push({ resolve, reject });

        // If signal is already aborted, reject immediately
        if (options?.signal?.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }

        // Listen for abort
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

  // Mock URL.createObjectURL / revokeObjectURL
  global.URL.createObjectURL = jest.fn(() => "blob:http://localhost/fake-blob");
  global.URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper: create a File object
function createTestFile(name = "test.jpg", size = 1024): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type: "image/jpeg" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImageUploader — abort / unmount safety", () => {
  it("does not delete uploaded images immediately when they are removed", async () => {
    const onImagesChange = jest.fn();
    const removedUrl =
      "https://example.supabase.co/storage/v1/object/public/images/listings/user-1/removed.jpg";
    const remainingUrl =
      "https://example.supabase.co/storage/v1/object/public/images/listings/user-1/remaining.jpg";

    render(
      <ImageUploader
        initialImages={[removedUrl, remainingUrl]}
        onImagesChange={onImagesChange}
        uploadToCloud={true}
      />
    );

    await waitFor(() => expect(onImagesChange).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button", { name: "Remove image" })[0]);

    await waitFor(() => {
      const lastImages =
        onImagesChange.mock.calls[onImagesChange.mock.calls.length - 1]?.[0];
      expect(lastImages).toHaveLength(1);
      expect(lastImages[0].uploadedUrl).toBe(remainingUrl);
    });

    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("deletes storage for a session-uploaded image when it is removed", async () => {
    const onImagesChange = jest.fn();
    const sessionUrl =
      "https://example.supabase.co/storage/v1/object/public/images/listings/user-1/session.jpg";

    render(
      <ImageUploader onImagesChange={onImagesChange} uploadToCloud={true} />
    );

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = createTestFile("session.jpg");

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Complete the upload
    await act(async () => {
      fetchResolvers[0].resolve({
        ok: true,
        json: async () => ({ url: sessionUrl }),
      } as Response);
    });

    await waitFor(() => {
      const lastImages =
        onImagesChange.mock.calls[onImagesChange.mock.calls.length - 1]?.[0];
      expect(lastImages?.[0]?.uploadedUrl).toBe(sessionUrl);
      expect(lastImages?.[0]?.isUploading).toBeFalsy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ path: "listings/user-1/session.jpg" }),
      })
    );
  });

  it("aborts in-flight uploads when component unmounts", async () => {
    const onImagesChange = jest.fn();
    const { unmount } = render(
      <ImageUploader onImagesChange={onImagesChange} uploadToCloud={true} />
    );

    // Simulate file selection via the hidden input
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = createTestFile();
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // fetch should have been called (upload started)
    expect(global.fetch).toHaveBeenCalled();

    // At least one signal should have been captured
    expect(capturedSignals.length).toBeGreaterThan(0);
    const signal = capturedSignals[0];
    expect(signal.aborted).toBe(false);

    // Unmount while upload is in-flight
    unmount();

    // The signal should now be aborted (cleanup effect fires)
    expect(signal.aborted).toBe(true);
  });

  it("revokes blob URLs on unmount", async () => {
    const onImagesChange = jest.fn();

    // Use uploadToCloud=false so images are added without fetch
    const { unmount } = render(
      <ImageUploader onImagesChange={onImagesChange} uploadToCloud={false} />
    );

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = createTestFile();

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // createObjectURL should have been called for the preview
    expect(URL.createObjectURL).toHaveBeenCalled();

    // Unmount
    unmount();

    // revokeObjectURL should be called for blob URLs during cleanup
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("does not throw when unmounting before any uploads", () => {
    const { unmount } = render(
      <ImageUploader onImagesChange={jest.fn()} uploadToCloud={true} />
    );

    // Unmount immediately — should not throw
    expect(() => unmount()).not.toThrow();
  });
});
