"use client";

import { useEffect, useState } from "react";
import type { InvitationOverview, InvitationSent, OpenedBatch } from "@devmentor/core/http";
import { invitationCreateSchema } from "@devmentor/core/validators";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  apiCall,
  Button,
  CrudForm,
  ErrorMessage,
  InvitationBatchSection,
  LoadingMessage,
  type ApiResult,
} from "@devmentor/ui";

/** Refusals about the address: shown under Email instead of above the button. */
const EMAIL_REFUSALS = ["ALREADY_INVITED", "EMAIL_IS_MENTOR"];

export interface InvitationsBoardProps {
  /** The four stack tags (`StackTags.options()`). */
  tagOptions: { value: string; label: string }[];
  /** The D13 stop sentence, word for word (`INVITATIONS_STOPPED_MESSAGE`). */
  stoppedMessage: string;
}

/**
 * The operator board of /admin/invitations (spec 2026-11-24-invitation-batches, UI/UX): the
 * top-of-page state (stopped banner, open-batch prompt or the invite form) and one section per batch.
 * Every change reloads the overview through `apiCall`, never the page.
 */
export function InvitationsBoard({ tagOptions, stoppedMessage }: InvitationsBoardProps) {
  const [overview, setOverview] = useState<InvitationOverview>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openError, setOpenError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    void apiCall<InvitationOverview>("/api/admin/invitation-batches").then((result) => {
      // Ignore a response that arrives after a newer attempt or unmount.
      if (!isCurrent) {
        return;
      }

      if (result.ok) {
        setOverview(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [attempt]);

  const reload = () => setAttempt((current) => current + 1);

  if (loadError !== null) {
    return <ErrorMessage message={loadError} onRetry={reload} />;
  }

  if (overview === undefined) {
    return <LoadingMessage />;
  }

  async function openBatch() {
    const result = await apiCall<OpenedBatch>("/api/admin/invitation-batches", { method: "POST" });
    setOpenError(result.ok ? null : result.error.message);
    reload();
  }

  async function invite(values: { email: string; stackTags: string[] }): Promise<ApiResult<unknown>> {
    setSentTo(null);
    const result = await apiCall<InvitationSent>("/api/admin/invitations", { method: "POST", body: values });

    if (result.ok) {
      return result;
    }

    if (EMAIL_REFUSALS.includes(result.error.code)) {
      return { ok: false, error: { ...result.error, message: "", fieldErrors: { email: [result.error.message] } } };
    }

    // A batch-state refusal (full, none open, stopped) or a mail failure: the top of the page may change.
    reload();
    return result;
  }

  const openNow = overview.batches.find((batch) => batch.closedAt === null);
  const next = overview.nextBatchNumber;
  let top;

  if (overview.stopped) {
    top = (
      <Alert tone="danger">
        <AlertDescription>{stoppedMessage}</AlertDescription>
      </Alert>
    );
  } else if (openNow !== undefined) {
    top = (
      <section aria-labelledby="invite-heading" className="flex max-w-measure flex-col gap-paragraph">
        <h2 id="invite-heading" className="text-heading-2 font-semibold">
          Invite to batch {openNow.number}
        </h2>
        <CrudForm
          key={formKey}
          schema={invitationCreateSchema}
          fields={[
            { name: "email", label: "Email", type: "email", required: true, autoComplete: "off", placeholder: "anna@example.com" },
            { name: "stackTags", label: "Stack tags", type: "multiselect", options: tagOptions },
          ]}
          submitLabel="Send invitation"
          submittingLabel="Sending…"
          onSubmit={invite}
          onSuccess={(data) => {
            setSentTo((data as InvitationSent).email);
            setFormKey((current) => current + 1);
            reload();
          }}
        />
      </section>
    );
  } else {
    top = (
      <div className="flex flex-col gap-related">
        <p>
          {overview.batches.length === 0
            ? "No batches yet. Open the first batch to start inviting."
            : "This batch is full. Open a new batch to invite more."}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button intent="primary" appearance="filled" className="w-fit">
              Open batch {next}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Open batch {next}?</AlertDialogTitle>
              <AlertDialogDescription>It takes up to 20 invitations.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void openBatch()}>Open batch {next}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-component">
      {top}
      {openError === null ? null : (
        <p role="alert" className="text-body-small text-destructive">
          {openError}
        </p>
      )}
      {sentTo === null ? null : (
        <p role="status" className="text-body-small text-muted-foreground">
          Invitation sent to {sentTo}
        </p>
      )}
      {overview.batches.map((batch) => (
        <InvitationBatchSection
          key={batch.number}
          heading={`Batch ${batch.number}`}
          state={batch.state}
          counts={batch.counts}
          rows={batch.invitations}
        />
      ))}
      {overview.beforeBatches.length === 0 ? null : (
        <InvitationBatchSection heading="Created before batches" rows={overview.beforeBatches} />
      )}
    </div>
  );
}
