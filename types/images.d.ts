/**
 * Next's types for imported images (src/components/brand-mark.tsx imports the product's mark).
 * next-env.d.ts carries the same reference, but Next writes that file during `next build`, after
 * `npm run typecheck` has run on a fresh checkout (CI, the server's watchdog); this one is committed.
 */
/// <reference types="next/image-types/global" />
