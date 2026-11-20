import { notFound } from "next/navigation";
import { withScope } from "@devmentor/core";
import { isAppError, type NoteView, type SessionView } from "@devmentor/core/http";
import { LocalTime } from "@devmentor/ui";
import { requirePageSession } from "@/lib/session";
import { AnswerForm } from "./AnswerForm";
import { SessionChat } from "./SessionChat";
import { SessionNote } from "./SessionNote";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** R01: every session screen says so. */
export const TEXT_ONLY = "Sessions are text — no video call.";

/** The caller's session, or `null` (unknown, malformed or not theirs: one 404 for all, AC4). */
async function loadSession(userId: string, id: string): Promise<{ session: SessionView; note: NoteView } | null> {
  if (!UUID.test(id)) {
    return null;
  }

  try {
    return await withScope(async ({ sessionService, sessionNoteService }) => ({
      session: await sessionService.get(userId, id),
      note: await sessionNoteService.get(userId, id),
    }));
  } catch (error) {
    if (isAppError(error) && error.status === 404) {
      return null;
    }

    throw error;
  }
}

/**
 * /sessions/[id] body (spec 2026-11-20-text-session): the text exchange between the mentee and the
 * mentor, then the mentor's written answer. Only the two parties get here.
 */
export async function SessionContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageSession(`/sessions/${id}`);
  const loaded = await loadSession(user.id, id);

  if (loaded === null) {
    notFound();
  }

  const { session, note } = loaded;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-heading-2 font-semibold">
          {session.lengthMinutes}-minute session with {session.otherParty.displayName}
        </h1>
        <p className="text-muted-foreground">
          <LocalTime iso={session.startsAt} /> · {TEXT_ONLY}
        </p>
      </div>
      <SessionChat initial={session} />
      <section aria-labelledby="answer-heading" className="flex flex-col gap-related">
        <h2 id="answer-heading" className="text-heading-3 font-semibold">
          Written answer
        </h2>
        {session.answer !== null ? (
          <div className="flex flex-col gap-1">
            <p className="text-caption text-muted-foreground">
              Submitted <LocalTime iso={session.answer.submittedAt} />
            </p>
            <p className="max-w-prose whitespace-pre-wrap">{session.answer.body}</p>
          </div>
        ) : session.canAnswer ? (
          <AnswerForm sessionId={session.id} />
        ) : session.role === "mentor" ? (
          <p className="text-body-small text-muted-foreground">You can submit the written answer from the start of the session until a day after it ends.</p>
        ) : (
          <p className="text-body-small text-muted-foreground">The mentor&apos;s written answer will appear here.</p>
        )}
      </section>
      <SessionNote sessionId={session.id} note={note} />
      {session.role === "mentee" ? (
        <p className="text-body-small text-muted-foreground">
          Something went wrong?{" "}
          <a href={`/bookings/${session.id}`} className="text-link underline underline-offset-4">
            Report a problem on your booking
          </a>
          .
        </p>
      ) : null}
    </>
  );
}
