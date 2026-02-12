/**
 * Neutralize MapLibre's auto-assigned role="button" on the marker wrapper.
 * Sets role="presentation", removes tabindex and aria-label so the inner
 * React-managed element is the sole interactive target.
 */
export function fixMarkerWrapperRole(innerElement: HTMLElement): void {
  const wrapper = innerElement.closest('.maplibregl-marker');
  if (!wrapper) return;
  wrapper.setAttribute('role', 'presentation');
  wrapper.removeAttribute('aria-label');
  wrapper.removeAttribute('tabindex');
}
