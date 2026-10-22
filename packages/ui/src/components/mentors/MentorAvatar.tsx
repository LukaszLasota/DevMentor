import { cn } from "cn";

export interface MentorAvatarProps {
  displayName: string;
  avatarUrl: string | null;
  size?: "md" | "lg";
}

/**
 * Public avatar (Tailwind only, no Radix: public pages, spec #23/#27). Plain <img> from GitHub with
 * alt="" and no referrer; without one, the first letter on --muted (A01, stage 0 Q4).
 */
export function MentorAvatar({ displayName, avatarUrl, size = "md" }: MentorAvatarProps) {
  const box = cn("shrink-0 rounded-full", size === "lg" ? "size-avatar-lg" : "size-avatar-md");

  if (avatarUrl) {
    // Spec #21: a plain <img> straight from GitHub; the ui package cannot use next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className={cn(box, "object-cover")} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "flex items-center justify-center border border-border bg-muted font-medium text-foreground",
        size === "lg" ? "text-heading-4" : "text-label",
      )}
    >
      {displayName.trim().charAt(0).toUpperCase()}
    </span>
  );
}
