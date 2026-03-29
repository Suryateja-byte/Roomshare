"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useScroll, useTransform, useMotionValueEvent, m } from "framer-motion";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const DESKTOP_FRAME_COUNT = 96;
const MOBILE_FRAME_COUNT = 64;
const MOBILE_BREAKPOINT = 768;
const DESKTOP_PATH = "/scroll-frames/frame_";
const MOBILE_PATH = "/scroll-frames/mobile/frame_";

function getFrameSrc(index: number, isMobile: boolean): string {
  const path = isMobile ? MOBILE_PATH : DESKTOP_PATH;
  const padded = String(index + 1).padStart(4, "0");
  return `${path}${padded}.webp`;
}

// ─────────────────────────────────────────────────────────────
// Hook: Preload frames with progress
// ─────────────────────────────────────────────────────────────
// rIC polyfill for Safari < 16.4
const rIC =
  typeof window !== "undefined" &&
  typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback.bind(window)
    : (cb: IdleRequestCallback, _opts?: IdleRequestOptions) =>
        setTimeout(
          () =>
            cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline),
          1
        ) as unknown as number;
const cIC =
  typeof window !== "undefined" &&
  typeof window.cancelIdleCallback === "function"
    ? window.cancelIdleCallback.bind(window)
    : (id: number) => clearTimeout(id);

function useFramePreloader(
  frameCount: number,
  isMobile: boolean,
  shouldStart: boolean
) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const framesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    if (!shouldStart) return;

    let cancelled = false;
    let idleHandle: number | undefined;
    const frames: HTMLImageElement[] = new Array(frameCount);
    const allImages: HTMLImageElement[] = []; // Track all created images for cleanup
    let loaded = 0;
    let succeeded = 0;

    // Load keyframes first (every 8th) for instant interactivity
    const keyframeIndices: number[] = [];
    const fillIndices: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      if (i % 8 === 0 || i === frameCount - 1) {
        keyframeIndices.push(i);
      } else {
        fillIndices.push(i);
      }
    }

    const loadFrame = (idx: number): Promise<void> =>
      new Promise((resolve) => {
        const img = new Image();
        allImages.push(img);
        img.onload = () => {
          if (!cancelled) {
            frames[idx] = img;
            loaded++;
            succeeded++;
            setProgress(loaded / frameCount);
          }
          resolve(); // ALWAYS resolve — prevents promise leak
        };
        img.onerror = () => {
          if (!cancelled) {
            loaded++;
            setProgress(loaded / frameCount);
          }
          resolve(); // ALWAYS resolve
        };
        img.src = getFrameSrc(idx, isMobile);
      });

    async function preload() {
      // Phase 1: keyframes (parallel, batch of 6)
      for (let i = 0; i < keyframeIndices.length; i += 6) {
        if (cancelled) return;
        await Promise.all(keyframeIndices.slice(i, i + 6).map(loadFrame));
      }
      if (cancelled) return;
      framesRef.current = frames;

      // If no keyframes loaded at all, show fallback instead of blank canvas
      if (succeeded === 0) {
        setFailed(true);
        return;
      }

      setReady(true);

      // Phase 2: fill remaining frames via requestIdleCallback to yield to main thread
      let fillIdx = 0;
      function loadNextFillBatch() {
        if (cancelled || fillIdx >= fillIndices.length) return;
        const batch = fillIndices.slice(fillIdx, fillIdx + 8);
        fillIdx += 8;
        Promise.all(batch.map(loadFrame)).then(() => {
          if (!cancelled) {
            framesRef.current = frames;
            if (fillIdx < fillIndices.length) {
              idleHandle = rIC(loadNextFillBatch, { timeout: 2000 });
            }
          }
        });
      }
      idleHandle = rIC(loadNextFillBatch, { timeout: 2000 });
    }

    preload();

    return () => {
      cancelled = true;
      if (idleHandle !== undefined) cIC(idleHandle);
      // Cancel in-flight HTTP requests — triggers onerror which calls resolve()
      for (const img of allImages) {
        img.src = "";
      }
    };
  }, [frameCount, isMobile, shouldStart]);

  return { framesRef, progress, ready, failed };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function ScrollAnimation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useScrollContainer();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth < MOBILE_BREAKPOINT
      : false
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );
  const lastFrameRef = useRef(-1);
  const [isNearViewport, setIsNearViewport] = useState(false);

  // Listen for viewport changes
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Listen for reduced-motion preference changes
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Gate preloading: only start when section is within ~1 viewport of visibility
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100% 0px 100% 0px" } // ~1 viewport above and below
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const frameCount = isMobile ? MOBILE_FRAME_COUNT : DESKTOP_FRAME_COUNT;
  const { framesRef, progress, ready, failed } = useFramePreloader(
    frameCount,
    isMobile,
    isNearViewport
  );

  // Scroll tracking — must specify container ref because the page scrolls
  // inside CustomScrollContainer (div with overflow-y: auto), not window
  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  // Map scroll progress to frame index
  // 0.15–0.85 range = animation plays when section is mostly in view
  const frameIndex = useTransform(
    scrollYProgress,
    [0.15, 0.85],
    [0, frameCount - 1]
  );

  // Text overlay opacities
  const textOpacity1 = useTransform(
    scrollYProgress,
    [0.2, 0.28, 0.38, 0.42],
    [0, 1, 1, 0]
  );
  const textOpacity2 = useTransform(
    scrollYProgress,
    [0.38, 0.45, 0.55, 0.6],
    [0, 1, 1, 0]
  );
  const textOpacity3 = useTransform(
    scrollYProgress,
    [0.55, 0.62, 0.72, 0.78],
    [0, 1, 1, 0]
  );
  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);

  // Full-bleed background: page goes dark when animation is in view (Apple technique)
  const bgOpacity = useTransform(
    scrollYProgress,
    [0.12, 0.18, 0.88, 0.95],
    [0, 1, 1, 0]
  );

  // Draw frame to canvas
  const drawFrame = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const roundedIndex = Math.round(
        Math.max(0, Math.min(frameCount - 1, index))
      );
      if (roundedIndex === lastFrameRef.current) return;
      lastFrameRef.current = roundedIndex;

      const img = framesRef.current[roundedIndex];
      if (!img) {
        // Find nearest loaded keyframe
        for (let offset = 1; offset < frameCount; offset++) {
          const before = framesRef.current[roundedIndex - offset];
          const after = framesRef.current[roundedIndex + offset];
          if (before) {
            drawImage(ctx, canvas, before);
            return;
          }
          if (after) {
            drawImage(ctx, canvas, after);
            return;
          }
        }
        return;
      }
      drawImage(ctx, canvas, img);
    },
    [frameCount, framesRef]
  );

  // Resize canvas to match container + devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      // Redraw current frame after resize
      if (lastFrameRef.current >= 0) {
        lastFrameRef.current = -1;
        drawFrame(frameIndex.get());
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawFrame, frameIndex]);

  // Listen to scroll progress: draw frames AND hide/show navbar in one callback
  const navbarHiddenRef = useRef(false);
  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    // Draw the correct frame
    if (ready) drawFrame(frameIndex.get());

    // Hide navbar when animation is in the active zone
    const shouldHide = progress > 0.1 && progress < 0.9;
    if (shouldHide !== navbarHiddenRef.current) {
      navbarHiddenRef.current = shouldHide;
      const nav = document.querySelector(
        'nav[aria-label="Main navigation"]'
      ) as HTMLElement | null;
      if (nav) nav.dataset.animHidden = shouldHide ? "true" : "false";
    }
  });

  // Ensure navbar is visible when component unmounts
  useEffect(() => {
    return () => {
      const nav = document.querySelector(
        'nav[aria-label="Main navigation"]'
      ) as HTMLElement | null;
      if (nav) nav.dataset.animHidden = "false";
    };
  }, []);

  // Draw initial frame when ready — use current scroll position (not 0)
  // to prevent a frame-0 flash if the user scrolled mid-section before frames loaded
  useEffect(() => {
    if (ready) drawFrame(frameIndex.get());
  }, [ready, drawFrame, frameIndex]);

  // Reduced motion: show static end frame
  if (reducedMotion) {
    return (
      <section
        className="relative py-24 md:py-32 bg-surface-canvas"
        aria-label="A person entering their new home"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="relative aspect-video rounded-3xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFrameSrc(frameCount - 1, isMobile)}
              alt="Person entering a welcoming home"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white text-3xl md:text-5xl font-medium tracking-tight text-center drop-shadow-lg">
                Love where you live.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Failed to load any frames: show text-only fallback
  if (failed) {
    return (
      <section
        className="relative py-24 md:py-32 bg-on-surface"
        aria-label="A person entering their new home"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-on-surface">
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white text-3xl md:text-5xl font-medium tracking-tight text-center drop-shadow-lg">
                Love where you live.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: isMobile ? "300vh" : "400vh" }}
      aria-label="Scroll animation showing a person entering their new home"
      role="region"
    >
      {/* Full-bleed dark overlay — entire viewport goes dark during animation */}
      <m.div
        style={{ opacity: bgOpacity }}
        className="fixed inset-0 bg-on-surface pointer-events-none z-0"
        aria-hidden="true"
      />

      {/* Sticky canvas container */}
      <div className="sticky top-0 h-screen-safe w-full overflow-hidden bg-on-surface">
        {/* Poster / loading state — visible before frames are ready */}
        {!ready && !failed && (
          <div className="absolute inset-0 z-20 bg-on-surface">
            {isNearViewport && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center z-10"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Loading animation frames"
              >
                <div className="relative w-16 h-16 mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-outline-variant/20" />
                  <svg
                    className="absolute inset-0 -rotate-90"
                    viewBox="0 0 64 64"
                  >
                    <circle
                      cx="32"
                      cy="32"
                      r="30"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={`${progress * 188.5} 188.5`}
                      className="text-primary transition-all duration-150"
                    />
                  </svg>
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                  Loading experience
                </p>
                <p className="text-sm font-medium text-on-surface-variant mt-2 tabular-nums">
                  {Math.round(progress * 100)}%
                </p>
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFrameSrc(0, isMobile)}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover opacity-40"
              loading="eager"
            />
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`w-full h-full block transition-opacity duration-500 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Sharp edges — no gradient blend, clean cut between sections */}

        {/* Text overlays — grid stacking so phrases overlap instead of pushing each other */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="grid px-6 max-w-3xl justify-items-center">
            <m.p
              style={{ opacity: textOpacity1 }}
              className="text-white text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] text-center [grid-area:1/1]"
            >
              Find your space.
            </m.p>
            <m.p
              style={{ opacity: textOpacity2 }}
              className="text-white text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] text-center [grid-area:1/1]"
            >
              Feel at home.
            </m.p>
            <m.p
              style={{ opacity: textOpacity3 }}
              className="text-white text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] text-center [grid-area:1/1]"
            >
              Love where you live.
            </m.p>
          </div>
        </div>

        {/* Scroll hint — fades out after scrolling begins */}
        {ready && (
          <m.div
            aria-hidden="true"
            style={{ opacity: scrollHintOpacity }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
          >
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
              Scroll to explore
            </span>
            <div className="w-5 h-8 rounded-full border border-white/20 relative">
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-primary rounded-full animate-gentle-bounce" />
            </div>
          </m.div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function drawImage(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement
) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.width / dpr;
  const ch = canvas.height / dpr;

  // object-fit: cover calculation
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = cw / ch;
  let sx = 0,
    sy = 0,
    sw = img.naturalWidth,
    sh = img.naturalHeight;

  if (imgRatio > canvasRatio) {
    // Image wider — crop sides
    sw = img.naturalHeight * canvasRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    // Image taller — crop top/bottom
    sh = img.naturalWidth / canvasRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}
