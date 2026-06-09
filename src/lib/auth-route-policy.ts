export const PRIVATE_PAGE_PATHS = [
  "/admin",
  "/dashboard",
  "/bookings",
  "/messages",
  "/settings",
  "/profile",
  "/notifications",
  "/saved",
  "/recently-viewed",
  "/saved-searches",
  "/listings/create",
] as const;

export const PROTECTED_API_PATHS = [
  "/api/listings",
  "/api/bookings",
  "/api/messages",
  "/api/reviews",
] as const;

export const READ_ONLY_PUBLIC_ENDPOINTS = ["/api/listings"] as const;

export function isRoutePrefixMatch(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isPathPrefixMatch(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route);
}

export function isPrivatePagePath(pathname: string): boolean {
  return PRIVATE_PAGE_PATHS.some((path) => isPathPrefixMatch(pathname, path));
}

export function isProtectedApiPath(pathname: string): boolean {
  return PROTECTED_API_PATHS.some((path) =>
    isRoutePrefixMatch(pathname, path)
  );
}

export function isReadOnlyPublicApiPath(pathname: string): boolean {
  return READ_ONLY_PUBLIC_ENDPOINTS.some((path) =>
    isRoutePrefixMatch(pathname, path)
  );
}
