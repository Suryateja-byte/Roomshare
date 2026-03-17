'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useScroll, useTransform, useMotionValueEvent, m, LazyMotion, domAnimation } from 'framer-motion';
import { useScrollContainer } from '@/contexts/ScrollContainerContext';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const DESKTOP_FRAME_COUNT = 96;
const MOBILE_FRAME_COUNT = 64;
const MOBILE_BREAKPOINT = 768;
const DESKTOP_PATH = '/scroll-frames/frame_';
const MOBILE_PATH = '/scroll-frames/mobile/frame_';

function getFrameSrc(index: number, isMobile: boolean): string {
  const path = isMobile ? MOBILE_PATH : DESKTOP_PATH;
  const padded = String(index + 1).padStart(4, '0');
  return `${path}${padded}.webp`;
}

// ─────────────────────────────────────────────────────────────
// Hook: Preload frames with progress
// ─────────────────────────────────────────────────────────────
function useFramePreloader(frameCount: number, isMobile: boolean) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const framesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    let cancelled = false;
    const frames: HTMLImageElement[] = new Array(frameCount);
    let loaded = 0;

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
        img.onload = () => {
          if (cancelled) return;
          frames[idx] = img;
          loaded++;
          setProgress(loaded / frameCount);
          resolve();
        };
        img.onerror = () => {
          loaded++;
          setProgress(loaded / frameCount);
          resolve();
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
      setReady(true);

      // Phase 2: fill remaining frames (parallel, batch of 8)
      for (let i = 0; i < fillIndices.length; i += 8) {
        if (cancelled) return;
        await Promise.all(fillIndices.slice(i, i + 8).map(loadFrame));
      }
      if (cancelled) return;
      framesRef.current = frames;
    }

    preload();

    return () => {
      cancelled = true;
    };
  }, [frameCount, isMobile]);

  return { framesRef, progress, ready };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function ScrollAnimation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useScrollContainer();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const lastFrameRef = useRef(-1);

  // Listen for viewport changes
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const frameCount = isMobile ? MOBILE_FRAME_COUNT : DESKTOP_FRAME_COUNT;
  const { framesRef, progress, ready } = useFramePreloader(frameCount, isMobile);

  // Scroll tracking — must specify container ref because the page scrolls
  // inside CustomScrollContainer (div with overflow-y: auto), not window
  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Map scroll progress to frame index
  // 0.15–0.85 range = animation plays when section is mostly in view
  const frameIndex = useTransform(scrollYProgress, [0.15, 0.85], [0, frameCount - 1]);

  // Text overlay opacities
  const textOpacity1 = useTransform(scrollYProgress, [0.2, 0.28, 0.38, 0.42], [0, 1, 1, 0]);
  const textOpacity2 = useTransform(scrollYProgress, [0.38, 0.45, 0.55, 0.6], [0, 1, 1, 0]);
  const textOpacity3 = useTransform(scrollYProgress, [0.55, 0.62, 0.72, 0.78], [0, 1, 1, 0]);
  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);

  // Draw frame to canvas
  const drawFrame = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const roundedIndex = Math.round(Math.max(0, Math.min(frameCount - 1, index)));
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
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    // Draw the correct frame
    if (ready) drawFrame(frameIndex.get());

    // Hide navbar when animation is in the active zone
    const shouldHide = progress > 0.1 && progress < 0.9;
    if (shouldHide !== navbarHiddenRef.current) {
      navbarHiddenRef.current = shouldHide;
      const nav = document.querySelector('nav[aria-label="Main navigation"]') as HTMLElement | null;
      if (nav) nav.dataset.animHidden = shouldHide ? 'true' : 'false';
    }
  });

  // Ensure navbar is visible when component unmounts
  useEffect(() => {
    return () => {
      const nav = document.querySelector('nav[aria-label="Main navigation"]') as HTMLElement | null;
      if (nav) nav.dataset.animHidden = 'false';
    };
  }, []);

  // Draw initial frame when ready
  useEffect(() => {
    if (ready) drawFrame(0);
  }, [ready, drawFrame]);

  // Reduced motion: show static end frame
  if (reducedMotion) {
    return (
      <section
        className="relative bg-zinc-950 dark:bg-zinc-950"
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

  return (
    <LazyMotion features={domAnimation}>
      {/* The section height creates the scroll runway */}
      <section
        ref={sectionRef}
        className="relative"
        style={{ height: '400vh' }}
        aria-label="Scroll animation showing a person entering their new home"
        role="img"
      >
        {/* Sticky canvas container */}
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-zinc-950">
          {/* Loading state */}
          {!ready && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950">
              <div className="relative w-16 h-16 mb-6">
                <div
                  className="absolute inset-0 rounded-full border-2 border-zinc-800"
                />
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={`${progress * 188.5} 188.5`}
                    className="text-indigo-500 transition-all duration-150"
                  />
                </svg>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Loading experience
              </p>
              <p className="text-sm font-medium text-zinc-400 mt-2 tabular-nums">
                {Math.round(progress * 100)}%
              </p>
            </div>
          )}

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            className={`w-full h-full block transition-opacity duration-500 ${
              ready ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Edge blend — blends canvas into page background */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white dark:from-zinc-950 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white dark:from-zinc-950 to-transparent pointer-events-none z-10" />

          {/* Text overlays */}
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center px-6 max-w-3xl">
              <m.p
                style={{ opacity: textOpacity1 }}
                className="text-white text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
              >
                Find your space.
              </m.p>
              <m.p
                style={{ opacity: textOpacity2 }}
                className="text-white text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
              >
                Feel at home.
              </m.p>
              <m.p
                style={{ opacity: textOpacity3 }}
                className="text-white text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
              >
                Love where you live.
              </m.p>
            </div>
          </div>

          {/* Scroll hint — fades out after scrolling begins */}
          {ready && (
            <m.div
              style={{ opacity: scrollHintOpacity }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Scroll to explore
              </span>
              <div className="w-5 h-8 rounded-full border border-white/20 relative">
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
              </div>
            </m.div>
          )}
        </div>
      </section>
    </LazyMotion>
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
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

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
