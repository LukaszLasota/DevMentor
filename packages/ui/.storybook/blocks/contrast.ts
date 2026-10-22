// WCAG 2.2 relative luminance and contrast ratio for computed CSS colours.

export type Rgb = [number, number, number];

/** Parses the browser's computed colour (functional rgb/rgba notation or `color(srgb …)`) into 0–255 channels. */
export function parseColor(value: string): Rgb | null {
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  return null;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a CSS custom property to a computed colour inside `scope` (theme wrapper). */
export function resolveColor(scope: HTMLElement, token: string): Rgb | null {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  scope.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return parseColor(value);
}
