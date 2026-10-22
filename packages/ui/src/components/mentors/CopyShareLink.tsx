"use client";

import { useRef, useState } from "react";
import { Button } from "../ui/button";

/**
 * The share link after the first publish (spec #23): the URL as text, a Copy link button that falls
 * back to selecting the text, and the result announced through a status region.
 */
export function CopyShareLink({ url }: { url: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      inputRef.current?.select();
      setMessage("Copy is blocked here. The link is selected; press Ctrl+C or Cmd+C.");
    }
  }

  return (
    <div className="flex flex-col gap-related">
      <label htmlFor="share-link" className="text-label font-medium">
        Your share link
      </label>
      <div className="flex flex-wrap items-center gap-related">
        <input
          ref={inputRef}
          id="share-link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-field min-w-0 flex-1 rounded-control border border-input bg-muted px-field-pad font-mono text-body-small text-foreground outline-none focus-visible:focus-ring"
        />
        <Button size="md" onClick={copy}>
          Copy link
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">This link stays the same if you change your name.</p>
      <p role="status" className="text-caption text-foreground">
        {message}
      </p>
    </div>
  );
}
