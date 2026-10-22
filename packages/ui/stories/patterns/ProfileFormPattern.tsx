import { useState } from "react";
import { z } from "zod";
import { Alert, AlertDescription, apiCall, CrudForm } from "../../src";

// Shape of spec #23's mentorProfileUpdateSchema (shape only; the real one lives in @devmentor/core/validators).
export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name of 1 to 80 characters.").max(80, "Enter a display name of 1 to 80 characters."),
  publicWorkUrl: z.string().trim().url("Enter a link that starts with http:// or https://."),
  bio: z.string().trim().min(1, "Write what you have done (up to 2,000 characters).").max(2000, "Keep it to 2,000 characters."),
  stackTags: z.array(z.string()).min(1, "Pick at least one stack tag.").max(4, "Pick up to four stack tags."),
});

/** The form pattern on /mentor/profile: CrudForm + apiCall + a success message after the server confirms. */
export function ProfileFormPattern() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex max-w-measure flex-col gap-paragraph">
      {saved ? (
        <Alert tone="success">
          <AlertDescription>Profile saved.</AlertDescription>
        </Alert>
      ) : null}
      <CrudForm
        schema={profileSchema}
        fields={[
          { name: "displayName", label: "Display name", required: true, placeholder: "e.g. Marta Kowal" },
          { name: "publicWorkUrl", label: "Link to your public work", inputMode: "url", description: "A repository, article or talk." },
          { name: "bio", label: "What you have done", type: "textarea", description: "Plain words, up to 2,000 characters." },
          {
            name: "stackTags",
            label: "Stack tags",
            type: "multiselect",
            description: "Up to four.",
            options: [
              { value: "typescript", label: "TypeScript" },
              { value: "react", label: "React" },
              { value: "python", label: "Python" },
              { value: "ai-agents", label: "AI agents" },
            ],
          },
        ]}
        defaultValues={{
          displayName: "Marta Kowal",
          publicWorkUrl: "https://github.com/kubernetes/ingress-nginx/pull/12345",
          bio: "Upgraded ingress-nginx to 1.28 on a 40-node cluster.",
          stackTags: ["typescript"],
        }}
        onSubmit={(values) => {
          setSaved(false);
          return apiCall("/api/mentor-profile", { method: "PUT", body: values });
        }}
        onSuccess={() => setSaved(true)}
        onCancel={() => setSaved(false)}
        submitLabel="Save profile"
      />
    </div>
  );
}
