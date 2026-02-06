// Re-export opengraph image for Twitter card
// Note: runtime must be declared directly (Next.js cannot statically parse re-exports)
export { default, alt, size, contentType } from './opengraph-image';

export const runtime = 'edge';
