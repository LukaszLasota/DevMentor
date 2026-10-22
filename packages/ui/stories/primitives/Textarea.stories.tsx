import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { Field, Textarea } from "../../src";

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
  render: (args) => (
    <div className="max-w-measure">
      <Field label="Bio" hint="What you have done, in plain words. Up to 2,000 characters.">
        {(control) => <Textarea {...control} {...args} />}
      </Field>
    </div>
  ),
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const textarea = canvas.getByLabelText("Bio");
    await userEvent.type(textarea, "Upgraded ingress-nginx to 1.28 on a 40-node cluster.");
    await expect(textarea).toHaveValue("Upgraded ingress-nginx to 1.28 on a 40-node cluster.");
  },
};

export const StateMatrix: Story = {
  render: () => (
    <div className="flex max-w-measure flex-col gap-paragraph">
      {(["default", "hover", "focus"] as const).map((state) => (
        <Field key={state} label={`Bio (${state})`}>
          {(control) => <Textarea {...control} data-preview-state={state} tabIndex={-1} defaultValue="Platform engineer, Kubernetes and Helm." />}
        </Field>
      ))}
      <Field label="Bio (error)" error="Keep the bio to 2,000 characters. It now has 2,140.">
        {(control) => <Textarea {...control} defaultValue="Platform engineer…" />}
      </Field>
      <Field label="Bio (disabled)" hint="Unpublish your page to edit the bio.">
        {(control) => <Textarea {...control} disabled defaultValue="Platform engineer, Kubernetes and Helm." />}
      </Field>
    </div>
  ),
};

export const LongTextNarrowScreen: Story = {
  render: () => (
    <div className="w-phone">
      <Field label="Bio">
        {(control) => (
          <Textarea
            {...control}
            defaultValue="I run the platform team at a 200-person company. Last quarter I upgraded ingress-nginx to 1.28 across 40 nodes without downtime, moved our Helm charts to OCI registries and wrote the runbook the on-call team still uses. Ask me about Helm upgrades that broke staging on a Friday."
          />
        )}
      </Field>
    </div>
  ),
};
