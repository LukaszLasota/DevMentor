/** Loading placeholder for /mentors (spec #27): filter and three rows, announced once. */
export function MentorListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading mentors" className="flex flex-col gap-paragraph">
      <div aria-hidden="true" className="flex gap-related">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="h-button-sm w-component rounded-control bg-muted motion-safe:animate-pulse" />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} aria-hidden="true" className="flex gap-paragraph border-b border-border py-paragraph">
          <span className="size-avatar-md rounded-full bg-muted motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-related">
            <span className="h-paragraph w-1/3 rounded-control bg-muted motion-safe:animate-pulse" />
            <span className="h-related w-2/3 rounded-control bg-muted motion-safe:animate-pulse" />
          </span>
        </div>
      ))}
    </div>
  );
}
