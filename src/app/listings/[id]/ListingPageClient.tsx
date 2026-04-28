"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  ShieldCheck,
  Maximize2,
  Bed,
  ChevronRight,
  Star,
  Zap,
  Pencil,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { PUBLIC_CACHE_INVALIDATED_EVENT } from "@/lib/public-cache/client";
import { getAmenityIcon } from "@/lib/amenityIcons";
import { getLanguageName } from "@/lib/languages";
import { formatPrice } from "@/lib/format";
import ListingCard from "@/components/listings/ListingCard";
import type { Listing } from "@/components/listings/ListingCard";

// Import existing functional components
import ImageGallery from "@/components/ImageGallery";
import ReviewForm from "@/components/ReviewForm";
import ReviewList from "@/components/ReviewList";
import ContactHostButton from "@/components/ContactHostButton";
import DeleteListingButton from "@/components/DeleteListingButton";
import PrivateFeedbackDialog from "@/components/PrivateFeedbackDialog";
import ReportButton from "@/components/ReportButton";
import ShareListingButton from "@/components/ShareListingButton";
import SaveListingButton from "@/components/SaveListingButton";
import ListingStatusToggle from "@/components/ListingStatusToggle";
import ListingFreshnessCheck from "@/components/ListingFreshnessCheck";
import UserAvatar from "@/components/UserAvatar";
import RoomPlaceholder from "@/components/listings/RoomPlaceholder";
import { SlotBadge } from "@/components/listings/SlotBadge";
import { Badge } from "@/components/ui/badge";
import type { AvailabilitySnapshot } from "@/lib/availability";
import { useSession } from "next-auth/react";
import {
  coerceViewerContactFields,
  type ContactDisabledReason,
  type PrimaryCta,
  type ViewerContactFields,
} from "@/lib/listings/public-contact-contract";
import type { PublicAvailabilitySource as AvailabilitySource } from "@/lib/search/public-availability";
import ListingViewTracker from "./ListingViewTracker";

// Lazy-load NearbyPlacesSection (MapLibre GL + Radar) to avoid loading ~150KB+ on initial page load
const NearbyPlacesSection = dynamic(
  () => import("@/components/nearby/NearbyPlacesSection"),
  {
    ssr: false,
    loading: () => (
      <div className="mt-8 pt-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-surface-container-high rounded-lg w-40" />
          <div className="h-[400px] bg-surface-canvas rounded-lg" />
        </div>
      </div>
    ),
  }
);

// Types
interface Review {
  id: string;
  rating: number;
  comment: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  response?: {
    id: string;
    content: string;
  } | null;
}

interface ListingPageClientProps {
  listing: {
    id: string;
    title: string;
    description: string;
    price: number;
    images: string[];
    amenities: string[];
    householdLanguages: string[];
    totalSlots: number;
    availableSlots: number;
    version: number;
    availabilitySource: AvailabilitySource;
    bookingMode: string;
    status: string;
    statusReason?: string | null;
    viewCount: number;
    genderPreference: string | null;
    householdGender: string | null;
    location: {
      city: string;
      state: string;
    } | null;
    owner: {
      id: string;
      name: string | null;
      image: string | null;
      bio: string | null;
      isVerified: boolean;
      createdAt: Date;
    };
    ownerId: string;
  };
  reviews: Review[];
  isOwner: boolean;
  isLoggedIn: boolean;
  userHasBooking: boolean;
  userExistingReview: {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
  } | null;
  holdEnabled?: boolean;
  coordinates: { lat: number; lng: number } | null;
  nearbyCoordinates?: { lat: number; lng: number } | null;
  canViewExactLocation?: boolean;
  similarListings?: Listing[];
  viewToken?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    initialAvailability?: AvailabilitySnapshot | null;
    contactFirstEnabled?: boolean;
    moderationWriteLocksEnabled?: boolean;
    publicCacheMetadata?: {
      unitCacheKey: string;
      unitIdentityEpoch: number;
      projectionEpoch: string;
    } | null;
  }

type ReviewEligibilityReason =
  | "LOGIN_REQUIRED"
  | "ELIGIBLE"
  | "ALREADY_REVIEWED"
  | "ACCEPTED_BOOKING_REQUIRED";

interface PaywallOffer {
  productCode: "CONTACT_PACK_3" | "MOVERS_PASS_30D";
  label: string;
  priceDisplay: string;
  description: string;
}

interface PaywallSummary {
  enabled: boolean;
  mode:
    | "OPEN"
    | "METERED"
    | "PASS_ACTIVE"
    | "PAYWALL_REQUIRED"
    | "MIGRATION_BYPASS";
  freeContactsRemaining: number;
  packContactsRemaining: number;
  activePassExpiresAt: string | null;
  requiresPurchase: boolean;
  offers: PaywallOffer[];
}

interface ReviewEligibility {
  canPublicReview: boolean;
  hasLegacyAcceptedBooking: boolean;
  canLeavePrivateFeedback: boolean;
  reason: ReviewEligibilityReason;
}

interface ViewerState {
  isLoggedIn: boolean;
  hasBookingHistory: boolean;
  existingReview: ListingPageClientProps["userExistingReview"];
  primaryCta: PrimaryCta;
  canContact: boolean;
  contactDisabledReason: ContactDisabledReason | null;
  availabilitySource: AvailabilitySource;
  paywallSummary: PaywallSummary | null;
  reviewEligibility: ReviewEligibility;
  loaded: boolean;
}

interface CheckoutReturnNotice {
  tone: "info" | "success" | "error";
  message: string;
}

interface CheckoutSessionStatusPayload {
  sessionId: string;
  listingId: string;
  productCode: "CONTACT_PACK_3" | "MOVERS_PASS_30D";
  checkoutStatus: "OPEN" | "COMPLETE" | "EXPIRED";
  paymentStatus: "PAID" | "UNPAID";
  fulfillmentStatus: "PENDING" | "FULFILLED" | "FAILED" | "CANCELED";
  requiresViewerStateRefresh: boolean;
}

type CheckoutReturnPhase = "IDLE" | "POLLING" | "PENDING_TIMEOUT";

function removeCheckoutQueryParams(searchParamsString: string) {
  const nextSearchParams = new URLSearchParams(searchParamsString);
  nextSearchParams.delete("contactCheckout");
  nextSearchParams.delete("phoneRevealCheckout");
  nextSearchParams.delete("session_id");
  return nextSearchParams.toString();
}

function buildFallbackReviewEligibility(options: {
  isLoggedIn: boolean;
  hasBookingHistory: boolean;
  hasExistingReview: boolean;
}): ReviewEligibility {
  let reason: ReviewEligibilityReason = "LOGIN_REQUIRED";

  if (options.isLoggedIn) {
    if (options.hasExistingReview) {
      reason = "ALREADY_REVIEWED";
    } else if (options.hasBookingHistory) {
      reason = "ELIGIBLE";
    } else {
      reason = "ACCEPTED_BOOKING_REQUIRED";
    }
  }

  return {
    canPublicReview:
      options.isLoggedIn &&
      options.hasBookingHistory &&
      !options.hasExistingReview,
    hasLegacyAcceptedBooking: options.hasBookingHistory,
    canLeavePrivateFeedback: false,
    reason,
  };
}

function buildFallbackViewerState(options: {
  isLoggedIn: boolean;
  isOwner: boolean;
  isEmailVerified: boolean;
  isListingActive: boolean;
  hasBookingHistory: boolean;
  existingReview: ListingPageClientProps["userExistingReview"];
  availabilitySource: AvailabilitySource;
}): ViewerState {
  const contactFields: ViewerContactFields = {
    primaryCta: options.isOwner
      ? "EDIT_LISTING"
      : !options.isLoggedIn
        ? "LOGIN_TO_MESSAGE"
        : !options.isEmailVerified
          ? "VERIFY_EMAIL_TO_MESSAGE"
          : "CONTACT_HOST",
    canContact:
      !options.isOwner &&
      options.isLoggedIn &&
      options.isEmailVerified &&
      options.isListingActive,
    contactDisabledReason: options.isOwner
      ? "OWNER_VIEW"
      : !options.isLoggedIn
        ? "LOGIN_REQUIRED"
        : !options.isEmailVerified
          ? "EMAIL_VERIFICATION_REQUIRED"
          : options.isListingActive
            ? null
            : "LISTING_UNAVAILABLE",
    availabilitySource: options.availabilitySource,
  };

  return {
    isLoggedIn: options.isLoggedIn,
    hasBookingHistory: options.hasBookingHistory,
    existingReview: options.existingReview,
    ...contactFields,
    paywallSummary: null,
    reviewEligibility: buildFallbackReviewEligibility({
      isLoggedIn: options.isLoggedIn,
      hasBookingHistory: options.hasBookingHistory,
      hasExistingReview: !!options.existingReview,
    }),
    loaded: true,
  };
}

function mergeViewerState(
  fallbackState: ViewerState,
  data: Partial<Omit<ViewerState, "loaded">>
): ViewerState {
  const contactFields = coerceViewerContactFields(
    {
      primaryCta: fallbackState.primaryCta,
      canContact: fallbackState.canContact,
      contactDisabledReason: fallbackState.contactDisabledReason,
      availabilitySource: fallbackState.availabilitySource,
    },
    {
      primaryCta: data.primaryCta,
      canContact: data.canContact,
      contactDisabledReason: data.contactDisabledReason,
      availabilitySource: data.availabilitySource,
    }
  );

  const reviewEligibility =
    data.reviewEligibility &&
    typeof data.reviewEligibility === "object" &&
    typeof data.reviewEligibility.canPublicReview === "boolean" &&
    typeof data.reviewEligibility.hasLegacyAcceptedBooking === "boolean" &&
    typeof data.reviewEligibility.canLeavePrivateFeedback === "boolean"
      ? (data.reviewEligibility as ReviewEligibility)
      : fallbackState.reviewEligibility;
  const paywallSummary =
    data.paywallSummary &&
    typeof data.paywallSummary === "object" &&
    Array.isArray(data.paywallSummary.offers) &&
    typeof data.paywallSummary.requiresPurchase === "boolean"
      ? (data.paywallSummary as PaywallSummary)
      : fallbackState.paywallSummary;

  return {
    ...fallbackState,
    isLoggedIn:
      typeof data.isLoggedIn === "boolean"
        ? data.isLoggedIn
        : fallbackState.isLoggedIn,
    hasBookingHistory:
      typeof data.hasBookingHistory === "boolean"
        ? data.hasBookingHistory
        : fallbackState.hasBookingHistory,
    existingReview:
      data.existingReview === null || data.existingReview
        ? data.existingReview
        : fallbackState.existingReview,
    ...contactFields,
    paywallSummary,
    reviewEligibility,
    loaded: true,
  };
}

// Status badge with pulse animation
function StatusBadge({ status }: { status: string }) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const config = {
    ACTIVE: {
      bg: "bg-green-50",
      border: "border-green-100",
      text: "text-green-700",
      dot: "bg-green-600",
      label: "Active Listing",
    },
    PAUSED: {
      bg: "bg-yellow-50",
      border: "border-yellow-100",
      text: "text-yellow-700",
      dot: "bg-yellow-600",
      label: "Paused",
    },
    RENTED: {
      bg: "bg-blue-50",
      border: "border-outline-variant/20",
      text: "text-blue-700",
      dot: "bg-blue-600",
      label: "Rented",
    },
  }[status] || {
    bg: "bg-surface-canvas",
    border: "border-outline-variant/20",
    text: "text-on-surface-variant",
    dot: "bg-on-surface-variant",
    label: status,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border",
        config.bg,
        config.border,
        config.text
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.dot)}
      />
      {hasMounted ? config.label : null}
    </div>
  );
}

// Simple info stat item for the stats bar
function InfoStat({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center text-on-surface-variant font-medium text-sm">
      <Icon className="w-4 h-4 mr-2 text-on-surface-variant" />
      {children}
    </div>
  );
}

// Stat card for management sidebar
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-surface-canvas p-3 rounded-xl border border-outline-variant/20 text-center">
      <span className="block text-2xl font-bold text-on-surface">{value}</span>
      <span className="text-xs text-on-surface-variant font-medium">
        {label}
      </span>
    </div>
  );
}

function ContactFirstSidebarCard({
  listingId,
  unitIdentityEpochObserved,
  price,
  status,
  bookingMode,
  effectiveAvailableSlots,
  primaryCta,
  canContact,
  contactDisabledReason,
  paywallSummary,
  ctaDisabled,
  ctaDisabledLabel,
}: {
  listingId: string;
  unitIdentityEpochObserved?: number | null;
  price: number;
  status: string;
  bookingMode: string;
  effectiveAvailableSlots: number;
  primaryCta: PrimaryCta;
  canContact: boolean;
  contactDisabledReason: ContactDisabledReason | null;
  paywallSummary: PaywallSummary | null;
  ctaDisabled: boolean;
  ctaDisabledLabel: string;
}) {
  const isWholeUnit = bookingMode === "WHOLE_UNIT";
  const availabilityLabel =
    status !== "ACTIVE"
      ? status === "PAUSED"
        ? "Temporarily unavailable"
        : "Currently unavailable"
      : isWholeUnit
        ? effectiveAvailableSlots > 0
          ? "Whole unit available"
          : "Whole unit unavailable"
        : `${effectiveAvailableSlots} slot${effectiveAvailableSlots === 1 ? "" : "s"} available`;

  return (
    <div className="bg-surface-container-lowest rounded-3xl shadow-ambient-lg p-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <span className="text-3xl font-bold text-on-surface">${price}</span>
          <span className="text-on-surface-variant"> / month</span>
        </div>
      </div>

      <div
        className="mb-4 rounded-xl border border-outline-variant/20 bg-surface-canvas px-4 py-3"
        data-testid="availability-badge"
      >
        <p className="text-sm font-semibold text-on-surface">
          {availabilityLabel}
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-canvas p-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-on-surface">
            Contact host to confirm availability
          </h3>
          <p className="text-sm text-on-surface-variant">
            This listing is contact-first. Use messaging to confirm dates,
            availability, and next steps with the host.
          </p>
        </div>

        <div
          data-testid="contact-host-sidebar"
          className="[&>button]:bg-transparent [&>button]:border [&>button]:border-outline-variant/30 [&>button]:text-on-surface [&>button]:hover:bg-surface-container-high [&>button]:shadow-none"
        >
          <MessagingCta
            listingId={listingId}
            unitIdentityEpochObserved={unitIdentityEpochObserved}
            primaryCta={primaryCta}
            canContact={canContact}
            contactDisabledReason={contactDisabledReason}
            paywallSummary={paywallSummary}
            disabled={ctaDisabled}
            disabledLabel={ctaDisabledLabel}
          />
        </div>

        <p className="text-xs text-on-surface-variant">
          No booking request or hold is created from this page.
        </p>
      </div>
    </div>
  );
}

function MessagingCta({
  listingId,
  unitIdentityEpochObserved,
  primaryCta,
  canContact,
  contactDisabledReason,
  paywallSummary,
  disabled = false,
  disabledLabel,
  className,
}: {
  listingId: string;
  unitIdentityEpochObserved?: number | null;
  primaryCta: PrimaryCta;
  canContact: boolean;
  contactDisabledReason: ContactDisabledReason | null;
  paywallSummary: PaywallSummary | null;
  disabled?: boolean;
  disabledLabel?: string;
  className?: string;
}) {
  const requiresUnlock =
    contactDisabledReason === "PAYWALL_REQUIRED" &&
    !!paywallSummary?.requiresPurchase;

  if (primaryCta === "CONTACT_HOST" && (canContact || requiresUnlock)) {
    return (
      <ContactHostButton
        listingId={listingId}
        unitIdentityEpochObserved={unitIdentityEpochObserved}
        paywallSummary={paywallSummary}
        requiresUnlock={requiresUnlock}
        disabled={disabled}
        disabledLabel={disabledLabel}
        className={className}
      />
    );
  }

  if (primaryCta === "LOGIN_TO_MESSAGE") {
    return (
      <Link
        href="/login"
        className={cn(
          "inline-flex h-11 w-full items-center justify-center rounded-xl border border-outline-variant/30 bg-transparent px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high",
          className
        )}
      >
        Sign in to contact host
      </Link>
    );
  }

  if (primaryCta === "VERIFY_EMAIL_TO_MESSAGE") {
    return (
      <Link
        href="/verify-email"
        className={cn(
          "inline-flex h-11 w-full items-center justify-center rounded-xl border border-outline-variant/30 bg-transparent px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high",
          className
        )}
      >
        Verify email to contact host
      </Link>
    );
  }

  return null;
}

export default function ListingPageClient({
  listing,
  reviews,
  isOwner,
  isLoggedIn,
  userHasBooking,
  userExistingReview,
  nearbyCoordinates,
  similarListings,
  viewToken,
  initialAvailability,
  moderationWriteLocksEnabled = false,
  publicCacheMetadata = null,
}: ListingPageClientProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const contactCheckoutParam = searchParams.get("contactCheckout");
  const phoneRevealCheckoutParam = searchParams.get("phoneRevealCheckout");
  const checkoutSessionIdParam = searchParams.get("session_id");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [privateFeedbackOpen, setPrivateFeedbackOpen] = useState(false);
  const [checkoutNotice, setCheckoutNotice] =
    useState<CheckoutReturnNotice | null>(null);
  const [checkoutReturnPhase, setCheckoutReturnPhase] =
    useState<CheckoutReturnPhase>("IDLE");
  const [viewerStateRefreshNonce, setViewerStateRefreshNonce] = useState(0);
  const hasImages = listing.images && listing.images.length > 0;
  const resolvedUserId = session?.user?.id ?? null;
  const resolvedIsOwner = isOwner || resolvedUserId === listing.ownerId;
  const resolvedIsLoggedIn = isLoggedIn || sessionStatus === "authenticated";
  const resolvedIsEmailVerified =
    sessionStatus === "authenticated"
      ? !!session?.user?.emailVerified
      : resolvedIsLoggedIn;
  const viewerReady = isOwner || sessionStatus !== "loading";
  const canRenderGuestControls = viewerReady && !resolvedIsOwner;
  const [viewerState, setViewerState] = useState<ViewerState>(
    buildFallbackViewerState({
      isLoggedIn: resolvedIsLoggedIn,
      isOwner: resolvedIsOwner,
      isEmailVerified: resolvedIsEmailVerified,
      isListingActive: listing.status === "ACTIVE",
      hasBookingHistory: userHasBooking,
      existingReview: userExistingReview,
      availabilitySource: listing.availabilitySource,
    })
  );
  const effectiveAvailableSlots =
    initialAvailability?.effectiveAvailableSlots ??
    listing.availableSlots;
  const checkoutCtaDisabled = checkoutReturnPhase !== "IDLE";
  const checkoutCtaDisabledLabel =
    checkoutReturnPhase === "PENDING_TIMEOUT"
      ? "Unlock Pending"
      : "Finalizing Purchase...";

  // Format gender preference for display
  const formatGenderPreference = (pref: string | null) => {
    if (!pref) return null;
    switch (pref) {
      case "MALE_ONLY":
        return "Male Identifying Only";
      case "FEMALE_ONLY":
        return "Female Identifying Only";
      case "NO_PREFERENCE":
        return "Any Gender / All Welcome";
      default:
        return pref;
    }
  };

  // Format household gender for display
  const formatHouseholdGender = (gender: string | null) => {
    if (!gender) return null;
    switch (gender) {
      case "ALL_MALE":
        return "All Male";
      case "ALL_FEMALE":
        return "All Female";
      case "MIXED":
        return "Mixed (Co-ed)";
      default:
        return gender;
    }
  };

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (
      !publicCacheMetadata ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const message = {
      type: "PUBLIC_CACHE_FLOOR",
      payload: {
        unitCacheKey: publicCacheMetadata.unitCacheKey,
        unitIdentityEpoch: publicCacheMetadata.unitIdentityEpoch,
        projectionEpochFloor: publicCacheMetadata.projectionEpoch,
      },
    };

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
      return;
    }

    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage(message);
    });
  }, [publicCacheMetadata]);

  useEffect(() => {
    if (!canRenderGuestControls) {
      return;
    }

    const purchaseContext = phoneRevealCheckoutParam
      ? "PHONE_REVEAL"
      : "CONTACT_HOST";
    const contactCheckout = phoneRevealCheckoutParam ?? contactCheckoutParam;
    const checkoutSessionId = checkoutSessionIdParam;
    if (!contactCheckout) {
      return;
    }

    const replaceWithoutCheckoutParams = () => {
      const cleanedQuery = removeCheckoutQueryParams(searchParamsString);
      router.replace(cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname, {
        scroll: false,
      });
    };

    if (contactCheckout === "cancelled") {
      setCheckoutReturnPhase("IDLE");
      setCheckoutNotice({
        tone: "info",
        message:
          purchaseContext === "PHONE_REVEAL"
            ? "Checkout cancelled. You can reveal the phone anytime."
            : "Checkout cancelled. You can unlock contact anytime.",
      });
      replaceWithoutCheckoutParams();
      return;
    }

    if (contactCheckout !== "success") {
      return;
    }

    if (!checkoutSessionId) {
      setCheckoutReturnPhase("IDLE");
      setCheckoutNotice({
        tone: "error",
        message: "We couldn’t verify this checkout session.",
      });
      replaceWithoutCheckoutParams();
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const controller = new AbortController();

    const pollCheckoutSession = async () => {
      if (cancelled) {
        return;
      }

      setCheckoutReturnPhase("POLLING");
      setCheckoutNotice({
        tone: "info",
        message: "Finalizing purchase...",
      });

      try {
        const response = await fetch(
          `/api/payments/checkout-session?session_id=${encodeURIComponent(checkoutSessionId)}&listing_id=${encodeURIComponent(listing.id)}&context=${purchaseContext}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          setCheckoutReturnPhase("IDLE");
          setCheckoutNotice({
            tone: "error",
            message: "Sign in again to finish unlocking contact.",
          });
          replaceWithoutCheckoutParams();
          return;
        }

        if (response.status === 404) {
          setCheckoutReturnPhase("IDLE");
          setCheckoutNotice({
            tone: "error",
            message: "We couldn’t verify this checkout session.",
          });
          replaceWithoutCheckoutParams();
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load checkout session status");
        }

        const payload = (await response.json()) as CheckoutSessionStatusPayload;

        switch (payload.fulfillmentStatus) {
          case "FULFILLED":
            if (purchaseContext === "CONTACT_HOST") {
              setViewerState((current) => ({
                ...current,
                canContact: true,
                contactDisabledReason: null,
                paywallSummary: current.paywallSummary
                  ? {
                      ...current.paywallSummary,
                      mode:
                        current.paywallSummary.mode === "PAYWALL_REQUIRED"
                          ? "METERED"
                          : current.paywallSummary.mode,
                      requiresPurchase: false,
                    }
                  : current.paywallSummary,
              }));
            }
            if (
              payload.requiresViewerStateRefresh ||
              purchaseContext === "PHONE_REVEAL"
            ) {
              setViewerStateRefreshNonce((value) => value + 1);
            }
            setCheckoutReturnPhase("IDLE");
            setCheckoutNotice({
              tone: "success",
              message:
                purchaseContext === "PHONE_REVEAL"
                  ? "Phone reveal unlocked. Try revealing the host phone again."
                  : "Contact unlocked. You can message the host now.",
            });
            replaceWithoutCheckoutParams();
            return;
          case "FAILED":
            setCheckoutReturnPhase("IDLE");
            setCheckoutNotice({
              tone: "error",
              message: "Payment failed. Try checkout again.",
            });
            replaceWithoutCheckoutParams();
            return;
          case "CANCELED":
            setCheckoutReturnPhase("IDLE");
            setCheckoutNotice({
              tone: "info",
              message:
                payload.checkoutStatus === "EXPIRED"
                  ? purchaseContext === "PHONE_REVEAL"
                    ? "Checkout expired. Try again to reveal the phone."
                    : "Checkout expired. Try again to unlock contact."
                  : purchaseContext === "PHONE_REVEAL"
                    ? "Checkout cancelled. You can reveal the phone anytime."
                    : "Checkout cancelled. You can unlock contact anytime.",
            });
            replaceWithoutCheckoutParams();
            return;
          case "PENDING":
          default:
            attempts += 1;
            if (attempts >= 15) {
              setCheckoutReturnPhase("PENDING_TIMEOUT");
              setCheckoutNotice({
                tone: "info",
                message:
                  "Payment received, still finalizing. Refresh or try again shortly.",
              });
              return;
            }
            timeoutId = setTimeout(() => {
              void pollCheckoutSession();
            }, 2000);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError" || cancelled) {
          return;
        }

        setCheckoutReturnPhase("IDLE");
        setCheckoutNotice({
          tone: "error",
          message: "We couldn’t verify your checkout just now. Refresh and try again.",
        });
        replaceWithoutCheckoutParams();
      }
    };

    void pollCheckoutSession();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    canRenderGuestControls,
    listing.id,
    pathname,
    router,
    searchParamsString,
    contactCheckoutParam,
    phoneRevealCheckoutParam,
    checkoutSessionIdParam,
  ]);

  useEffect(() => {
    if (!canRenderGuestControls) {
      return;
    }

    const handlePublicCacheInvalidated = () => {
      router.refresh();
    };

    window.addEventListener(
      PUBLIC_CACHE_INVALIDATED_EVENT,
      handlePublicCacheInvalidated
    );

    return () => {
      window.removeEventListener(
        PUBLIC_CACHE_INVALIDATED_EVENT,
        handlePublicCacheInvalidated
      );
    };
  }, [canRenderGuestControls, router]);

  useEffect(() => {
    const fallbackViewerState = buildFallbackViewerState({
      isLoggedIn: resolvedIsLoggedIn,
      isOwner: resolvedIsOwner,
      isEmailVerified: resolvedIsEmailVerified,
      isListingActive: listing.status === "ACTIVE",
      hasBookingHistory: userHasBooking,
      existingReview: userExistingReview,
      availabilitySource: listing.availabilitySource,
    });

    if (resolvedIsOwner) {
      setViewerState({
        ...fallbackViewerState,
        loaded: true,
      });
      return;
    }

    if (sessionStatus === "loading") {
      return;
    }

    const controller = new AbortController();
    setViewerState({
      ...fallbackViewerState,
      loaded: false,
    });

    void (async () => {
      try {
        const response = await fetch(
          `/api/listings/${listing.id}/viewer-state`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load listing viewer state");
        }

        const data = (await response.json()) as Partial<
          Omit<ViewerState, "loaded">
        >;

        setViewerState(mergeViewerState(fallbackViewerState, data));
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setViewerState({
          ...fallbackViewerState,
          loaded: true,
        });
      }
  })();

  return () => controller.abort();
  }, [
    listing.id,
    listing.availabilitySource,
    listing.status,
    resolvedIsEmailVerified,
    resolvedIsLoggedIn,
    resolvedIsOwner,
    sessionStatus,
    userExistingReview,
    userHasBooking,
    viewerStateRefreshNonce,
  ]);

  return (
    <div className="min-h-screen bg-surface-canvas pb-20">
      <ListingViewTracker
        listingId={listing.id}
        ownerId={listing.ownerId}
        viewToken={viewToken}
      />

      {/* Real-time availability check for non-owners */}
      {canRenderGuestControls && (
        <ListingFreshnessCheck listingId={listing.id} />
      )}

      <div className="pt-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs & Title Header */}
          <div
            data-testid="listing-detail-header"
            className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between lg:items-end"
          >
            <div
              data-testid="listing-detail-title-group"
              className="min-w-0 flex-1 flex flex-col gap-1"
            >
              {/* Breadcrumb */}
              <nav aria-label="Breadcrumb" className="mb-1">
                <ol className="flex items-center gap-1.5 text-sm text-on-surface-variant font-medium">
                  <li>
                    <Link
                      href="/"
                      className="hover:text-on-surface transition-colors"
                    >
                      Home
                    </Link>
                  </li>
                  <li aria-hidden="true">
                    <ChevronRight className="w-3 h-3" />
                  </li>
                  <li>
                    <Link
                      href="/search"
                      className="hover:text-on-surface transition-colors"
                    >
                      Search
                    </Link>
                  </li>
                  <li aria-hidden="true">
                    <ChevronRight className="w-3 h-3" />
                  </li>
                  <li
                    aria-current="page"
                    className="text-on-surface font-semibold truncate max-w-[200px]"
                  >
                    {listing.title}
                  </li>
                </ol>
              </nav>
              {/* Title */}
              <h1 className="break-words text-3xl font-bold font-display leading-tight tracking-tight text-on-surface md:text-4xl">
                {listing.title}
              </h1>
            </div>
            {/* Action buttons */}
            <div
              data-testid="listing-detail-actions"
              className="flex w-full flex-col items-end gap-2 self-end md:w-auto md:flex-none md:self-auto"
            >
              <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:flex-nowrap [&>*]:shrink-0">
                <ShareListingButton
                  listingId={listing.id}
                  title={listing.title}
                />
                {canRenderGuestControls && resolvedIsLoggedIn && (
                  <SaveListingButton listingId={listing.id} />
                )}
                {canRenderGuestControls && (
                  <ReportButton listingId={listing.id} />
                )}
              </div>
              {canRenderGuestControls &&
                viewerState.reviewEligibility.canLeavePrivateFeedback && (
                  <button
                    type="button"
                    onClick={() => setPrivateFeedbackOpen(true)}
                    className="text-xs font-medium text-on-surface-variant underline-offset-4 transition hover:text-on-surface hover:underline"
                  >
                    Not a booking, but want to share feedback? Leave private
                    feedback
                  </button>
                )}
              {canRenderGuestControls && (
                <PrivateFeedbackDialog
                  listingId={listing.id}
                  listingTitle={listing.title}
                  open={privateFeedbackOpen}
                  onOpenChange={setPrivateFeedbackOpen}
                  targetUserId={listing.ownerId}
                />
              )}
            </div>
          </div>

          {checkoutNotice && canRenderGuestControls && (
            <div
              data-testid="checkout-return-banner"
              className={cn(
                "mb-6 rounded-2xl border px-4 py-3 text-sm font-medium",
                checkoutNotice.tone === "success" &&
                  "border-green-200 bg-green-50 text-green-800",
                checkoutNotice.tone === "error" &&
                  "border-red-200 bg-red-50 text-red-800",
                checkoutNotice.tone === "info" &&
                  "border-blue-200 bg-blue-50 text-blue-800"
              )}
            >
              {checkoutNotice.message}
            </div>
          )}

          {/* Hero Gallery */}
          <div className="mb-12">
            {hasImages ? (
              <div className="relative group/gallery">
                <ImageGallery images={listing.images} title={listing.title} />
                <div className="absolute bottom-6 right-6 px-4 py-2 bg-surface-container-lowest/90 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-on-surface shadow-ambient flex items-center gap-2 pointer-events-none opacity-0 group-hover/gallery:opacity-100 transition-opacity">
                  <Maximize2 className="w-3 h-3" /> Click to enlarge
                </div>
              </div>
            ) : (
              <RoomPlaceholder />
            )}
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Left Column: Details */}
            <div className="lg:col-span-2 space-y-12">
              {/* Quick Stats Bar */}
              <div className="flex flex-wrap items-center gap-6 pb-8">
                {viewerReady && resolvedIsOwner && (
                  <>
                    <ListingStatusToggle
                      listingId={listing.id}
                      currentStatus={
                        listing.status as "ACTIVE" | "PAUSED" | "RENTED"
                      }
                      currentVersion={listing.version}
                      currentStatusReason={listing.statusReason ?? null}
                      moderationWriteLocksEnabled={moderationWriteLocksEnabled}
                    />
                    <div className="h-4 w-[1px] bg-outline-variant/20" />
                  </>
                )}
                {(!viewerReady || !resolvedIsOwner) && (
                  <>
                    <StatusBadge status={listing.status} />
                    <div className="h-4 w-[1px] bg-outline-variant/20" />
                  </>
                )}
                <InfoStat icon={MapPin}>
                  {listing.location?.city}, {listing.location?.state}
                </InfoStat>
                <SlotBadge
                  availableSlots={effectiveAvailableSlots}
                  totalSlots={listing.totalSlots}
                />
                {listing.bookingMode === "WHOLE_UNIT" && (
                  <Badge variant="purple" data-testid="whole-unit-badge">
                    Whole Unit
                  </Badge>
                )}
                <div className="h-4 w-[1px] bg-outline-variant/20" />
                <InfoStat icon={Bed}>Furnished</InfoStat>
              </div>

              {/* About */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold font-display text-on-surface">
                  About this place
                </h2>
                <p className="text-on-surface-variant leading-relaxed text-lg font-light whitespace-pre-line">
                  {hasHydrated ? listing.description : null}
                </p>
              </div>

              {/* Amenities */}
              {listing.amenities.length > 0 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold font-display text-on-surface">
                    What this place offers
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                    {listing.amenities.map((amenity, i) => {
                      const AmenityIcon = getAmenityIcon(amenity);
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-4 rounded-2xl bg-surface-canvas/50 hover:bg-surface-container-lowest hover:shadow-ambient transition-all duration-300"
                        >
                          <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            {AmenityIcon ? (
                              <AmenityIcon
                                className="w-5 h-5"
                                strokeWidth={1.5}
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-surface-container-high" />
                            )}
                          </div>
                          <span className="text-on-surface-variant font-medium">
                            {hasHydrated ? amenity : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nearby Places Section (Radar + MapLibre) */}
              {process.env.NEXT_PUBLIC_NEARBY_ENABLED === "true" &&
                nearbyCoordinates && (
                  <NearbyPlacesSection
                    listingLat={nearbyCoordinates.lat}
                    listingLng={nearbyCoordinates.lng}
                  />
                )}

              {/* Household Details */}
              {(listing.householdLanguages.length > 0 ||
                listing.genderPreference ||
                listing.householdGender) && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold font-display text-on-surface">
                    Household Details
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {listing.genderPreference && (
                      <div className="p-5 rounded-2xl bg-surface-container-lowest shadow-ambient-sm">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                          Gender Preference
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <span className="text-lg font-semibold text-on-surface">
                            {formatGenderPreference(listing.genderPreference)}
                          </span>
                        </div>
                      </div>
                    )}
                    {listing.householdGender && (
                      <div className="p-5 rounded-2xl bg-surface-container-lowest shadow-ambient-sm">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                          Current Household
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-tertiary" />
                          <span className="text-lg font-semibold text-on-surface">
                            {formatHouseholdGender(listing.householdGender)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  {listing.householdLanguages.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                        Languages Spoken
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {listing.householdLanguages.map((lang, i) => (
                          <span
                            key={i}
                            className="px-4 py-1.5 bg-surface-container-high text-on-surface-variant rounded-full text-sm font-medium"
                          >
                            {getLanguageName(lang)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Host Section */}
              <div className="pt-8">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-surface-container-high flex-shrink-0 border-2 border-surface-container-lowest shadow-ambient">
                    <UserAvatar
                      image={listing.owner.image}
                      name={listing.owner.name}
                      size="xl"
                      className="w-full h-full"
                    />
                  </div>
                  <div className="flex-1">
                    <Link
                      href={`/users/${listing.ownerId}`}
                      className="hover:underline"
                    >
                      <h3 className="text-lg font-bold font-display text-on-surface">
                        Hosted by {listing.owner.name || "User"}
                      </h3>
                    </Link>
                    <p className="text-on-surface-variant text-sm mb-2">
                      Joined in{" "}
                      {new Date(listing.owner.createdAt).getFullYear()}
                      {listing.owner.bio &&
                        ` • ${listing.owner.bio.slice(0, 50)}${listing.owner.bio.length > 50 ? "..." : ""}`}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {listing.owner.isVerified && (
                        <div className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                          Identity verified
                        </div>
                      )}
                      {listing.owner.isVerified && reviews.length >= 5 && (
                        <>
                          <span className="text-outline-variant/20">•</span>
                          <div className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                            <Star className="w-3.5 h-3.5 text-primary" />
                            Superhost
                          </div>
                        </>
                      )}
                    </div>
                    {canRenderGuestControls && (
                      <div
                        data-testid="contact-host-host-section"
                        className="mt-4 lg:hidden"
                      >
                        <MessagingCta
                          listingId={listing.id}
                          unitIdentityEpochObserved={
                            publicCacheMetadata?.unitIdentityEpoch ?? null
                          }
                          primaryCta={viewerState.primaryCta}
                          canContact={viewerState.canContact}
                          contactDisabledReason={viewerState.contactDisabledReason}
                          paywallSummary={viewerState.paywallSummary}
                          disabled={checkoutCtaDisabled}
                          disabledLabel={checkoutCtaDisabledLabel}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Reviews Section */}
              <div className="space-y-6">
                <h2 className="text-xl font-bold font-display flex items-center gap-2 text-on-surface">
                  Reviews
                  <span className="text-lg font-normal text-on-surface-variant">
                    ({reviews.length})
                  </span>
                </h2>

                <div className="mb-8">
                  <ReviewList reviews={reviews} isOwner={resolvedIsOwner} />
                </div>

                {canRenderGuestControls && viewerState.loaded && (
                  <ReviewForm
                    listingId={listing.id}
                    isLoggedIn={viewerState.isLoggedIn}
                    hasExistingReview={!!viewerState.existingReview}
                    reviewEligibility={viewerState.reviewEligibility}
                    existingReview={viewerState.existingReview || undefined}
                  />
                )}
              </div>

              {/* Similar Listings Section */}
              {similarListings && similarListings.length > 0 && (
                <div className="pt-8">
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold font-display text-on-surface">
                      Similar listings
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {similarListings.map((similarListing) => (
                        <ListingCard
                          key={similarListing.id}
                          listing={similarListing}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Sticky Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Owner Management Card */}
                {resolvedIsOwner && (
                  <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-ambient-lg">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold font-display text-on-surface">
                        Manage Listing
                      </h3>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    </div>

                    {listing.availabilitySource === "HOST_MANAGED" && (
                      <div className="mb-6">
                        <ListingFreshnessCheck
                          listingId={listing.id}
                          canManage={true}
                          reviewHref={`/listings/${listing.id}/edit`}
                        />
                      </div>
                    )}

                    {/* Status Toggle */}
                    <div className="mb-6">
                      <ListingStatusToggle
                        listingId={listing.id}
                        currentStatus={
                          listing.status as "ACTIVE" | "PAUSED" | "RENTED"
                        }
                        currentVersion={listing.version}
                        currentStatusReason={listing.statusReason ?? null}
                        moderationWriteLocksEnabled={moderationWriteLocksEnabled}
                      />
                    </div>

                    {/* Price */}
                    <div className="mb-6 text-center">
                      <span className="text-2xl font-bold font-display text-on-surface">
                        {formatPrice(listing.price ?? 0)}
                      </span>
                      <span className="text-sm text-on-surface-variant">
                        /mo
                      </span>
                    </div>

                    {/* Stats Preview */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <StatCard label="Views" value={listing.viewCount} />
                      <StatCard label="Reviews" value={reviews.length} />
                    </div>

                    <div className="space-y-3">
                      <Link
                        href={`/listings/${listing.id}/edit`}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-primary to-primary-container hover:opacity-90 text-white font-medium py-3.5 px-4 rounded-xl transition-all shadow-ambient active:scale-[0.98]"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit Listing
                      </Link>
                      <DeleteListingButton listingId={listing.id} />
                    </div>

                    <div className="mt-6 pt-6 text-center">
                      <button
                        onClick={() =>
                          window.open(
                            `/listings/${listing.id}?preview=true`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        className="text-xs text-on-surface-variant hover:text-on-surface underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View listing as guest
                      </button>
                    </div>
                  </div>
                )}

                {/* Boost Visibility Card (Owner only) */}
                {resolvedIsOwner && (
                  <div className="bg-surface-container-high rounded-2xl p-5 border border-outline-variant/20">
                    <div className="flex gap-3">
                      <div className="p-2 bg-on-surface-variant/10 text-on-surface-variant rounded-lg h-fit">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-on-surface text-sm mb-1">
                          Boost Visibility
                        </h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
                          Get up to 3x more views by promoting this listing.
                        </p>
                        <button
                          disabled
                          className="text-xs font-semibold text-on-surface-variant/60 cursor-not-allowed"
                        >
                          Coming Q3 2026
                        </button>
                        <p className="text-xs text-on-surface-variant mt-1">
                          <Link
                            href="/notifications"
                            className="underline underline-offset-2 hover:text-on-surface"
                          >
                            Get notified
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Guest Booking Card */}
                {canRenderGuestControls && (
                  <ContactFirstSidebarCard
                    listingId={listing.id}
                    unitIdentityEpochObserved={
                      publicCacheMetadata?.unitIdentityEpoch ?? null
                    }
                    price={listing.price}
                    status={listing.status}
                    bookingMode={listing.bookingMode}
                    effectiveAvailableSlots={effectiveAvailableSlots}
                    primaryCta={viewerState.primaryCta}
                    canContact={viewerState.canContact}
                    contactDisabledReason={viewerState.contactDisabledReason}
                    paywallSummary={viewerState.paywallSummary}
                    ctaDisabled={checkoutCtaDisabled}
                    ctaDisabledLabel={checkoutCtaDisabledLabel}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
