/** Page numbers kept in the URL's search params (page 1 is left out). */

export function readPage(params: URLSearchParams, key = "page"): number {
  return Math.max(1, Math.floor(Number(params.get(key))) || 1);
}

/** A copy of `params` with `key` set to `page` (or removed, for page 1). */
export function withPage(params: URLSearchParams, page: number, key = "page"): URLSearchParams {
  const next = new URLSearchParams(params);
  if (page > 1) next.set(key, String(page));
  else next.delete(key);
  return next;
}
