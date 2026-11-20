"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionMessageView, SessionView } from "@devmentor/core/http";
import { apiCall, Button, Label, LocalTime, Textarea } from "@devmentor/ui";

/** How often an open (or not yet open) chat asks for new messages. */
export const SESSION_POLL_MS = 3_000;

/** Adds `incoming` after `current`, skipping any message already there (a send and a poll can both bring it). */
function merge(current: SessionMessageView[], incoming: SessionMessageView[]): SessionMessageView[] {
  const known = new Set(current.map((message) => message.id));

  return [...current, ...incoming.filter((message) => !known.has(message.id))].sort((a, b) => a.seq - b.seq);
}

/**
 * The text exchange of /sessions/[id] (spec 2026-11-20-text-session, AC1): the conversation, and while
 * the chat is open a composer (Ctrl/Cmd+Enter sends). New messages arrive by polling
 * `GET /api/sessions/[id]?after=<seq>` every few seconds until the chat closes; polling pauses while
 * the tab is hidden. A live region announces the other party's new messages.
 */
export function SessionChat({ initial }: { initial: SessionView }) {
  const [messages, setMessages] = useState(initial.messages);
  const [phase, setPhase] = useState(initial.phase);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const last = useRef(initial.messages.at(-1)?.seq ?? 0);
  const otherName = initial.otherParty.displayName;

  const receive = useCallback(
    (incoming: SessionMessageView[]) => {
      if (incoming.length === 0) {
        return;
      }

      last.current = Math.max(last.current, ...incoming.map((message) => message.seq));
      setMessages((current) => merge(current, incoming));

      const theirs = incoming.filter((message) => !message.mine).length;

      if (theirs > 0) {
        setAnnouncement(`${theirs} new message${theirs === 1 ? "" : "s"} from ${otherName}.`);
      }
    },
    [otherName],
  );

  useEffect(() => {
    if (phase === "closed") {
      return;
    }

    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void apiCall<SessionView>(`/api/sessions/${encodeURIComponent(initial.id)}?after=${last.current}`).then((result) => {
        setReconnecting(!result.ok);

        if (result.ok) {
          setPhase(result.data.phase);
          receive(result.data.messages);
        }
      });
    }, SESSION_POLL_MS);

    return () => clearInterval(timer);
  }, [initial.id, phase, receive]);

  async function send() {
    const body = draft.trim();

    if (body === "" || sending) {
      return;
    }

    setSending(true);
    const result = await apiCall<SessionMessageView>(`/api/sessions/${encodeURIComponent(initial.id)}/messages`, { method: "POST", body: { body } });
    setSending(false);

    if (result.ok) {
      setDraft("");
      setError(null);
      receive([result.data]);
    } else {
      setError(result.error.message);
    }
  }

  return (
    <section aria-labelledby="chat-heading" className="flex flex-col gap-related">
      <h2 id="chat-heading" className="text-heading-3 font-semibold">
        Conversation
      </h2>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {messages.length === 0 ? (
        <p className="text-body-small text-muted-foreground">No messages yet.</p>
      ) : (
        <ol className="flex flex-col gap-related">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`flex max-w-prose flex-col gap-1 rounded-control px-paragraph py-related ${message.mine ? "self-end bg-muted" : "self-start border border-border"}`}
            >
              <span className="text-caption text-muted-foreground">
                {message.mine ? "You" : initial.otherParty.displayName} · <LocalTime iso={message.createdAt} />
              </span>
              <span className="whitespace-pre-wrap text-body">{message.body}</span>
            </li>
          ))}
        </ol>
      )}
      {reconnecting ? (
        <p role="status" className="text-body-small text-muted-foreground">
          Reconnecting…
        </p>
      ) : null}
      {phase === "open" ? (
        <form
          className="flex flex-col gap-related"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Label htmlFor="session-message">Message</Label>
          <Textarea
            id="session-message"
            value={draft}
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button type="submit" className="w-fit" disabled={sending || draft.trim() === ""}>
            {sending ? "Sending…" : "Send"}
          </Button>
          {error === null ? null : (
            <p role="alert" className="text-body-small text-destructive">
              {error}
            </p>
          )}
        </form>
      ) : phase === "not_started" ? (
        <p className="text-body-small text-muted-foreground">
          This session opens at <LocalTime iso={initial.startsAt} />.
        </p>
      ) : (
        <p className="text-body-small text-muted-foreground">The chat is closed.</p>
      )}
    </section>
  );
}
