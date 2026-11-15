/** `path` with `?returnTo=` when there is a safe one (already checked by `safeReturnTo`), so the next auth page keeps it. */
export function withReturnTo(path: string, returnTo: string): string {
  return returnTo ? `${path}?${new URLSearchParams({ returnTo }).toString()}` : path;
}

/** Plain-object query of a page (`searchParams`): a single string value, else `undefined`. */
export function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
