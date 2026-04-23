import type { ProductCode } from "@prisma/client";

export const FREE_MESSAGE_START_CONTACTS = 2;

export interface PaywallOffer {
  productCode: ProductCode;
  label: string;
  priceDisplay: string;
  description: string;
}

type ProductCatalogEntry = PaywallOffer & {
  amountCents: number;
  creditCount?: number;
  durationDays?: number;
  checkoutName: string;
};

export const PRODUCT_CATALOG: Record<ProductCode, ProductCatalogEntry> = {
  CONTACT_PACK_3: {
    productCode: "CONTACT_PACK_3",
    label: "3 contacts",
    priceDisplay: "$4.99",
    description: "Unlock 3 additional message starts.",
    amountCents: 499,
    creditCount: 3,
    checkoutName: "Roomshare Contact Pack (3 contacts)",
  },
  MOVERS_PASS_30D: {
    productCode: "MOVERS_PASS_30D",
    label: "30-day pass",
    priceDisplay: "$9.99",
    description: "Unlimited message starts for 30 days.",
    amountCents: 999,
    durationDays: 30,
    checkoutName: "Roomshare Mover's Pass (30 days)",
  },
};

export const DEFAULT_PAYWALL_OFFERS: PaywallOffer[] = [
  PRODUCT_CATALOG.CONTACT_PACK_3,
  PRODUCT_CATALOG.MOVERS_PASS_30D,
];

export function isProductCode(value: string): value is ProductCode {
  return value === "CONTACT_PACK_3" || value === "MOVERS_PASS_30D";
}

export function getProductCatalogEntry(productCode: ProductCode) {
  return PRODUCT_CATALOG[productCode];
}
