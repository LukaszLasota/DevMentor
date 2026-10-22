// Stack-tag vocabulary (spec #23): keys used in URLs and data, labels shown on screen.
export const STACK_TAGS = [
  { key: "typescript", label: "TypeScript" },
  { key: "react", label: "React" },
  { key: "python", label: "Python" },
  { key: "ai-agents", label: "AI agents" },
] as const;

export type StackTagKey = (typeof STACK_TAGS)[number]["key"];

export function stackTagLabel(key: StackTagKey): string {
  return STACK_TAGS.find((tag) => tag.key === key)!.label;
}

/** Public-work link text: host + path, cut at 60 characters with "…" (spec #28). */
export function publicWorkLabel(url: string): string {
  const { host, pathname } = new URL(url);
  const text = `${host}${pathname === "/" ? "" : pathname}`;
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}
