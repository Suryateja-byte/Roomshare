const priceFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatPrice(price: number): string {
  if (price === 0) return "Free";
  if (price < 0) return "$0";
  if (!Number.isFinite(price)) return "$0";
  return `$${priceFormatter.format(price)}`;
}

/** Canonical monthly price: "$1,500/mo" */
export function formatPricePerMonth(price: number): string {
  return `${formatPrice(price)}/mo`;
}

export function formatPriceCompact(price: number): string {
  const num = typeof price === "number" ? price : parseInt(String(price), 10);
  if (isNaN(num)) return "$0";
  if (num >= 10000) return `$${(num / 1000).toFixed(0)}k`;
  return `$${priceFormatter.format(num)}`;
}
