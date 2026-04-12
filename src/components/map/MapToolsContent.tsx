"use client";

import type { ComponentType, ReactNode } from "react";
import {
  Bus,
  Landmark,
  MapPin,
  MapPinOff,
  Trees,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { POICategory } from "./POILayer";

export const POI_LABELS: Record<POICategory, string> = {
  transit: "Transit",
  landmarks: "POIs",
  parks: "Parks",
};

export const POI_ICONS: Record<POICategory, ComponentType<{ className?: string }>> =
  {
    transit: Bus,
    landmarks: Landmark,
    parks: Trees,
  };

const sectionLabelClassName =
  "px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-on-surface-variant";

const panelActionButtonClassName =
  "flex min-h-[52px] w-full items-center gap-3 rounded-[1.125rem] px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2";

export function getMapToolsActiveCount({
  activePOICategories,
  hasPin,
  isDropMode,
}: {
  activePOICategories: Set<POICategory>;
  hasPin: boolean;
  isDropMode: boolean;
}) {
  return activePOICategories.size + (hasPin || isDropMode ? 1 : 0);
}

export function getPinActionCopy({
  hasPin,
  isDropMode,
}: {
  hasPin: boolean;
  isDropMode: boolean;
}) {
  const label = isDropMode ? "Cancel drop pin" : hasPin ? "Move pin" : "Drop pin";
  const hint = isDropMode
    ? "Exit pin placement mode"
    : hasPin
      ? "Place the pin somewhere else"
      : "Add a custom reference point";

  return { label, hint };
}

export function MapToolsRowContent({
  icon: Icon,
  label,
  hint,
  trailing,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-on-surface">{label}</span>
        {hint ? (
          <span className="block text-xs text-on-surface-variant">{hint}</span>
        ) : null}
      </span>
      {trailing}
    </>
  );
}

function PanelSectionLabel({
  children,
  id,
}: {
  children: string;
  id: string;
}) {
  return (
    <p id={id} className={sectionLabelClassName}>
      {children}
    </p>
  );
}

interface MapToolsPanelSectionsProps {
  activePOICategories: Set<POICategory>;
  onTogglePOICategory: (category: POICategory) => void;
  isDropMode: boolean;
  hasPin: boolean;
  onToggleDropMode: () => void;
  onClearPin: () => void;
  onRequestClose: () => void;
  order?: "actions-first" | "layers-first";
}

export function MapToolsPanelSections({
  activePOICategories,
  onTogglePOICategory,
  isDropMode,
  hasPin,
  onToggleDropMode,
  onClearPin,
  onRequestClose,
  order = "layers-first",
}: MapToolsPanelSectionsProps) {
  const { label: pinActionLabel, hint: pinActionHint } = getPinActionCopy({
    hasPin,
    isDropMode,
  });

  const actionsSection = (
    <section aria-labelledby="map-tools-actions-heading">
      <PanelSectionLabel id="map-tools-actions-heading">Map Actions</PanelSectionLabel>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => {
            onToggleDropMode();
            onRequestClose();
          }}
          className={cn(
            panelActionButtonClassName,
            isDropMode
              ? "bg-primary/12 text-on-surface"
              : "text-on-surface-variant hover:bg-surface-container-high"
          )}
          aria-label={pinActionLabel}
          data-testid="map-tools-drop-pin"
        >
          <MapToolsRowContent
            icon={MapPin}
            label={pinActionLabel}
            hint={pinActionHint}
          />
        </button>

        {hasPin ? (
          <button
            type="button"
            onClick={() => {
              onClearPin();
              onRequestClose();
            }}
            className={cn(
              panelActionButtonClassName,
              "text-on-surface-variant hover:bg-surface-container-high"
            )}
            data-testid="map-tools-clear-pin"
          >
            <MapToolsRowContent
              icon={MapPinOff}
              label="Clear pin"
              hint="Remove your custom location marker"
            />
          </button>
        ) : null}
      </div>
    </section>
  );

  const layersSection = (
    <section aria-labelledby="map-tools-layers-heading">
      <PanelSectionLabel id="map-tools-layers-heading">Layers</PanelSectionLabel>
      <div className="space-y-1">
        {Object.entries(POI_LABELS).map(([id, label]) => {
          const category = id as POICategory;
          const Icon = POI_ICONS[category];
          const checked = activePOICategories.has(category);

          return (
            <button
              key={category}
              type="button"
              onClick={() => onTogglePOICategory(category)}
              aria-pressed={checked}
              aria-label={`${checked ? "Hide" : "Show"} ${label}`}
              data-testid="poi-category"
              className={cn(
                panelActionButtonClassName,
                checked
                  ? "bg-primary/8 text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              )}
            >
              <MapToolsRowContent
                icon={Icon}
                label={label}
                trailing={
                  <span
                    className={cn(
                      "inline-flex min-h-6 min-w-10 items-center justify-center rounded-full border px-2 text-[11px] font-semibold uppercase tracking-[0.08em]",
                      checked
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-outline-variant/20 text-on-surface-variant"
                    )}
                    aria-hidden
                  >
                    {checked ? "On" : "Off"}
                  </span>
                }
              />
            </button>
          );
        })}
      </div>
    </section>
  );

  const orderedSections =
    order === "actions-first"
      ? [actionsSection, layersSection]
      : [layersSection, actionsSection];

  return (
    <div className="space-y-2">
      {orderedSections.map((section, index) => (
        <div key={index}>
          {index > 0 ? <div className="mx-1 mb-2 h-px bg-surface-container-high" /> : null}
          {section}
        </div>
      ))}
    </div>
  );
}
