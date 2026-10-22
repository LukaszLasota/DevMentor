import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { Checkbox, Field } from "../../src";

const tags = ["TypeScript", "React", "Python", "AI agents"];

const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  render: (args) => (
    <Field label="TypeScript" inline>
      {(control) => <Checkbox {...control} {...args} />}
    </Field>
  ),
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const checkbox = canvas.getByRole("checkbox", { name: "TypeScript" });
    await userEvent.click(canvas.getByText("TypeScript"));
    await expect(checkbox).toBeChecked();
    await userEvent.keyboard(" ");
    await expect(checkbox).not.toBeChecked();
  },
};

export const StackTags: Story = {
  render: () => (
    <fieldset className="flex flex-col gap-related">
      <legend className="pb-related text-label font-medium">Stack tags</legend>
      {tags.map((tag, index) => (
        <Field key={tag} label={tag} inline>
          {(control) => <Checkbox {...control} defaultChecked={index < 2} />}
        </Field>
      ))}
    </fieldset>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <div className="flex flex-col gap-related">
      {(["default", "hover", "focus"] as const).map((state) => (
        <Field key={state} label={`React (${state})`} inline>
          {(control) => <Checkbox {...control} data-preview-state={state} tabIndex={-1} />}
        </Field>
      ))}
      <Field label="React (checked)" inline>
        {(control) => <Checkbox {...control} defaultChecked />}
      </Field>
      <Field label="Python (error)" inline error="Pick at least one stack tag.">
        {(control) => <Checkbox {...control} />}
      </Field>
      <Field label="AI agents (disabled)" inline hint="Tags are fixed while your page is published.">
        {(control) => <Checkbox {...control} disabled />}
      </Field>
    </div>
  ),
};

export const LongLabelNarrowScreen: Story = {
  render: () => (
    <div className="w-phone">
      <Field label="I agree that my public work link and bio are shown on my share page" inline>
        {(control) => <Checkbox {...control} />}
      </Field>
    </div>
  ),
};
