import { withScope } from "@devmentor/core";
import { cache } from "react";

/**
 * The public mentor page for one request (spec #28): React `cache()` memoises it per server request
 * (not `use cache`), so `generateMetadata` and the page share one database read at one clock instant.
 * `null` for every page that is not public (unknown, unpublished, role revoked); any other failure
 * (database down) propagates to `error.tsx`.
 */
export const loadPublicMentor = cache((slug: string) =>
  withScope(({ mentorProfileService }) => mentorProfileService.findPublicBySlug(slug)),
);
