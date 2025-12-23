/**
 * Subscription tier utilities for RoomShare.
 * Handles Pro vs Free user feature gating.
 */

import type { SubscriptionTier } from './places/types';

/**
 * Check if user has Pro subscription.
 * @param tier - User's subscription tier from session
 * @returns true if user is a Pro subscriber
 */
export function isProUser(tier?: string | null): boolean {
  // Development override: force Pro mode for testing
  // Uses NEXT_PUBLIC_ prefix so it's available on client-side components
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_FORCE_PRO_MODE === 'true') {
    return true;
  }
  return tier === 'pro';
}

/**
 * Get the subscription tier from a string, with validation.
 * @param tier - Raw tier string
 * @returns Valid SubscriptionTier or 'free' as default
 */
export function getSubscriptionTier(tier?: string | null): SubscriptionTier {
  if (tier === 'pro') {
    return 'pro';
  }
  return 'free';
}

/**
 * Pro feature flags for Neighborhood Intelligence.
 */
export interface NeighborhoodProFeatures {
  /** Show interactive Mapbox map with POI pins */
  showInteractiveMap: boolean;
  /** Show custom place list with distances */
  showCustomPlaceList: boolean;
  /** Show per-item distance and walk time */
  showPerItemDistance: boolean;
  /** Enable list-map sync interactions */
  enableListMapSync: boolean;
  /** Show walkability rings on map */
  showWalkabilityRings: boolean;
  /** Show place details panel */
  showPlaceDetailsPanel: boolean;
}

/**
 * Get Pro features based on subscription tier.
 * @param tier - User's subscription tier
 * @returns Feature flags for Neighborhood Intelligence
 */
export function getNeighborhoodProFeatures(
  tier?: string | null
): NeighborhoodProFeatures {
  const isPro = isProUser(tier);

  return {
    showInteractiveMap: isPro,
    showCustomPlaceList: isPro,
    showPerItemDistance: isPro,
    enableListMapSync: isPro,
    showWalkabilityRings: isPro,
    showPlaceDetailsPanel: isPro,
  };
}

/**
 * Feature names for analytics and UI.
 */
export const PRO_FEATURE_NAMES = {
  interactiveMap: 'Interactive neighborhood map',
  customList: 'Detailed place list with distances',
  walkabilityRings: 'Walkability visualization',
  placeDetails: 'Expanded place details',
} as const;

/**
 * Get a list of Pro features for upgrade CTA.
 */
export function getProFeatureList(): string[] {
  return Object.values(PRO_FEATURE_NAMES);
}
