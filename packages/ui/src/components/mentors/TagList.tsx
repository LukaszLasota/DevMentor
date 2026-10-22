import { stackTagLabel, type StackTagKey } from "./vocabulary";

/** Stack tags as plain labels, not links or pills (A01). */
export function TagList({ tags }: { tags: readonly StackTagKey[] }) {
  return (
    <ul aria-label="Stack tags" className="flex flex-wrap gap-related">
      {tags.map((tag) => (
        <li key={tag} className="rounded-control border border-border px-related py-badge-y text-caption text-foreground">
          {stackTagLabel(tag)}
        </li>
      ))}
    </ul>
  );
}
