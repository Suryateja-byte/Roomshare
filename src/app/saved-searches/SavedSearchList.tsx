"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  deleteSavedSearch,
  toggleSearchAlert,
} from "@/app/actions/saved-search";
import { buildSearchUrl, type SearchFilters } from "@/lib/search-utils";
import { redirectToUrl } from "@/lib/client-redirect";
import {
  Bell,
  BellOff,
  ExternalLink,
  Loader2,
  Lock,
  Trash2,
} from "lucide-react";
import Link from "next/link";

type EffectiveAlertState = "DISABLED" | "ACTIVE" | "LOCKED";
type AlertsCheckoutPhase = "IDLE" | "POLLING" | "PENDING_TIMEOUT";

interface SearchAlertPaywallSummary {
  enabled: boolean;
  mode: "PASS_ACTIVE" | "PAYWALL_REQUIRED";
  activePassExpiresAt: string | null;
  requiresPurchase: boolean;
  offers: Array<{
    productCode: "CONTACT_PACK_3" | "MOVERS_PASS_30D";
    label: string;
    priceDisplay: string;
    description: string;
  }>;
}

interface SavedSearch {
  id: string;
  name: string;
  query: string | null;
  filters: SearchFilters;
  alertEnabled: boolean;
  effectiveAlertState: EffectiveAlertState;
  lastAlertAt: Date | null;
  createdAt: Date;
}

interface SavedSearchListProps {
  initialSearches: SavedSearch[];
  initialAlertPaywallSummary: SearchAlertPaywallSummary;
}

interface CheckoutReturnNotice {
  tone: "info" | "success" | "error";
  message: string;
}

interface CheckoutSessionStatusPayload {
  sessionId: string;
  purchaseContext: "CONTACT_HOST" | "SEARCH_ALERTS";
  listingId: string | null;
  productCode: "CONTACT_PACK_3" | "MOVERS_PASS_30D";
  checkoutStatus: "OPEN" | "COMPLETE" | "EXPIRED";
  paymentStatus: "PAID" | "UNPAID";
  fulfillmentStatus: "PENDING" | "FULFILLED" | "FAILED" | "CANCELED";
  requiresViewerStateRefresh: boolean;
}

export default function SavedSearchList({
  initialSearches,
  initialAlertPaywallSummary,
}: SavedSearchListProps) {
  const [searches, setSearches] = useState(initialSearches);
  const [alertPaywallSummary, setAlertPaywallSummary] = useState(
    initialAlertPaywallSummary
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState<AlertsCheckoutPhase>("IDLE");
  const [checkoutNotice, setCheckoutNotice] =
    useState<CheckoutReturnNotice | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParamsString = searchParams.toString();
  const alertsCheckoutParam = searchParams.get("alertsCheckout");
  const checkoutSessionId = searchParams.get("session_id");

  const unlockOffer = useMemo(
    () => alertPaywallSummary.offers[0] ?? null,
    [alertPaywallSummary.offers]
  );
  const disableUnlockActions =
    isOpeningCheckout || checkoutPhase !== "IDLE" || unlockOffer === null;

  const replaceWithoutCheckoutParams = useCallback(() => {
    const params = new URLSearchParams(searchParamsString);
    params.delete("alertsCheckout");
    params.delete("session_id");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParamsString]);

  const markAlertStatesActive = useCallback(() => {
    setAlertPaywallSummary((current) => ({
      ...current,
      mode: "PASS_ACTIVE",
      requiresPurchase: false,
    }));
    setSearches((current) =>
      current.map((search) =>
        search.alertEnabled
          ? { ...search, effectiveAlertState: "ACTIVE" }
          : search
      )
    );
  }, []);

  const handleUnlockAlerts = async () => {
    if (disableUnlockActions || !unlockOffer) {
      return;
    }

    setIsOpeningCheckout(true);
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseContext: "SEARCH_ALERTS",
          productCode: unlockOffer.productCode,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; checkoutUrl?: string }
        | null;

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok || !payload?.checkoutUrl) {
        toast.error(payload?.error || "Failed to open checkout");
        return;
      }

      redirectToUrl(payload.checkoutUrl);
    } catch (error) {
      console.error("Failed to create alerts checkout session:", error);
      toast.error("Failed to open checkout");
    } finally {
      setIsOpeningCheckout(false);
    }
  };

  const handleToggleAlert = async (
    id: string,
    currentEnabled: boolean
  ) => {
    setLoadingId(id);
    try {
      const result = await toggleSearchAlert(id, !currentEnabled);
      if ("success" in result && result.success) {
        setSearches((prev) =>
          prev.map((search) =>
            search.id === id
              ? {
                  ...search,
                  alertEnabled: !currentEnabled,
                  effectiveAlertState:
                    result.effectiveAlertState ??
                    (!currentEnabled ? "ACTIVE" : "DISABLED"),
                }
              : search
          )
        );
        if (!currentEnabled && result.effectiveAlertState === "LOCKED") {
          toast.info("Alerts are saved, but locked until you unlock Mover's Pass.");
        }
      } else if ("error" in result && result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Error toggling alert:", error);
      toast.error("Failed to update alert setting");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this saved search?")) return;

    setLoadingId(id);
    try {
      const result = await deleteSavedSearch(id);
      if ("success" in result && result.success) {
        setSearches((prev) => prev.filter((search) => search.id !== id));
      } else if ("error" in result && result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Error deleting search:", error);
      toast.error("Failed to delete saved search");
    } finally {
      setLoadingId(null);
    }
  };

  useEffect(() => {
    if (alertsCheckoutParam === "cancelled") {
      setCheckoutPhase("IDLE");
      setCheckoutNotice({
        tone: "info",
        message: "Checkout cancelled. You can unlock alerts anytime.",
      });
      replaceWithoutCheckoutParams();
      return;
    }

    if (alertsCheckoutParam !== "success") {
      return;
    }

    if (!checkoutSessionId) {
      setCheckoutPhase("IDLE");
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

      setCheckoutPhase("POLLING");
      setCheckoutNotice({
        tone: "info",
        message: "Finalizing alert purchase...",
      });

      try {
        const response = await fetch(
          `/api/payments/checkout-session?session_id=${encodeURIComponent(checkoutSessionId)}&context=SEARCH_ALERTS`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          setCheckoutPhase("IDLE");
          setCheckoutNotice({
            tone: "error",
            message: "Sign in again to finish unlocking alerts.",
          });
          replaceWithoutCheckoutParams();
          return;
        }

        if (response.status === 404) {
          setCheckoutPhase("IDLE");
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
            markAlertStatesActive();
            setCheckoutPhase("IDLE");
            setCheckoutNotice({
              tone: "success",
              message: "Alerts unlocked.",
            });
            replaceWithoutCheckoutParams();
            router.refresh();
            return;
          case "FAILED":
            setCheckoutPhase("IDLE");
            setCheckoutNotice({
              tone: "error",
              message: "Payment failed. Try checkout again.",
            });
            replaceWithoutCheckoutParams();
            return;
          case "CANCELED":
            setCheckoutPhase("IDLE");
            setCheckoutNotice({
              tone: "info",
              message:
                payload.checkoutStatus === "EXPIRED"
                  ? "Checkout expired. Try again to unlock alerts."
                  : "Checkout cancelled. You can unlock alerts anytime.",
            });
            replaceWithoutCheckoutParams();
            return;
          case "PENDING":
          default:
            attempts += 1;
            if (attempts >= 15) {
              setCheckoutPhase("PENDING_TIMEOUT");
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

        setCheckoutPhase("IDLE");
        setCheckoutNotice({
          tone: "error",
          message:
            "We couldn’t verify your checkout just now. Refresh and try again.",
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
    alertsCheckoutParam,
    checkoutSessionId,
    markAlertStatesActive,
    pathname,
    replaceWithoutCheckoutParams,
    router,
    searchParamsString,
  ]);

  const formatFilters = (filters: SearchFilters): string => {
    const parts: string[] = [];

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const range = [
        filters.minPrice !== undefined ? `$${filters.minPrice}` : "Any",
        filters.maxPrice !== undefined ? `$${filters.maxPrice}` : "Any",
      ].join(" - ");
      parts.push(`Price: ${range}`);
    }

    if (filters.roomType) {
      parts.push(`Type: ${filters.roomType.replace("_", " ")}`);
    }

    if (filters.amenities?.length) {
      parts.push(`${filters.amenities.length} amenities`);
    }

    if (filters.leaseDuration) {
      parts.push(`Lease: ${filters.leaseDuration}`);
    }

    return parts.join(" | ") || "No filters";
  };

  const renderAlertBadge = (search: SavedSearch) => {
    if (search.effectiveAlertState === "ACTIVE") {
      return (
        <span className="inline-flex items-center gap-1 text-green-600">
          <Bell className="w-3 h-3" />
          Alerts active
        </span>
      );
    }

    if (search.effectiveAlertState === "LOCKED") {
      return (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <Lock className="w-3 h-3" />
          Alerts locked
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-on-surface-variant">
        <BellOff className="w-3 h-3" />
        Alerts disabled
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {checkoutNotice && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            checkoutNotice.tone === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : checkoutNotice.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant"
          }`}
        >
          {checkoutNotice.message}
        </div>
      )}

      {alertPaywallSummary.enabled && alertPaywallSummary.requiresPurchase && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                Saved-search alerts require an active Mover&apos;s Pass
              </p>
              <p className="text-sm text-amber-800">
                Your search preferences stay saved, but alerts won&apos;t send
                until you unlock them.
              </p>
            </div>
            {unlockOffer && (
              <button
                type="button"
                onClick={() => void handleUnlockAlerts()}
                disabled={disableUnlockActions}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isOpeningCheckout
                  ? "Opening checkout..."
                  : checkoutPhase === "POLLING"
                    ? "Finalizing purchase..."
                    : checkoutPhase === "PENDING_TIMEOUT"
                      ? "Unlock pending"
                      : `Unlock alerts · ${unlockOffer.priceDisplay}`}
              </button>
            )}
          </div>
        </div>
      )}

      {searches.map((search) => (
        <div
          key={search.id}
          className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest transition-colors hover:border-outline-variant/40"
        >
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-on-surface">
                  {search.name}
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {formatFilters(search.filters as SearchFilters)}
                </p>
                {search.query && (
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Search: &quot;{search.query}&quot;
                  </p>
                )}
                {search.effectiveAlertState === "LOCKED" && (
                  <p className="mt-2 text-sm text-amber-700">
                    Alerts are saved, but locked until you unlock Mover&apos;s
                    Pass.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    void handleToggleAlert(search.id, search.alertEnabled)
                  }
                  disabled={loadingId === search.id}
                  className={`rounded-lg p-2 transition-colors ${
                    search.effectiveAlertState === "ACTIVE"
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : search.effectiveAlertState === "LOCKED"
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-high/80"
                  }`}
                  title={
                    search.alertEnabled ? "Disable alerts" : "Enable alerts"
                  }
                >
                  {loadingId === search.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : search.effectiveAlertState === "ACTIVE" ? (
                    <Bell className="h-4 w-4" />
                  ) : search.effectiveAlertState === "LOCKED" ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                </button>

                <button
                  onClick={() => void handleDelete(search.id)}
                  disabled={loadingId === search.id}
                  className="rounded-lg bg-surface-container-high p-2 text-on-surface-variant transition-colors hover:bg-red-100 hover:text-red-600"
                  title="Delete search"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <Link
                  href={buildSearchUrl(search.filters as SearchFilters)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90"
                >
                  View
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between pt-4 text-xs text-on-surface-variant">
              <span>
                Created {new Date(search.createdAt).toLocaleDateString()}
              </span>
              {renderAlertBadge(search)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
