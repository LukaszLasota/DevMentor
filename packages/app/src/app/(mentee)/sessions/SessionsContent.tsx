import { withScope } from "@devmentor/core";
import type { SessionListItem } from "@devmentor/core/http";
import { Badge, EmptyState, LocalTime, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@devmentor/ui";
import { requirePageSession } from "@/lib/session";
import { TEXT_ONLY } from "./[id]/SessionContent";

const STATE: Record<SessionListItem["state"], { label: string; tone: "neutral" | "success" | "warning" }> = {
  upcoming: { label: "Upcoming", tone: "neutral" },
  open: { label: "Open now", tone: "success" },
  awaiting_answer: { label: "Waiting for the answer", tone: "warning" },
  answered: { label: "Answer received", tone: "success" },
};

function SessionTable({ sessions }: { sessions: SessionListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>With</TableHead>
          <TableHead>You are</TableHead>
          <TableHead>State</TableHead>
          <TableHead>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => (
          <TableRow key={session.id}>
            <TableCell>
              <LocalTime iso={session.startsAt} /> · {session.lengthMinutes} min
            </TableCell>
            <TableCell>{session.otherParty.displayName}</TableCell>
            <TableCell>{session.role === "mentor" ? "Mentor" : "Mentee"}</TableCell>
            <TableCell>
              <Badge tone={STATE[session.state].tone}>{STATE[session.state].label}</Badge>
            </TableCell>
            <TableCell className="text-right">
              <a href={`/sessions/${session.id}`} className="text-link underline underline-offset-4">
                Open session
              </a>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** /sessions body ("My sessions", spec 2026-11-20-text-session): the caller's sessions as mentee and as mentor. */
export async function SessionsContent() {
  const user = await requirePageSession("/sessions");
  const sessions = await withScope(({ sessionService }) => sessionService.listMine(user.id));
  const upcoming = sessions.filter((session) => session.state === "upcoming" || session.state === "open");
  const past = sessions.filter((session) => session.state !== "upcoming" && session.state !== "open").reverse();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-heading-2 font-semibold">My sessions</h1>
        <p className="text-muted-foreground">{TEXT_ONLY}</p>
      </div>
      {sessions.length === 0 ? (
        <EmptyState title="No sessions yet." description="Book a mentor's open time, and your session shows up here." />
      ) : (
        <>
          <section aria-labelledby="upcoming-heading" className="flex flex-col gap-related">
            <h2 id="upcoming-heading" className="text-heading-3 font-semibold">
              Upcoming
            </h2>
            {upcoming.length === 0 ? <p className="text-body-small text-muted-foreground">Nothing upcoming.</p> : <SessionTable sessions={upcoming} />}
          </section>
          <section aria-labelledby="past-heading" className="flex flex-col gap-related">
            <h2 id="past-heading" className="text-heading-3 font-semibold">
              Past
            </h2>
            {past.length === 0 ? <p className="text-body-small text-muted-foreground">No past sessions.</p> : <SessionTable sessions={past} />}
          </section>
        </>
      )}
    </>
  );
}
