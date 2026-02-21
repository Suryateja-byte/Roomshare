// Wire up the auth+security proxy as the Next.js middleware entry point.
// Implementation lives in proxy.ts (suspension check, CSP headers, request-id).
export { default as middleware, config } from "./proxy";
