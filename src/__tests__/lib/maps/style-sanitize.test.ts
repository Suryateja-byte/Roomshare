/**
 * Unit tests for the shared MapLibre style sanitizer.
 *
 * Behavior ported verbatim from Map.tsx (S1 pure move) — these tests pin
 * the contract both the runtime map and the build-time style generator
 * rely on.
 */

import {
  sanitizeLayerTextSizeExpression,
  sanitizeStyleSpecification,
  patchMapPrototypeAddLayer,
} from "@/lib/maps/style-sanitize";

describe("sanitizeLayerTextSizeExpression", () => {
  it("returns non-object input unchanged", () => {
    expect(sanitizeLayerTextSizeExpression(null)).toBeNull();
    expect(sanitizeLayerTextSizeExpression(undefined)).toBeUndefined();
    expect(sanitizeLayerTextSizeExpression("layer")).toBe("layer");
  });

  it("returns non-symbol layers by reference", () => {
    const layer = { id: "water", type: "fill", paint: { "fill-color": "#fff" } };
    expect(sanitizeLayerTextSizeExpression(layer)).toBe(layer);
  });

  it("returns symbol layers without an array text-size by reference", () => {
    const layer = {
      id: "labels",
      type: "symbol",
      layout: { "text-size": 14 },
    };
    expect(sanitizeLayerTextSizeExpression(layer)).toBe(layer);
  });

  it("keeps valid top-level step zoom expressions", () => {
    const layer = {
      id: "labels",
      type: "symbol",
      layout: { "text-size": ["step", ["zoom"], 10, 14, 12] },
    };
    expect(sanitizeLayerTextSizeExpression(layer)).toBe(layer);
  });

  it("keeps valid top-level interpolate zoom expressions", () => {
    const layer = {
      id: "labels",
      type: "symbol",
      layout: {
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, 16],
      },
    };
    expect(sanitizeLayerTextSizeExpression(layer)).toBe(layer);
  });

  it("keeps zoom-free expressions", () => {
    const layer = {
      id: "labels",
      type: "symbol",
      layout: { "text-size": ["coalesce", ["get", "size"], 12] },
    };
    expect(sanitizeLayerTextSizeExpression(layer)).toBe(layer);
  });

  it("replaces invalid nested zoom expressions with the numeric fallback", () => {
    const layer = {
      id: "labels",
      type: "symbol",
      layout: {
        "text-field": "{name}",
        "text-size": ["*", ["zoom"], 1.5],
      },
    };
    const result = sanitizeLayerTextSizeExpression(layer) as {
      layout: Record<string, unknown>;
    };
    expect(result).not.toBe(layer);
    expect(result.layout["text-size"]).toBe(12);
    // Other layout properties survive
    expect(result.layout["text-field"]).toBe("{name}");
    // Original is not mutated
    expect(layer.layout["text-size"]).toEqual(["*", ["zoom"], 1.5]);
  });

  it("replaces zoom nested inside a non-top-level position of step/interpolate", () => {
    const layer = {
      id: "labels",
      type: "symbol",
      layout: {
        "text-size": ["step", ["get", "rank"], 10, 5, ["+", ["zoom"], 2]],
      },
    };
    const result = sanitizeLayerTextSizeExpression(layer) as {
      layout: Record<string, unknown>;
    };
    expect(result.layout["text-size"]).toBe(12);
  });
});

describe("sanitizeStyleSpecification", () => {
  it("returns styles without a layers array by reference", () => {
    const style = { version: 8, sources: {} };
    expect(sanitizeStyleSpecification(style)).toBe(style);
    expect(sanitizeStyleSpecification(null)).toBeNull();
  });

  it("returns the same reference when no layer needs sanitizing", () => {
    const style = {
      version: 8,
      layers: [
        { id: "bg", type: "background" },
        {
          id: "labels",
          type: "symbol",
          layout: { "text-size": ["step", ["zoom"], 10, 14, 12] },
        },
      ],
    };
    expect(sanitizeStyleSpecification(style)).toBe(style);
  });

  it("returns a new style with only the offending layer replaced", () => {
    const goodLayer = { id: "bg", type: "background" };
    const badLayer = {
      id: "labels",
      type: "symbol",
      layout: { "text-size": ["*", ["zoom"], 2] },
    };
    const style = { version: 8, layers: [goodLayer, badLayer] };

    const result = sanitizeStyleSpecification(style) as {
      version: number;
      layers: Array<{ id: string; layout?: Record<string, unknown> }>;
    };

    expect(result).not.toBe(style);
    expect(result.version).toBe(8);
    expect(result.layers[0]).toBe(goodLayer);
    expect(result.layers[1]).not.toBe(badLayer);
    expect(result.layers[1].layout?.["text-size"]).toBe(12);
  });
});

describe("patchMapPrototypeAddLayer", () => {
  function makeMapInstance() {
    const addLayer = jest.fn(function (layer: unknown, _beforeId?: string) {
      return layer;
    });

    class FakeMap {
      addLayer(layer: unknown, beforeId?: string) {
        return addLayer(layer, beforeId);
      }
    }

    return { instance: new FakeMap(), addLayer, FakeMap };
  }

  it("sanitizes layers passed through the patched addLayer", () => {
    const { instance, addLayer } = makeMapInstance();
    patchMapPrototypeAddLayer(instance);

    const badLayer = {
      id: "labels",
      type: "symbol",
      layout: { "text-size": ["*", ["zoom"], 2] },
    };
    (instance as unknown as { addLayer: (l: unknown) => void }).addLayer(
      badLayer
    );

    const received = addLayer.mock.calls[0][0] as {
      layout: Record<string, unknown>;
    };
    expect(received.layout["text-size"]).toBe(12);
  });

  it("patches the prototype only once", () => {
    const { instance } = makeMapInstance();
    patchMapPrototypeAddLayer(instance);
    const patched = Object.getPrototypeOf(instance).addLayer;
    patchMapPrototypeAddLayer(instance);
    expect(Object.getPrototypeOf(instance).addLayer).toBe(patched);
  });

  it("ignores non-object input", () => {
    expect(() => patchMapPrototypeAddLayer(null)).not.toThrow();
    expect(() => patchMapPrototypeAddLayer("map")).not.toThrow();
  });
});
