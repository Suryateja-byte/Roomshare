"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  Bus,
  LocateFixed,
  Landmark,
  MapPin,
  MapPinOff,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Trees,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { POICategory } from "./POILayer";

interface DesktopMapControlsProps {
  activePOICategories: Set<POICategory>;
  onTogglePOICategory: (category: POICategory) => void;
  isDropMode: boolean;
  hasPin: boolean;
  onToggleDropMode: () => void;
  onClearPin: () => void;
  onHideMap: () => void;
  showResetToResults: boolean;
  onResetToResults: () => void;
  canFullscreen: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  paneWidth?: number;
  paneHeight?: number;
  portalContainer?: HTMLElement | null;
}

const controlButtonClassName =
  "relative flex h-11 w-11 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest/95 text-on-surface-variant shadow-ambient backdrop-blur-md transition-colors hover:bg-surface-container-high hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2";

const pillButtonClassName =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-lowest/95 px-4 py-2 text-sm font-medium text-on-surface shadow-ambient backdrop-blur-md transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2";

const sectionLabelClassName =
  "px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-on-surface-variant";

const dropdownBaseClassName =
  "z-[1205] w-72 overflow-y-auto rounded-[1.25rem] border border-outline-variant/20 bg-surface-container-lowest/98 p-2 text-on-surface shadow-ambient backdrop-blur-[20px] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

const MAP_TOOLS_DROPDOWN_MIN_WIDTH = 540;
const MAP_TOOLS_DROPDOWN_MIN_HEIGHT = 560;
const MAP_TOOLS_VIEWPORT_GUTTER = 12;

const POI_LABELS: Record<POICategory, string> = {
  transit: "Transit",
  landmarks: "POIs",
  parks: "Parks",
};

const POI_ICONS: Record<POICategory, ComponentType<{ className?: string }>> = {
  transit: Bus,
  landmarks: Landmark,
  parks: Trees,
};

export type MapToolsPresentationMode = "dropdown" | "sheet";

export function getMapToolsPresentationMode({
  paneWidth,
  paneHeight,
}: {
  paneWidth: number;
  paneHeight: number;
}): MapToolsPresentationMode {
  if (paneWidth <= 0 || paneHeight <= 0) {
    return "dropdown";
  }

  return paneWidth >= MAP_TOOLS_DROPDOWN_MIN_WIDTH &&
    paneHeight >= MAP_TOOLS_DROPDOWN_MIN_HEIGHT
    ? "dropdown"
    : "sheet";
}

function readHeaderHeight() {
  if (typeof window === "undefined") return 0;

  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--header-height");
  const parsedValue = Number.parseFloat(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function MapToolsRowContent({
  icon: Icon,
  label,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
}) {
  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-on-surface">{label}</span>
        {hint ? (
          <span className="block text-xs text-on-surface-variant">{hint}</span>
        ) : null}
      </span>
    </>
  );
}

function SheetSectionLabel({
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

interface MapToolsPanelContentProps {
  presentation: MapToolsPresentationMode;
  activePOICategories: Set<POICategory>;
  onTogglePOICategory: (category: POICategory) => void;
  isDropMode: boolean;
  hasPin: boolean;
  onToggleDropMode: () => void;
  onClearPin: () => void;
  onRequestClose: () => void;
}

function MapToolsPanelContent({
  presentation,
  activePOICategories,
  onTogglePOICategory,
  isDropMode,
  hasPin,
  onToggleDropMode,
  onClearPin,
  onRequestClose,
}: MapToolsPanelContentProps) {
  const pinActionLabel = isDropMode
    ? "Cancel drop pin"
    : hasPin
      ? "Move pin"
      : "Drop pin";
  const pinActionHint = isDropMode
    ? "Exit pin placement mode"
    : hasPin
      ? "Place the pin somewhere else"
      : "Add a custom reference point";

  if (presentation === "dropdown") {
    return (
      <>
        <DropdownMenuLabel className={sectionLabelClassName}>
          Layers
        </DropdownMenuLabel>
        {Object.entries(POI_LABELS).map(([id, label]) => {
          const category = id as POICategory;
          const Icon = POI_ICONS[category];
          const checked = activePOICategories.has(category);

          return (
            <DropdownMenuCheckboxItem
              key={category}
              checked={checked}
              onCheckedChange={() => onTogglePOICategory(category)}
              onSelect={(event) => event.preventDefault()}
              className="rounded-xl py-2.5 pl-9 pr-3"
              aria-label={`${checked ? "Hide" : "Show"} ${label}`}
              data-testid="poi-category"
            >
              <span className="flex items-center gap-3">
                <MapToolsRowContent icon={Icon} label={label} />
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}

        <DropdownMenuSeparator className="mx-1 my-2" />

        <DropdownMenuLabel className="px-3 pb-1 pt-1 text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">
          Map Actions
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={onToggleDropMode}
          className="gap-3 rounded-xl px-3 py-2.5"
          data-testid="map-tools-drop-pin"
        >
          <MapToolsRowContent
            icon={MapPin}
            label={pinActionLabel}
            hint={pinActionHint}
          />
        </DropdownMenuItem>

        {hasPin ? (
          <DropdownMenuItem
            onSelect={onClearPin}
            className="gap-3 rounded-xl px-3 py-2.5 text-on-surface-variant focus:text-on-surface"
            data-testid="map-tools-clear-pin"
          >
            <MapToolsRowContent
              icon={MapPinOff}
              label="Clear pin"
              hint="Remove your custom location marker"
            />
          </DropdownMenuItem>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <section aria-labelledby="map-tools-layers-heading">
        <SheetSectionLabel id="map-tools-layers-heading">
          Layers
        </SheetSectionLabel>
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
                  "flex min-h-[52px] w-full items-center gap-3 rounded-[1.125rem] px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
                  checked
                    ? "bg-primary/8 text-on-surface"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                <MapToolsRowContent icon={Icon} label={label} />
              </button>
            );
          })}
        </div>
      </section>

      <div className="mx-1 h-px bg-surface-container-high" />

      <section aria-labelledby="map-tools-actions-heading">
        <SheetSectionLabel id="map-tools-actions-heading">
          Map Actions
        </SheetSectionLabel>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              onToggleDropMode();
              onRequestClose();
            }}
            className="flex min-h-[52px] w-full items-center gap-3 rounded-[1.125rem] px-3 py-2.5 text-left text-on-surface-variant transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
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
              className="flex min-h-[52px] w-full items-center gap-3 rounded-[1.125rem] px-3 py-2.5 text-left text-on-surface-variant transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
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
    </div>
  );
}

export default function DesktopMapControls({
  activePOICategories,
  onTogglePOICategory,
  isDropMode,
  hasPin,
  onToggleDropMode,
  onClearPin,
  onHideMap,
  showResetToResults,
  onResetToResults,
  canFullscreen,
  isFullscreen,
  onToggleFullscreen,
  paneWidth = 0,
  paneHeight = 0,
  portalContainer,
}: DesktopMapControlsProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateHeaderHeight = () => {
      setHeaderHeight(readHeaderHeight());
    };

    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);

    const root = document.documentElement;
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(updateHeaderHeight);

    mutationObserver?.observe(root, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
      mutationObserver?.disconnect();
    };
  }, []);

  const presentation = getMapToolsPresentationMode({
    paneWidth,
    paneHeight,
  });
  const activeToolCount =
    activePOICategories.size + (hasPin || isDropMode ? 1 : 0);
  const toolsLabel =
    activeToolCount > 0
      ? `Map tools, ${activeToolCount} active`
      : "Map tools";
  const headerOffset = isFullscreen ? 0 : headerHeight;
  const collisionPadding = useMemo(
    () => ({
      top: headerOffset + MAP_TOOLS_VIEWPORT_GUTTER,
      right: MAP_TOOLS_VIEWPORT_GUTTER,
      bottom: MAP_TOOLS_VIEWPORT_GUTTER,
      left: MAP_TOOLS_VIEWPORT_GUTTER,
    }),
    [headerOffset]
  );
  const maxPanelHeight = `calc(100dvh - ${headerOffset}px - ${MAP_TOOLS_VIEWPORT_GUTTER * 2}px)`;

  return (
    <>
      <div className="absolute left-4 top-4 z-[50] flex flex-col gap-3">
        {showResetToResults && (
          <button
            type="button"
            onClick={onResetToResults}
            className={pillButtonClassName}
            aria-label="Show all results on map"
          >
            <LocateFixed className="h-4 w-4 text-on-surface-variant" aria-hidden />
            <span className="whitespace-nowrap">Show all results</span>
          </button>
        )}
      </div>

      <div className="absolute right-4 top-4 z-[50]">
        <button
          type="button"
          onClick={onHideMap}
          className={cn(pillButtonClassName, "min-h-[56px] px-6 text-[0.95rem] font-semibold")}
          aria-label="Hide map"
          title="Hide map"
        >
          <MapPinOff className="h-5 w-5 text-on-surface-variant" aria-hidden />
          <span className="whitespace-nowrap">Hide map</span>
        </button>
      </div>

      <div className="absolute right-4 top-20 z-[50] flex flex-col gap-2">
        {canFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={controlButtonClassName}
            aria-label={isFullscreen ? "Exit fullscreen map" : "Enter fullscreen map"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen map"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" aria-hidden />
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden />
            )}
          </button>
        )}

        {presentation === "dropdown" ? (
          <DropdownMenu modal={false} open={toolsOpen} onOpenChange={setToolsOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  controlButtonClassName,
                  activeToolCount > 0 &&
                    "border-primary/20 bg-surface-container-lowest text-on-surface"
                )}
                data-testid="map-tools-trigger"
                aria-label={toolsLabel}
                title="Map tools"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden />
                {activeToolCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-on-primary">
                    {activeToolCount}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuPortal container={portalContainer ?? undefined}>
              <DropdownMenuPrimitive.Content
                align="end"
                side="bottom"
                sideOffset={8}
                collisionPadding={collisionPadding}
                className={dropdownBaseClassName}
                style={{ maxHeight: maxPanelHeight }}
                data-testid="map-tools-dropdown"
              >
                <MapToolsPanelContent
                  presentation="dropdown"
                  activePOICategories={activePOICategories}
                  onTogglePOICategory={onTogglePOICategory}
                  isDropMode={isDropMode}
                  hasPin={hasPin}
                  onToggleDropMode={onToggleDropMode}
                  onClearPin={onClearPin}
                  onRequestClose={() => setToolsOpen(false)}
                />
              </DropdownMenuPrimitive.Content>
            </DropdownMenuPortal>
          </DropdownMenu>
        ) : (
          <DialogPrimitive.Root open={toolsOpen} onOpenChange={setToolsOpen}>
            <DialogPrimitive.Trigger asChild>
              <button
                type="button"
                className={cn(
                  controlButtonClassName,
                  activeToolCount > 0 &&
                    "border-primary/20 bg-surface-container-lowest text-on-surface"
                )}
                data-testid="map-tools-trigger"
                aria-label={toolsLabel}
                title="Map tools"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden />
                {activeToolCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-on-primary">
                    {activeToolCount}
                  </span>
                )}
              </button>
            </DialogPrimitive.Trigger>

            <DialogPrimitive.Portal container={portalContainer ?? undefined}>
              <DialogPrimitive.Overlay
                className="fixed inset-x-0 bottom-0 z-[1200] bg-on-surface/28 backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                style={{ top: `${headerOffset}px` }}
              />
              <DialogPrimitive.Content
                className="fixed right-3 z-[1205] flex w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-lowest/98 shadow-ambient-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-4 data-[state=open]:slide-in-from-right-4"
                style={{
                  top: `${headerOffset + MAP_TOOLS_VIEWPORT_GUTTER}px`,
                  maxHeight: maxPanelHeight,
                }}
                data-testid="map-tools-sheet"
              >
                <div className="flex items-start justify-between gap-4 border-b border-outline-variant/10 px-5 pb-4 pt-5">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="text-base font-semibold text-on-surface">
                      Map tools
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-sm text-on-surface-variant">
                      Layers and quick actions for the map
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                      aria-label="Close map tools"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                <div className="overflow-y-auto px-3 py-3">
                  <MapToolsPanelContent
                    presentation="sheet"
                    activePOICategories={activePOICategories}
                    onTogglePOICategory={onTogglePOICategory}
                    isDropMode={isDropMode}
                    hasPin={hasPin}
                    onToggleDropMode={onToggleDropMode}
                    onClearPin={onClearPin}
                    onRequestClose={() => setToolsOpen(false)}
                  />
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        )}
      </div>
    </>
  );
}
