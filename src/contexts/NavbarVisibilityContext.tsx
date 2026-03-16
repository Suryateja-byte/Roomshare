'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface NavbarVisibilityState {
  /** Whether the navbar should be hidden (e.g., during immersive scroll animation) */
  isHidden: boolean;
  /** Call to hide the navbar (used by immersive sections) */
  hide: () => void;
  /** Call to show the navbar again */
  show: () => void;
}

const NavbarVisibilityContext = createContext<NavbarVisibilityState | null>(null);

export function NavbarVisibilityProvider({ children }: { children: ReactNode }) {
  const [isHidden, setIsHidden] = useState(false);
  const hide = useCallback(() => setIsHidden(true), []);
  const show = useCallback(() => setIsHidden(false), []);
  const value = useMemo(() => ({ isHidden, hide, show }), [isHidden, hide, show]);

  return (
    <NavbarVisibilityContext.Provider value={value}>
      {children}
    </NavbarVisibilityContext.Provider>
  );
}

export function useNavbarVisibility(): NavbarVisibilityState {
  const ctx = useContext(NavbarVisibilityContext);
  if (!ctx) {
    // Fallback for components outside provider — navbar always visible
    return { isHidden: false, hide: () => {}, show: () => {} };
  }
  return ctx;
}
