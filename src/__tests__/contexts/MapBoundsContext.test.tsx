import { renderHook, act } from "@testing-library/react";
import { MapBoundsProvider, useMapBounds } from "@/contexts/MapBoundsContext";

const createWrapper = () => {
  return ({ children }: { children: React.ReactNode }) => (
    <MapBoundsProvider>{children}</MapBoundsProvider>
  );
};

describe("MapBoundsContext", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("programmatic move detection", () => {
    it("does not mark the map as user-moved during a programmatic move", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      act(() => {
        result.current.setProgrammaticMove(true);
        result.current.setHasUserMoved(true);
      });

      expect(result.current.hasUserMoved).toBe(false);
    });

    it("marks the map as user-moved when no programmatic move is active", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      act(() => {
        result.current.setHasUserMoved(true);
      });

      expect(result.current.hasUserMoved).toBe(true);
    });

    it("clears the programmatic flag after the safety timeout", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      act(() => {
        result.current.setProgrammaticMove(true);
      });

      expect(result.current.isProgrammaticMove).toBe(true);

      act(() => {
        jest.advanceTimersByTime(2600);
      });

      expect(result.current.isProgrammaticMove).toBe(false);
    });

    it("keeps overlapping programmatic moves active until all of them clear", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      act(() => {
        result.current.setProgrammaticMove(true);
        result.current.setProgrammaticMove(true);
      });

      expect(result.current.isProgrammaticMove).toBe(true);

      act(() => {
        result.current.setProgrammaticMove(false);
      });

      expect(result.current.isProgrammaticMove).toBe(true);

      act(() => {
        result.current.setProgrammaticMove(false);
      });

      expect(result.current.isProgrammaticMove).toBe(false);
    });

    it("does not let extra clear calls drive the counter negative", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      act(() => {
        result.current.setProgrammaticMove(false);
        result.current.setProgrammaticMove(false);
        result.current.setHasUserMoved(true);
      });

      expect(result.current.isProgrammaticMove).toBe(false);
      expect(result.current.hasUserMoved).toBe(true);
    });
  });

  describe("safe defaults outside the provider", () => {
    it("returns inert state and no-op actions", () => {
      const { result } = renderHook(() => useMapBounds());

      expect(result.current.hasUserMoved).toBe(false);
      expect(result.current.isProgrammaticMove).toBe(false);
      expect(() => result.current.setHasUserMoved(true)).not.toThrow();
      expect(() => result.current.setProgrammaticMove(true)).not.toThrow();
    });
  });
});
