'use client';

import { createContext, useContext, type RefObject } from 'react';

const ScrollContainerContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useScrollContainer(): RefObject<HTMLDivElement | null> {
  const ref = useContext(ScrollContainerContext);
  if (!ref) {
    throw new Error('useScrollContainer must be used within a ScrollContainerContext provider');
  }
  return ref;
}

export { ScrollContainerContext };
