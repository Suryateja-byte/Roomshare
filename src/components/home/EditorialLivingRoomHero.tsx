"use client";

import { useRef, useEffect, useState, useCallback, type ReactNode } from "react";
import Image from "next/image";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
// Types & Config
// ─────────────────────────────────────────────────────────────

interface EditorialLivingRoomHeroProps {
  children: ReactNode;
}

const GLOBE_RADIUS = 2.5;
const GLOBE_SEGMENTS = 256;
const SHADOW_MAP_SIZE = 2048;
const MAX_PIXEL_RATIO = 2;
const LERP_FACTOR = 0.04;
const SECTION_HEIGHT_VH = 600;

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function hasWebGLSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function organicNoise(x: number, y: number, z: number): number {
  let n = Math.sin(x * 3) * Math.cos(y * 3) * Math.sin(z * 3);
  n += Math.sin(x * 8) * Math.cos(y * 8) * Math.sin(z * 8) * 0.2;
  n += Math.sin(x * 15) * Math.cos(y * 15) * Math.sin(z * 15) * 0.05;
  return n;
}

// ─────────────────────────────────────────────────────────────
// Scene builders (extracted for readability)
// ─────────────────────────────────────────────────────────────

function buildGlobe(): THREE.Group {
  const globeGroup = new THREE.Group();
  const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, GLOBE_SEGMENTS, GLOBE_SEGMENTS);
  const posAttr = globeGeo.getAttribute("position");
  const colors: number[] = [];
  const colorOcean = new THREE.Color("#eae8e3");
  const colorLand = new THREE.Color("#dcc1b9");

  for (let i = 0; i < posAttr.count; i++) {
    const vertex = new THREE.Vector3().fromBufferAttribute(posAttr, i);
    const norm = vertex.clone().normalize();
    const noiseVal = organicNoise(norm.x, norm.y, norm.z);

    if (noiseVal > 0.05) {
      const elevation = Math.pow((noiseVal - 0.05) * 0.5, 1.3);
      vertex.add(norm.multiplyScalar(elevation));
      const mixedColor = colorLand.clone().lerp(new THREE.Color("#cda99e"), elevation * 6);
      colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
    } else {
      colors.push(colorOcean.r, colorOcean.g, colorOcean.b);
    }
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  globeGeo.computeVertexNormals();
  globeGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const globeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
  });

  const globe = new THREE.Mesh(globeGeo, globeMat);
  globe.receiveShadow = true;
  globe.castShadow = true;
  globeGroup.add(globe);

  return globeGroup;
}

function buildHouse(globeGroup: THREE.Group): THREE.Group {
  const houseGroup = new THREE.Group();

  const matWall = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 });
  const matWood = new THREE.MeshStandardMaterial({ color: "#1b1c19", roughness: 0.8 });
  const matRoof = new THREE.MeshStandardMaterial({ color: "#9a4027", roughness: 0.8 });
  const matStone = new THREE.MeshStandardMaterial({ color: "#dcc1b9", roughness: 1.0 });
  const matGlow = new THREE.MeshBasicMaterial({ color: "#ffddaa" });
  const matTree = new THREE.MeshStandardMaterial({ color: "#904917", roughness: 1.0, flatShading: true });

  const houseWidth = 0.45;
  const houseDepth = 0.35;
  const houseHeight = 0.22;

  // Yard
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.04, 64), matStone);
  yard.rotation.x = Math.PI / 2;
  yard.position.set(0, 0, GLOBE_RADIUS);
  yard.receiveShadow = true;
  houseGroup.add(yard);

  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(houseWidth, houseDepth, houseHeight), matWall);
  base.position.set(0, 0, GLOBE_RADIUS + houseHeight / 2);
  base.castShadow = true;
  base.receiveShadow = true;
  houseGroup.add(base);

  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.32), matRoof);
  roof.rotation.x = Math.PI / 4;
  roof.position.set(0, 0, GLOBE_RADIUS + houseHeight + 0.04);
  roof.castShadow = true;
  roof.receiveShadow = true;
  houseGroup.add(roof);

  // Porch deck & awning
  const deckDepth = 0.16;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.3, deckDepth, 0.02), matWood);
  deck.position.set(0, -houseDepth / 2 - deckDepth / 2 + 0.01, GLOBE_RADIUS + 0.015);
  deck.receiveShadow = true;
  deck.castShadow = true;
  houseGroup.add(deck);

  const awning = new THREE.Mesh(new THREE.BoxGeometry(0.3, deckDepth, 0.02), matWood);
  awning.position.set(0, -houseDepth / 2 - deckDepth / 2 + 0.01, GLOBE_RADIUS + 0.16);
  awning.castShadow = true;
  awning.receiveShadow = true;
  houseGroup.add(awning);

  // Porch pillars
  const pillarGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.145, 8);
  for (const xPos of [-0.13, 0.13]) {
    const p = new THREE.Mesh(pillarGeo, matWood);
    p.rotation.x = Math.PI / 2;
    p.position.set(xPos, -houseDepth / 2 - deckDepth + 0.03, GLOBE_RADIUS + 0.0875);
    p.castShadow = true;
    houseGroup.add(p);
  }

  // Chimney
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.28), matWall);
  chim.position.set(0.14, 0.08, GLOBE_RADIUS + houseHeight + 0.12);
  chim.castShadow = true;
  houseGroup.add(chim);

  const chimCap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), matWood);
  chimCap.position.set(0.14, 0.08, GLOBE_RADIUS + houseHeight + 0.27);
  chimCap.castShadow = true;
  houseGroup.add(chimCap);

  // Door with doorknob
  const doorGroup = new THREE.Group();
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.12), matWood);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), matGlow);
  knob.position.set(0.02, -0.005, 0);
  doorGroup.add(door, knob);
  doorGroup.position.set(0, -houseDepth / 2 - 0.005, GLOBE_RADIUS + 0.06);
  houseGroup.add(doorGroup);

  // Windows
  function createWindow(x: number, y: number, z: number, rotate = false) {
    const wGroup = new THREE.Group();
    wGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.09), matWood));
    wGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.08), matGlow));
    wGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.09), matWood));
    wGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.01), matWood));
    wGroup.position.set(x, y, z);
    if (rotate) wGroup.rotation.z = Math.PI / 2;
    return wGroup;
  }

  houseGroup.add(createWindow(-0.14, -houseDepth / 2, GLOBE_RADIUS + 0.11));
  houseGroup.add(createWindow(0.14, -houseDepth / 2, GLOBE_RADIUS + 0.11));
  houseGroup.add(createWindow(-houseWidth / 2, 0, GLOBE_RADIUS + 0.11, true));

  // Stepping stones
  for (let i = 0; i < 5; i++) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16), matStone);
    step.rotation.x = Math.PI / 2;
    step.position.set(Math.sin(i * 0.8) * 0.02, -houseDepth / 2 - 0.18 - i * 0.07, GLOBE_RADIUS + 0.01);
    step.receiveShadow = true;
    houseGroup.add(step);
  }

  // Trees
  function createTree(x: number, y: number, scale: number) {
    const tGroup = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * scale, 0.02 * scale, 0.1 * scale), matWood);
    trunk.rotation.x = Math.PI / 2;
    trunk.position.set(0, 0, 0.05 * scale);
    trunk.castShadow = true;
    tGroup.add(trunk);

    const leafGeo = new THREE.SphereGeometry(0.06 * scale, 16, 16);
    const positions = [
      [0, 0, 0.12 * scale],
      [-0.04 * scale, 0.02 * scale, 0.09 * scale],
      [0.04 * scale, -0.02 * scale, 0.1 * scale],
    ] as const;

    for (const [lx, ly, lz] of positions) {
      const leaf = new THREE.Mesh(leafGeo, matTree);
      leaf.position.set(lx, ly, lz);
      leaf.castShadow = true;
      tGroup.add(leaf);
    }

    tGroup.position.set(x, y, GLOBE_RADIUS);
    return tGroup;
  }

  const treeConfigs: [number, number, number][] = [
    [0.35, 0.15, 1.4], [0.25, 0.3, 0.9], [-0.35, 0.1, 1.5],
    [-0.25, 0.35, 1.1], [0.4, -0.15, 1.2], [-0.38, -0.1, 0.8],
  ];
  for (const [x, y, s] of treeConfigs) {
    houseGroup.add(createTree(x, y, s));
  }

  globeGroup.add(houseGroup);
  return houseGroup;
}

function buildLighting(scene: THREE.Scene, houseGroup: THREE.Group): void {
  scene.add(new THREE.AmbientLight("#ffffff", 0.5));

  const dirLight = new THREE.DirectionalLight("#ffffff", 1.5);
  dirLight.position.set(4, -5, 6);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
  dirLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 15;
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight("#eae8e3", 0.6);
  fillLight.position.set(-5, 4, 3);
  scene.add(fillLight);

  const houseLight = new THREE.PointLight("#ffddaa", 0.8, 1.2);
  houseLight.position.set(0, -0.15, GLOBE_RADIUS + 0.12);
  houseGroup.add(houseLight);
}

function build3DText(
  renderer: THREE.WebGLRenderer,
  subtext: string,
  mainText: string,
  scale = 1,
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.shadowColor = "rgba(27, 28, 25, 0.08)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 6;

  ctx.font = "bold 75px Manrope, sans-serif";
  ctx.fillStyle = "#1b1c19";
  ctx.fillText(subtext.toUpperCase(), canvas.width / 2, canvas.height / 2 - 200);

  ctx.font = "300px Newsreader, serif";
  ctx.fillStyle = "#1b1c19";
  ctx.fillText(mainText, canvas.width / 2, canvas.height / 2 + 80);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });

  return new THREE.Mesh(new THREE.PlaneGeometry(4 * scale, 1 * scale), material);
}

// ─────────────────────────────────────────────────────────────
// Chrome hiding helpers
// ─────────────────────────────────────────────────────────────

function setChromeHidden(hidden: boolean): void {
  const nav = document.querySelector('nav[aria-label="Main navigation"]') as HTMLElement | null;
  if (nav) nav.dataset.animHidden = hidden ? "true" : "false";

  const bottomNav = document.querySelector('[data-testid="bottom-nav"]') as HTMLElement | null;
  if (bottomNav) bottomNav.dataset.animHidden = hidden ? "true" : "false";
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function EditorialLivingRoomHero({ children }: EditorialLivingRoomHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useScrollContainer();

  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [webglSupported] = useState(() => typeof window !== "undefined" && hasWebGLSupport());
  const shouldRender3D = !reducedMotion && webglSupported;

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    const canvasContainer = canvasRef.current;
    const section = sectionRef.current;
    const container = scrollContainerRef.current;
    if (!canvasContainer || !section || !container) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#fbf9f4", 0.04);

    const camera = new THREE.PerspectiveCamera(35, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 100);
    camera.up.set(0, 0, 1);

    // Let Three.js create its own canvas element — avoids React Strict Mode
    // double-invoke issues where getContext() returns a stale/disposed context.
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    const canvas = renderer.domElement;
    canvas.className = "absolute inset-0 w-full h-full";
    canvas.style.background = "radial-gradient(circle at center, #ffffff 0%, #fbf9f4 70%)";
    canvasContainer.appendChild(canvas);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Build scene
    const globeGroup = buildGlobe();
    scene.add(globeGroup);

    const houseGroup = buildHouse(globeGroup);
    buildLighting(scene, houseGroup);

    // Wait for fonts before generating text textures
    document.fonts.ready.then(() => {
      const startText = build3DText(renderer, "The Endless Scroll", "You can't find a room.", 1.2);
      startText.position.set(0, -5.4, 2.4);
      startText.up.set(0, 0, 1);
      startText.lookAt(new THREE.Vector3(0, -9, 4));
      scene.add(startText);
      startTextRef.current = startText;

      const endText = build3DText(renderer, "The Search is Over", "Welcome home.", 0.6);
      endText.position.set(0, 0.2, GLOBE_RADIUS + 0.8);
      endText.up.set(0, 0, 1);
      endText.lookAt(new THREE.Vector3(0, -1.8, 2.7));
      houseGroup.add(endText);
      endTextRef.current = endText;
    });

    // Camera paths
    const cameraPath = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, -9, 4),
        new THREE.Vector3(0, -5, 4.5),
        new THREE.Vector3(0, -2.5, 4.2),
        new THREE.Vector3(0, -1.8, 3.2),
        new THREE.Vector3(0, -1.8, 2.7),
      ],
      false,
      "centripetal",
      0.5,
    );

    const lookAtPath = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1.0),
        new THREE.Vector3(0, 0, 2.5),
        new THREE.Vector3(0, 0, 2.6),
        new THREE.Vector3(0, 0, 2.9),
      ],
      false,
      "centripetal",
      0.5,
    );

    // Refs for text meshes (populated after fonts load)
    const startTextRef = { current: null as THREE.Mesh | null };
    const endTextRef = { current: null as THREE.Mesh | null };

    // Animation state
    let smoothedProgress = 0;
    let chromeHidden = false;
    let firstFrameRendered = false;
    let startTime = performance.now();

    // Resize handler
    const stickyContainer = canvasContainer.parentElement;
    const resizeObserver = new ResizeObserver(() => {
      if (!stickyContainer) return;
      const w = stickyContainer.clientWidth;
      const h = stickyContainer.clientHeight;

      camera.fov = w < 600 ? 55 : w < 1024 ? 45 : 35;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);

      const textScale = w < 600 ? 0.55 : w < 1024 ? 0.8 : 1;
      if (startTextRef.current) startTextRef.current.scale.setScalar(textScale);
      if (endTextRef.current) endTextRef.current.scale.setScalar(textScale);
    });
    if (stickyContainer) resizeObserver.observe(stickyContainer);

    // RAF loop
    let rafId: number;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const time = (performance.now() - startTime) / 1000;

      // Compute scroll progress from the custom scroll container
      const sectionTop = section!.offsetTop;
      const sectionHeight = section!.offsetHeight;
      const viewportHeight = container!.clientHeight;
      const scrollTop = container!.scrollTop;

      const rawProgress = (scrollTop - sectionTop) / (sectionHeight - viewportHeight);
      const targetProgress = Math.max(0, Math.min(1, rawProgress));
      smoothedProgress += (targetProgress - smoothedProgress) * LERP_FACTOR;
      const p = Math.max(0, Math.min(1, smoothedProgress));

      // Globe rotation — "Rising Moon" reveal
      if (p < 0.45) {
        const rotP = p / 0.45;
        const ease = rotP < 0.5 ? 4 * rotP * rotP * rotP : 1 - Math.pow(-2 * rotP + 2, 3) / 2;
        globeGroup.rotation.x = -Math.PI + Math.PI * ease;
      } else {
        globeGroup.rotation.x = 0;
      }

      // Camera path
      const camPos = cameraPath.getPointAt(p);
      const lookPos = lookAtPath.getPointAt(p);
      camera.position.copy(camPos);
      camera.lookAt(lookPos);

      // Start text opacity + floating
      if (startTextRef.current) {
        const mat = startTextRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = p < 0.2 ? 1 - p / 0.2 : 0;
        if (p < 0.2) {
          startTextRef.current.position.z = 2.4 + Math.sin(time * 1.5) * 0.06;
        }
      }

      // Scene breathing
      scene.position.z = Math.sin(time * 0.8) * 0.015;

      // HTML overlay fade (15-25% progress)
      if (overlayRef.current) {
        if (p < 0.15) {
          overlayRef.current.style.opacity = "1";
          overlayRef.current.style.pointerEvents = "auto";
        } else if (p < 0.25) {
          const fadeOut = 1 - (p - 0.15) / 0.1;
          overlayRef.current.style.opacity = String(fadeOut);
          overlayRef.current.style.pointerEvents = fadeOut > 0.5 ? "auto" : "none";
        } else {
          overlayRef.current.style.opacity = "0";
          overlayRef.current.style.pointerEvents = "none";
        }
      }

      // Chrome hiding
      const shouldHide = p > 0.05 && p < 0.95;
      if (shouldHide !== chromeHidden) {
        chromeHidden = shouldHide;
        setChromeHidden(shouldHide);
      }

      renderer.render(scene, camera);

      // Fade out poster after first render
      if (!firstFrameRendered) {
        firstFrameRendered = true;
        if (posterRef.current) {
          posterRef.current.style.opacity = "0";
        }
        if (loaderRef.current) {
          loaderRef.current.style.opacity = "0";
        }
      }
    }

    animate();

    // Cleanup function
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      setChromeHidden(false);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });

      renderer.dispose();
      renderer.forceContextLoss();
      // Remove the canvas element Three.js created
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
  }, [scrollContainerRef]);

  // Mount/unmount scene
  useEffect(() => {
    if (!shouldRender3D) return;
    const cleanup = initScene();
    return cleanup;
  }, [shouldRender3D, initScene]);

  // Restore chrome on unmount (safety net)
  useEffect(() => {
    return () => setChromeHidden(false);
  }, []);

  // ─── Reduced motion / no WebGL fallback ───
  if (!shouldRender3D) {
    return (
      <section
        data-testid="immersive-hero"
        aria-label="Search for rooms"
        className="relative min-h-[60dvh] md:min-h-[70dvh] flex flex-col justify-center bg-surface-canvas"
      >
        {/* Static poster background */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/hero-poster.svg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-30"
          />
        </div>

        {/* HTML overlay — always visible in fallback */}
        <div className="relative z-10 flex flex-col items-center justify-center px-4 pt-24 pb-12 md:pt-32 md:pb-16">
          {children}
        </div>
      </section>
    );
  }

  // ─── Full 3D hero ───
  return (
    <section
      ref={sectionRef}
      data-testid="immersive-hero"
      aria-label="Search for rooms"
      style={{ height: `${SECTION_HEIGHT_VH}vh` }}
    >
      <div className="sticky top-0 h-screen-safe overflow-hidden">
        {/* Layer 1: WebGL canvas container (Three.js appends its own canvas) */}
        <div
          ref={canvasRef}
          className="absolute inset-0 z-0 w-full h-full"
        />

        {/* Layer 2: Poster (pre-render LCP, fades after first Three.js frame) */}
        <div
          ref={posterRef}
          data-testid="hero-poster"
          className="absolute inset-0 z-[5] transition-opacity duration-700"
        >
          <Image
            src="/images/hero-poster.svg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>

        {/* Layer 3: Loader (fades after first render) */}
        <div
          ref={loaderRef}
          data-testid="hero-loader"
          className="absolute inset-0 z-[15] flex items-center justify-center bg-surface-canvas transition-opacity duration-700 pointer-events-none"
        >
          <span className="font-display text-on-surface text-lg md:text-xl">
            Crafting your space...
          </span>
        </div>

        {/* Layer 4: HTML overlay (H1, search, CTA) */}
        <div
          ref={overlayRef}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 pt-24 pb-12 md:pt-32 md:pb-16 transition-opacity"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
