"use client";

import type { MentorOwnerView } from "@devmentor/core/http";
import { mentorProfileUpdateSchema, type StackTagKey } from "@devmentor/core/validators";
import {
  Alert,
  AlertDescription,
  apiCall,
  CopyShareLink,
  CrudForm,
  ProfileActions,
  ReadinessChecklist,
  type FieldErrors,
} from "@devmentor/ui";
import { MentorPageView } from "@devmentor/ui/mentors";
import { useState } from "react";

/** Checklist and form labels, keyed by the readiness keys (= form field names). */
const LABELS: Record<MentorOwnerView["readiness"][number]["key"], string> = {
  displayName: "Display name",
  publicWorkUrl: "Link to your public work",
  bio: "What you have done",
  stackTags: "At least one stack tag",
};

export interface ProfileEditorProps {
  initial: MentorOwnerView;
  tagOptions: { value: StackTagKey; label: string }[];
  /** `${APP_URL}/m/`; the slug is appended. */
  shareBase: string;
}

/**
 * The mentor's page editor (spec 2026-10-21-mentor-page, UI/UX): save a draft at any time, publish
 * once the checklist is complete (a refused publish names each missing item on its field), then the
 * share link with Copy link and Unpublish. The preview is the same component visitors see.
 */
export function ProfileEditor({ initial, tagOptions, shareBase }: ProfileEditorProps) {
  const [own, setOwn] = useState(initial);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [publishErrors, setPublishErrors] = useState<FieldErrors | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const published = own.publishedAt !== null;
  const complete = own.readiness.every((item) => item.met);

  async function act(action: "publish" | "unpublish") {
    setBusy(true);
    setNotice(null);
    const result = await apiCall<MentorOwnerView>(`/api/mentors/me/${action}`, { method: "POST" });
    setBusy(false);

    if (result.ok) {
      setOwn(result.data);
      setPublishErrors(undefined);
      setNotice({ tone: "success", text: action === "publish" ? "Your page is published." : "Your page is hidden." });
      return;
    }

    setNotice({ tone: "danger", text: result.error.message });
    if (result.error.fieldErrors) {
      setPublishErrors({ ...result.error.fieldErrors });
    }
  }

  return (
    <>
      <h1 className="text-heading-1 font-semibold">Your page</h1>
      <div className="grid gap-component lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-component">
          {notice ? (
            <Alert tone={notice.tone}>
              <AlertDescription>{notice.text}</AlertDescription>
            </Alert>
          ) : null}
          <CrudForm
            schema={mentorProfileUpdateSchema}
            fields={[
              { name: "displayName", label: "Display name", placeholder: "e.g. Marta Kowal", autoComplete: "name" },
              {
                name: "publicWorkUrl",
                label: "Link to your public work",
                inputMode: "url",
                placeholder: "https://github.com/you/project",
                description: "A repository, pull request, article or talk.",
              },
              { name: "bio", label: "What you have done", type: "textarea", description: "Plain words, up to 2,000 characters." },
              { name: "stackTags", label: "Stack tags", type: "multiselect", description: "Pick one to four.", options: tagOptions },
            ]}
            defaultValues={{
              displayName: own.displayName ?? "",
              publicWorkUrl: own.publicWorkUrl ?? "",
              bio: own.bio ?? "",
              stackTags: own.stackTags,
            }}
            errors={publishErrors}
            submitLabel={published ? "Save changes" : "Save draft"}
            onSubmit={(values) => {
              setNotice(null);
              return apiCall<MentorOwnerView>("/api/mentors/me", { method: "PUT", body: values });
            }}
            onSuccess={(data) => {
              setOwn(data as MentorOwnerView);
              setPublishErrors(undefined);
              setNotice({ tone: "success", text: "Saved." });
            }}
          />
          {published ? null : (
            <ReadinessChecklist
              title="Before you can publish"
              items={own.readiness.map((item) => ({ key: item.key, label: LABELS[item.key], met: item.met }))}
            />
          )}
          {published && own.slug ? <CopyShareLink url={`${shareBase}${own.slug}`} /> : null}
          <ProfileActions
            published={published}
            busy={busy}
            onPublish={() => void act("publish")}
            onUnpublish={() => void act("unpublish")}
          />
        </div>
        <section aria-labelledby="preview-title" className="flex min-w-0 flex-col gap-paragraph rounded-card border border-dashed border-border p-panel">
          <h2 id="preview-title" className="text-heading-4 font-semibold">
            Preview: what visitors see
          </h2>
          {complete ? (
            <MentorPageView
              displayName={own.displayName as string}
              avatarUrl={own.avatarUrl}
              publicWorkUrl={own.publicWorkUrl as string}
              bio={own.bio as string}
              stackTags={own.stackTags}
              offerReady={false}
              prices={null}
              slots={[]}
            />
          ) : (
            <p className="text-body-small text-muted-foreground">The preview appears once the four items above are saved.</p>
          )}
        </section>
      </div>
    </>
  );
}
