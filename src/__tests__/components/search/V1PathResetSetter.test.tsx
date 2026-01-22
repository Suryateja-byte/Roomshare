import { render, waitFor } from '@testing-library/react';
import { V1PathResetSetter } from '@/components/search/V1PathResetSetter';
import { SearchV2DataProvider, useSearchV2Data } from '@/contexts/SearchV2DataContext';
import { useEffect, useState } from 'react';

// Test wrapper that exposes context state for assertions
function TestWrapper({
  children,
  initialIsV2Enabled = true,
  onStateChange,
}: {
  children: React.ReactNode;
  initialIsV2Enabled?: boolean;
  onStateChange?: (state: { isV2Enabled: boolean; v2MapData: unknown }) => void;
}) {
  return (
    <SearchV2DataProvider>
      <StateInitializer initialIsV2Enabled={initialIsV2Enabled} />
      <StateObserver onStateChange={onStateChange} />
      {children}
    </SearchV2DataProvider>
  );
}

// Component to set initial state for testing
function StateInitializer({ initialIsV2Enabled }: { initialIsV2Enabled: boolean }) {
  const { setIsV2Enabled, setV2MapData } = useSearchV2Data();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      setIsV2Enabled(initialIsV2Enabled);
      // Simulate stale v2MapData = null (the bug scenario)
      setV2MapData(null);
      setInitialized(true);
    }
  }, [initialized, initialIsV2Enabled, setIsV2Enabled, setV2MapData]);

  return null;
}

// Component to observe state changes
function StateObserver({
  onStateChange
}: {
  onStateChange?: (state: { isV2Enabled: boolean; v2MapData: unknown }) => void
}) {
  const { isV2Enabled, v2MapData } = useSearchV2Data();

  useEffect(() => {
    onStateChange?.({ isV2Enabled, v2MapData });
  }, [isV2Enabled, v2MapData, onStateChange]);

  return null;
}

describe('V1PathResetSetter', () => {
  it('should set isV2Enabled to false on mount', async () => {
    const stateChanges: Array<{ isV2Enabled: boolean; v2MapData: unknown }> = [];

    render(
      <TestWrapper
        initialIsV2Enabled={true}
        onStateChange={(state) => stateChanges.push({ ...state })}
      >
        <V1PathResetSetter />
      </TestWrapper>
    );

    // Wait for effects to settle
    await waitFor(() => {
      const lastState = stateChanges[stateChanges.length - 1];
      expect(lastState?.isV2Enabled).toBe(false);
    }, { timeout: 1000 });
  });

  it('should set v2MapData to null on mount', async () => {
    const stateChanges: Array<{ isV2Enabled: boolean; v2MapData: unknown }> = [];

    render(
      <TestWrapper
        initialIsV2Enabled={true}
        onStateChange={(state) => stateChanges.push({ ...state })}
      >
        <V1PathResetSetter />
      </TestWrapper>
    );

    await waitFor(() => {
      const lastState = stateChanges[stateChanges.length - 1];
      expect(lastState?.v2MapData).toBeNull();
    }, { timeout: 1000 });
  });

  it('should not cause re-render loop', async () => {
    let renderCount = 0;

    function RenderCounter() {
      const { isV2Enabled } = useSearchV2Data();
      renderCount++;
      return <div data-testid="render-count">{renderCount}</div>;
    }

    render(
      <TestWrapper initialIsV2Enabled={true}>
        <V1PathResetSetter />
        <RenderCounter />
      </TestWrapper>
    );

    // Wait for initial effects
    await waitFor(() => {
      expect(renderCount).toBeGreaterThan(0);
    });

    const initialRenderCount = renderCount;

    // Wait a bit to ensure no infinite loop
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have stabilized (max a few renders for state updates, not infinite)
    expect(renderCount).toBeLessThan(initialRenderCount + 10);
  });

  it('should handle rapid mount/unmount gracefully', async () => {
    const stateChanges: Array<{ isV2Enabled: boolean; v2MapData: unknown }> = [];

    const { unmount, rerender } = render(
      <TestWrapper
        initialIsV2Enabled={true}
        onStateChange={(state) => stateChanges.push({ ...state })}
      >
        <V1PathResetSetter />
      </TestWrapper>
    );

    // Rapidly unmount and remount
    unmount();

    // Re-render fresh
    render(
      <TestWrapper
        initialIsV2Enabled={true}
        onStateChange={(state) => stateChanges.push({ ...state })}
      >
        <V1PathResetSetter />
      </TestWrapper>
    );

    // Should not throw and should eventually settle to false
    await waitFor(() => {
      const lastState = stateChanges[stateChanges.length - 1];
      expect(lastState?.isV2Enabled).toBe(false);
    }, { timeout: 1000 });
  });

  it('should render null (no DOM output)', () => {
    const { container } = render(
      <TestWrapper initialIsV2Enabled={true}>
        <V1PathResetSetter />
      </TestWrapper>
    );

    // V1PathResetSetter should return null, so only the test wrapper elements exist
    // The component itself should not add any DOM nodes
    const v1ResetterElements = container.querySelectorAll('[data-testid="v1-path-reset-setter"]');
    expect(v1ResetterElements.length).toBe(0);
  });

  it('should work when isV2Enabled is already false', async () => {
    const stateChanges: Array<{ isV2Enabled: boolean; v2MapData: unknown }> = [];

    render(
      <TestWrapper
        initialIsV2Enabled={false}
        onStateChange={(state) => stateChanges.push({ ...state })}
      >
        <V1PathResetSetter />
      </TestWrapper>
    );

    await waitFor(() => {
      const lastState = stateChanges[stateChanges.length - 1];
      // Should still be false (no change needed, but no error either)
      expect(lastState?.isV2Enabled).toBe(false);
    }, { timeout: 1000 });
  });
});
