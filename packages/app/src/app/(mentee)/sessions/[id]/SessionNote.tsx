"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NoteView } from "@devmentor/core/http";
import { sessionNoteSchema } from "@devmentor/core/validators";
import { apiCall, Button, CrudForm, Label, LocalTime, Textarea } from "@devmentor/ui";

/**
 * "Session note" on /sessions/[id] (spec 2026-11-20-session-note; R15, R03): the mentor sends a version,
 * the mentee approves it or declines it with a comment, the mentor sends the next one. The mentee never
 * edits the text. Private to the two parties; published nowhere.
 */
export function SessionNote({ sessionId, note }: { sessionId: string; note: NoteView }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = note.versions.at(-1);
  const other = note.role === "mentor" ? "the mentee" : "your mentor";

  async function decide(decision: "approved" | "declined") {
    setBusy(true);
    setError(null);
    const result = await apiCall(`/api/sessions/${encodeURIComponent(sessionId)}/note/decision`, {
      method: "POST",
      body: decision === "approved" ? { decision, version: latest?.version } : { decision, version: latest?.version, comment },
    });
    setBusy(false);

    if (result.ok) {
      setDeclining(false);
      router.refresh();
    } else {
      setError(result.error.message);
    }
  }

  return (
    <section aria-labelledby="note-heading" className="flex flex-col gap-related">
      <h2 id="note-heading" className="text-heading-3 font-semibold">
        Session note
      </h2>
      <p className="text-body-small text-muted-foreground">Only you and {other} can see it. It is not published anywhere.</p>

      {note.state === "approved" && latest ? (
        <div className="flex flex-col gap-1">
          <p className="text-caption text-muted-foreground">
            Approved <LocalTime iso={latest.decidedAt as string} />
          </p>
          <p className="max-w-prose whitespace-pre-wrap">{latest.body}</p>
        </div>
      ) : null}

      {note.state === "waiting" && latest ? (
        <div className="flex flex-col gap-related">
          <p className="max-w-prose whitespace-pre-wrap">{latest.body}</p>
          {note.canDecide ? (
            declining ? (
              <form
                className="flex flex-col gap-related"
                onSubmit={(event) => {
                  event.preventDefault();
                  void decide("declined");
                }}
              >
                <Label htmlFor="decline-comment">What should change?</Label>
                <Textarea id="decline-comment" value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} />
                <div className="flex gap-related">
                  <Button type="submit" intent="destructive" disabled={busy || comment.trim().length < 10}>
                    Decline with this comment
                  </Button>
                  <Button type="button" appearance="outline" onClick={() => setDeclining(false)}>
                    Back
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex gap-related">
                <Button disabled={busy} onClick={() => void decide("approved")}>
                  Approve note
                </Button>
                <Button appearance="outline" disabled={busy} onClick={() => setDeclining(true)}>
                  Decline
                </Button>
              </div>
            )
          ) : (
            <p className="text-body-small text-muted-foreground">Waiting for the mentee&apos;s decision.</p>
          )}
        </div>
      ) : null}

      {note.state === "declined" && latest ? (
        <p className="text-body-small">
          {note.role === "mentor" ? "The mentee declined the last version:" : "You declined the last version:"} “{latest.decisionComment}”
        </p>
      ) : null}

      {note.canSend ? (
        <CrudForm
          schema={sessionNoteSchema}
          fields={[{ name: "body", label: "Note", type: "textarea", required: true, description: "The mentee approves it as it is or declines it with a comment." }]}
          defaultValues={{ body: note.prefill ?? "" }}
          submitLabel="Send to the mentee"
          submittingLabel="Sending…"
          onSubmit={(values) => apiCall(`/api/sessions/${encodeURIComponent(sessionId)}/note`, { method: "POST", body: values })}
          onSuccess={() => router.refresh()}
        />
      ) : note.state === "none" ? (
        <p className="text-body-small text-muted-foreground">
          {note.role === "mentor" ? "You can write the note when the session has ended." : "No note yet."}
        </p>
      ) : note.role === "mentor" && note.state === "declined" ? (
        <p className="text-body-small text-muted-foreground">This note reached its version limit. Write to the DevMentor team by email.</p>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="text-body-small text-destructive">
          {error}
        </p>
      )}

      {note.versions.length > 1 ? (
        <details>
          <summary className="cursor-pointer text-body-small">Earlier versions</summary>
          <ol className="mt-related flex flex-col gap-related">
            {note.versions.slice(0, -1).map((version) => (
              <li key={version.version} className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">
                  Version {version.version} · declined: “{version.decisionComment}”
                </span>
                <span className="max-w-prose whitespace-pre-wrap text-body-small">{version.body}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
