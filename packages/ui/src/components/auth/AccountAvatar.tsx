"use client";

import { useEffect, useRef, useState } from "react";

export interface AccountAvatarProps {
  src: string;
}

/**
 * The GitHub avatar of the account bar. Decorative (the email next to it names the account), so an
 * image that does not load is removed instead of showing a broken-image icon — e.g. a dev account
 * whose avatar URL points at the GitHub stub that is no longer running. An image that failed before
 * hydration fires no `onError` handler, so the mount effect also checks for a finished, empty image.
 */
export function AccountAvatar({ src }: AccountAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const element = image.current;

    if (element?.complete && element.naturalWidth === 0) {
      setFailedSrc(src);
    }
  }, [src]);

  if (failedSrc === src) {
    return null;
  }

  return (
    // Spec #21: a plain <img> straight from GitHub.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className="size-avatar-sm shrink-0 rounded-full object-cover"
    />
  );
}
