"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

interface NavbarVisibilityState {
  /** Whether the navbar should be hidden (e.g., during immersive scroll animation) */
  isHidden: boolean;
  /** Call to hide the navbar (used by immersive sections) */
  hide: () => void;
  /** Call to show the navbar again */
  show: () => void;
}

const NavbarVisibilityContext = createContext<NavbarVisibilityState | null>(
  null
);

export function NavbarVisibilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isHidden, setIsHidden] = useState(false);
  const hide = useCallback(() => setIsHidden(true), []);
  const show = useCallback(() => setIsHidden(false), []);
  const value = useMemo(
    () => ({ isHidden, hide, show }),
    [isHidden, hide, show]
  );

  return (
    <NavbarVisibilityContext.Provider value={value}>
      {children}
    </NavbarVisibilityContext.Provider>
  );
}

// HIGH-4 FIX: Module-level constant prevents new object on every render.
// Without this, components using useNavbarVisibility() outside the provider
// would get a new object reference each render, risking infinite loops in dep arrays.
const NAVBAR_VISIBILITY_FALLBACK: NavbarVisibilityState = {
  isHidden: false,
  hide: () => {},
  show: () => {},
};

export function useNavbarVisibility(): NavbarVisibilityState {
  const ctx = useContext(NavbarVisibilityContext);
  return ctx ?? NAVBAR_VISIBILITY_FALLBACK;
}
