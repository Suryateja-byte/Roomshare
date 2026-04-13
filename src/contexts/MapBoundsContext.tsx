"use client";

/**
 * MapBoundsContext - Shared map state that still matters after removing the
 * deferred "Search this area" flow.
 *
 * The map remains the source of truth for:
 * - hasUserMoved: whether the user manually panned/zoomed
 * - isProgrammaticMove: whether the current motion is map-driven
 *
 * Active pan bounds moved to ActivePanBoundsContext and are re-exported here
 * for backward compatibility.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useSearchParams } from "next/navigation";
import { PROGRAMMATIC_MOVE_TIMEOUT_MS } from "@/lib/constants";

/** Coordinates for map bounds. Re-exported for ActivePanBoundsContext. */
export interface MapBoundsCoords {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

interface MapBoundsStateValue {
  hasUserMoved: boolean;
  isProgrammaticMove: boolean;
}

interface MapBoundsActionsValue {
  setHasUserMoved: (value: boolean) => void;
  setProgrammaticMove: (value: boolean) => void;
  isProgrammaticMoveRef: RefObject<boolean>;
}

interface MapBoundsContextValue
  extends MapBoundsStateValue,
    MapBoundsActionsValue {}

const FALLBACK_PROGRAMMATIC_REF = { current: false } as RefObject<boolean>;

const MapBoundsContext = createContext<MapBoundsContextValue | null>(null);
const MapBoundsStateContext = createContext<MapBoundsStateValue | null>(null);
const MapBoundsActionsContext = createContext<MapBoundsActionsValue | null>(
  null
);

const SSR_STATE_FALLBACK: MapBoundsStateValue = {
  hasUserMoved: false,
  isProgrammaticMove: false,
};

const SSR_ACTIONS_FALLBACK: MapBoundsActionsValue = {
  setHasUserMoved: () => {},
  setProgrammaticMove: () => {},
  isProgrammaticMoveRef: FALLBACK_PROGRAMMATIC_REF,
};

const SSR_FALLBACK: MapBoundsContextValue = {
  ...SSR_STATE_FALLBACK,
  ...SSR_ACTIONS_FALLBACK,
};

export function MapBoundsProvider({ children }: { children: ReactNode }) {
  const [hasUserMoved, setHasUserMovedState] = useState(false);
  const [isProgrammaticMove, setIsProgrammaticMoveState] = useState(false);
  const isProgrammaticMoveRef = useRef(false);
  const programmaticMoveCountRef = useRef(0);
  const programmaticMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSearchParamsRef = useRef<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const currentParams = searchParams.toString();
    if (
      prevSearchParamsRef.current !== null &&
      prevSearchParamsRef.current !== currentParams
    ) {
      setHasUserMovedState(false);
    }
    prevSearchParamsRef.current = currentParams;
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (programmaticMoveTimeoutRef.current) {
        clearTimeout(programmaticMoveTimeoutRef.current);
      }
    };
  }, []);

  const setProgrammaticMove = useCallback((value: boolean) => {
    if (value) {
      programmaticMoveCountRef.current += 1;
    } else {
      programmaticMoveCountRef.current = Math.max(
        0,
        programmaticMoveCountRef.current - 1
      );
    }

    const isActive = programmaticMoveCountRef.current > 0;
    setIsProgrammaticMoveState(isActive);
    isProgrammaticMoveRef.current = isActive;

    if (programmaticMoveTimeoutRef.current) {
      clearTimeout(programmaticMoveTimeoutRef.current);
      programmaticMoveTimeoutRef.current = null;
    }

    if (isActive) {
      programmaticMoveTimeoutRef.current = setTimeout(() => {
        programmaticMoveCountRef.current = 0;
        setIsProgrammaticMoveState(false);
        isProgrammaticMoveRef.current = false;
      }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
    }
  }, []);

  const setHasUserMoved = useCallback((value: boolean) => {
    if (!value) {
      setHasUserMovedState(false);
      return;
    }

    if (!isProgrammaticMoveRef.current) {
      setHasUserMovedState(true);
    }
  }, []);

  const stateValue = useMemo<MapBoundsStateValue>(
    () => ({
      hasUserMoved,
      isProgrammaticMove,
    }),
    [hasUserMoved, isProgrammaticMove]
  );

  const actionsValue = useMemo<MapBoundsActionsValue>(
    () => ({
      setHasUserMoved,
      setProgrammaticMove,
      isProgrammaticMoveRef,
    }),
    [setHasUserMoved, setProgrammaticMove]
  );

  const contextValue = useMemo<MapBoundsContextValue>(
    () => ({
      ...stateValue,
      ...actionsValue,
    }),
    [stateValue, actionsValue]
  );

  return (
    <MapBoundsContext.Provider value={contextValue}>
      <MapBoundsStateContext.Provider value={stateValue}>
        <MapBoundsActionsContext.Provider value={actionsValue}>
          {children}
        </MapBoundsActionsContext.Provider>
      </MapBoundsStateContext.Provider>
    </MapBoundsContext.Provider>
  );
}

export function useMapBounds(): MapBoundsContextValue {
  const context = useContext(MapBoundsContext);
  return context ?? SSR_FALLBACK;
}

export function useMapBoundsState(): MapBoundsStateValue {
  const context = useContext(MapBoundsStateContext);
  return context ?? SSR_STATE_FALLBACK;
}

export function useMapBoundsActions(): MapBoundsActionsValue {
  const context = useContext(MapBoundsActionsContext);
  return context ?? SSR_ACTIONS_FALLBACK;
}

export function useProgrammaticMove(): {
  isProgrammaticMove: boolean;
  setProgrammaticMove: (value: boolean) => void;
  isProgrammaticMoveRef: RefObject<boolean>;
} {
  const { isProgrammaticMove } = useMapBoundsState();
  const { setProgrammaticMove, isProgrammaticMoveRef } = useMapBoundsActions();
  return useMemo(
    () => ({ isProgrammaticMove, setProgrammaticMove, isProgrammaticMoveRef }),
    [isProgrammaticMove, setProgrammaticMove, isProgrammaticMoveRef]
  );
}

export { useActivePanBounds } from "./ActivePanBoundsContext";
