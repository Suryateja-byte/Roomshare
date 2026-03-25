"use client";

import { AnimatePresence, m, LazyMotion, domAnimation } from "framer-motion";
import { type ReactNode } from "react";

/**
 * ContentReveal — Smooth crossfade wrapper for skeleton → content transitions.
 *
 * Uses framer-motion AnimatePresence with mode="popLayout" so the exiting
 * skeleton and entering content animate concurrently (no sequential delay).
 *
 * Debate resolution: 200ms content entrance, 150ms skeleton exit (concurrent).
 * Skip animation entirely if content resolves before skeleton mounts
 * (AnimatePresence naturally skips for elements that were never mounted).
 *
 * @example
 * <ContentReveal>
 *   {isLoading ? <Skeleton key="skeleton" /> : <RealContent key="content" />}
 * </ContentReveal>
 */
export function ContentReveal({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="popLayout">
        <m.div
          key={typeof children === "object" && children !== null && "key" in children ? (children as { key: string }).key : "content"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.2,
            ease: [0.25, 0.1, 0.25, 1.0], // --ease-warm
          }}
        >
          {children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}
