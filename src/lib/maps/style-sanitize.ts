/**
 * MapLibre style sanitization utilities.
 *
 * Extracted from Map.tsx so both the runtime map component and the
 * build-time style generator (scripts/generate-map-style.ts) share the
 * exact same sanitization behavior.
 */

/**
 * MapLibre requires `["zoom"]` to be used only as the input expression of
 * top-level `step`/`interpolate` for layout/paint properties.
 *
 * Some external/legacy layers can provide invalid nested zoom expressions
 * (e.g. in text-size), which throws during addLayer and breaks map rendering.
 * This sanitizer patches those cases to a safe numeric fallback.
 */
export function sanitizeLayerTextSizeExpression(layer: unknown): unknown {
  if (!layer || typeof layer !== "object") return layer;

  const candidate = layer as {
    id?: string;
    type?: string;
    layout?: Record<string, unknown>;
  };

  if (
    candidate.type !== "symbol" ||
    !candidate.layout ||
    typeof candidate.layout !== "object"
  ) {
    return layer;
  }

  const textSize = candidate.layout["text-size"];
  if (!Array.isArray(textSize)) return layer;

  const hasZoomToken = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (value[0] === "zoom") return true;
    return value.some(hasZoomToken);
  };

  const hasValidTopLevelZoomInput = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (value[0] === "step") {
      return Array.isArray(value[1]) && value[1][0] === "zoom";
    }
    if (value[0] === "interpolate") {
      return Array.isArray(value[2]) && value[2][0] === "zoom";
    }
    return false;
  };

  if (!hasZoomToken(textSize) || hasValidTopLevelZoomInput(textSize)) {
    return layer;
  }

  const sanitized = {
    ...candidate,
    layout: {
      ...candidate.layout,
      "text-size": 12,
    },
  };

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[Map] Sanitized invalid text-size zoom expression on layer:",
      candidate.id ?? "(unknown)"
    );
  }

  return sanitized;
}

export function sanitizeStyleSpecification(style: unknown): unknown {
  if (!style || typeof style !== "object") return style;

  const candidate = style as { layers?: unknown[] };
  if (!Array.isArray(candidate.layers)) return style;

  let didSanitize = false;
  const sanitizedLayers = candidate.layers.map((layer) => {
    const sanitizedLayer = sanitizeLayerTextSizeExpression(layer);
    if (sanitizedLayer !== layer) didSanitize = true;
    return sanitizedLayer;
  });

  if (!didSanitize) return style;

  return {
    ...(style as Record<string, unknown>),
    layers: sanitizedLayers,
  };
}

/**
 * Patch the Map prototype's addLayer to sanitize zoom expressions.
 * Uses the map instance's actual constructor prototype to ensure we
 * patch the correct class (pnpm/Turbopack may resolve different copies).
 */
export function patchMapPrototypeAddLayer(mapInstance: unknown): void {
  if (!mapInstance || typeof mapInstance !== "object") return;

  const proto = Object.getPrototypeOf(mapInstance) as {
    addLayer?: (layer: unknown, beforeId?: string) => unknown;
    __roomsharePatchedAddLayer?: boolean;
  } | null;

  if (
    !proto ||
    proto.__roomsharePatchedAddLayer ||
    typeof proto.addLayer !== "function"
  ) {
    return;
  }

  const originalAddLayer = proto.addLayer;
  proto.addLayer = function (layer: unknown, beforeId?: string) {
    const safeLayer = sanitizeLayerTextSizeExpression(layer);
    return originalAddLayer.call(this, safeLayer, beforeId);
  };
  proto.__roomsharePatchedAddLayer = true;
}
