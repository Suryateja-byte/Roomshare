import "server-only";

import Stripe from "stripe";
import type { ProductCode } from "@prisma/client";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

export function getStripePriceId(productCode: ProductCode): string {
  const priceId =
    productCode === "CONTACT_PACK_3"
      ? process.env.STRIPE_PRICE_CONTACT_PACK_3
      : process.env.STRIPE_PRICE_MOVERS_PASS_30D;

  if (!priceId) {
    throw new Error(`Stripe price id missing for ${productCode}`);
  }

  return priceId;
}
