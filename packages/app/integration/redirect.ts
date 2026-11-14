/**
 * Where a guarded page sends the request. The guards run inside <Suspense> after the static shell
 * has streamed (partial prerendering), so the redirect arrives as a meta refresh in a 200 body,
 * not as a 307 `Location`.
 */
export async function redirectTarget(res: Response): Promise<string | null> {
  const html = await res.text();

  return /http-equiv="refresh" content="\d+;url=([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&') ?? null;
}
