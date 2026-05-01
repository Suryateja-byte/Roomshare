"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startConversation } from "@/app/actions/chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { redirectToUrl } from "@/lib/client-redirect";
import { cn } from "@/lib/utils";

type ProductCode = "CONTACT_PACK_3" | "MOVERS_PASS_30D";

interface PaywallOffer {
  productCode: ProductCode;
  label: string;
  priceDisplay: string;
  description: string;
}

interface PaywallSummary {
  requiresPurchase: boolean;
  offers: PaywallOffer[];
}

interface ContactHostButtonProps {
  listingId: string;
  unitIdentityEpochObserved?: number | null;
  paywallSummary?: PaywallSummary | null;
  requiresUnlock?: boolean;
  className?: string;
  disabled?: boolean;
  disabledLabel?: string;
}

export default function ContactHostButton({
  listingId,
  unitIdentityEpochObserved = null,
  paywallSummary = null,
  requiresUnlock = false,
  className,
  disabled = false,
  disabledLabel = "Finalizing Purchase...",
}: ContactHostButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutProductCode, setCheckoutProductCode] =
    useState<ProductCode | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const isStartingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const router = useRouter();
  const canUnlock = requiresUnlock && !!paywallSummary?.requiresPurchase;

  const openPaywall = () => setIsPaywallOpen(true);

  const handleCheckout = async (productCode: ProductCode) => {
    setCheckoutProductCode(productCode);

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ listingId, productCode }),
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

      setIsPaywallOpen(false);
      redirectToUrl(payload.checkoutUrl);
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      toast.error("Failed to open checkout");
    } finally {
      setCheckoutProductCode(null);
    }
  };

  const handleContact = async () => {
    if (disabled) {
      return;
    }

    if (canUnlock) {
      openPaywall();
      return;
    }

    // Guard synchronously so rapid double-clicks in the same render frame
    // cannot enqueue multiple startConversation actions before disabled applies.
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsLoading(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }

      const result = await startConversation({
        listingId,
        clientIdempotencyKey: idempotencyKeyRef.current,
        ...(unitIdentityEpochObserved
          ? { unitIdentityEpochObserved }
          : {}),
      });

      if ("error" in result && result.error) {
        const paywallRequired =
          "code" in result && result.code === "PAYWALL_REQUIRED";
        const paywallUnavailable =
          "code" in result && result.code === "PAYWALL_UNAVAILABLE";
        if (result.error === "Unauthorized") {
          router.push("/login");
        } else if (paywallUnavailable) {
          toast.error("Contact is temporarily unavailable. Please try again shortly.");
        } else if (paywallRequired && paywallSummary?.requiresPurchase) {
          openPaywall();
        } else {
          toast.error(result.error);
        }
        return;
      }

      if ("conversationId" in result && result.conversationId) {
        router.push(`/messages/${result.conversationId}`);
      }
    } catch (error: unknown) {
      console.error("Failed to start conversation:", error);
      toast.error("Failed to start conversation");
    } finally {
      idempotencyKeyRef.current = null;
      isStartingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleContact}
        disabled={disabled || isLoading || checkoutProductCode !== null}
        size="lg"
        className={cn("w-full", className)}
      >
        {disabled
          ? disabledLabel
          : isLoading
          ? "Starting Chat..."
          : checkoutProductCode
            ? "Redirecting..."
            : canUnlock
              ? "Unlock to Contact"
              : "Contact Host"}
      </Button>

      <Dialog open={isPaywallOpen} onOpenChange={setIsPaywallOpen}>
        <DialogContent data-testid="contact-paywall-dialog">
          <DialogHeader>
            <DialogTitle>Unlock contact</DialogTitle>
            <DialogDescription>
              Buy a contact pack or pass to start a new conversation with this
              host. Existing conversations stay available.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {paywallSummary?.offers.map((offer) => (
              <button
                key={offer.productCode}
                type="button"
                onClick={() => void handleCheckout(offer.productCode)}
                disabled={checkoutProductCode !== null}
                data-testid={`checkout-offer-${offer.productCode}`}
                className="w-full rounded-2xl border border-outline-variant/20 bg-surface-canvas p-4 text-left transition hover:border-primary/30 hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-on-surface">
                      {offer.label}
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      {offer.description}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-on-surface">
                    {checkoutProductCode === offer.productCode
                      ? "Opening..."
                      : offer.priceDisplay}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
