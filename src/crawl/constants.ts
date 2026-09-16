/**
 * Placeholders used in the `imageUrl` field for references that have no fetchable URL.
 * Shared so the report, the source classifier, and the image checker agree on them.
 */
export const NOT_REAL_URLS = new Set(['(inline svg)', '(no src)']);

/** True for a reference that can never be requested over the network. */
export function isFetchableImageUrl(imageUrl: string): boolean {
  return !NOT_REAL_URLS.has(imageUrl) && !imageUrl.startsWith('data:') && /^https?:\/\//i.test(imageUrl);
}
