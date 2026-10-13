/**
 * Utility functions for Vercel Blob storage URLs.
 * Safe for import in both Server Components and Client Components.
 */

/**
 * Determines whether an image URL belongs to a trusted Vercel Blob storage host.
 *
 * Used to selectively apply `unoptimized` on Next.js `<Image>` components
 * so public Vercel Blob images are fetched directly by the browser from Vercel's Edge CDN,
 * preventing server-side SSRF blocks caused by local Fake-IP/VPN/proxy DNS resolvers (198.18.0.0/15).
 */
export function isTrustedBlobUrl(urlString: string | null | undefined): boolean {
  if (!urlString) return false;
  try {
    const url = new URL(urlString);
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".public.blob.vercel-storage.com") ||
        url.hostname === "blob.mock-storage.local" ||
        url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}
