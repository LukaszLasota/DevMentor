import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { Field, Input } from "../../src";

const meta = {
  title: "Primitives/Input",
  component: Input,
  args: { placeholder: "e.g. Marta Kowal" },
  render: (args) => (
    <Field label="Display name" hint="Shown on your mentor page">
      {(control) => <Input {...control} {...args} />}
    </Field>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Display name");
    await userEvent.click(input);
    await userEvent.type(input, "Marta Kowal");
    await expect(input).toHaveValue("Marta Kowal");
  },
};

export const Types: Story = {
  render: () => (
    <div className="flex max-w-measure flex-col gap-paragraph">
      <Field label="Email">{(control) => <Input {...control} type="email" autoComplete="email" />}</Field>
      <Field label="Password" hint="12 to 128 characters">
        {(control) => <Input {...control} type="password" autoComplete="new-password" />}
      </Field>
      <Field label="Public work link" hint="A repository, article or talk you are proud of">
        {(control) => <Input {...control} type="url" placeholder="https://github.com/…" />}
      </Field>
    </div>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <div className="flex max-w-measure flex-col gap-paragraph">
      {(["default", "hover", "focus"] as const).map((state) => (
        <Field key={state} label={`Display name (${state})`}>
          {(control) => <Input {...control} data-preview-state={state} tabIndex={-1} defaultValue="Marta Kowal" />}
        </Field>
      ))}
      <Field label="Display name (error)" error="Enter a display name of 1 to 80 characters. It is needed to publish your page.">
        {(control) => <Input {...control} defaultValue="" />}
      </Field>
      <Field label="Email (disabled)" hint="Your sign-in email cannot be changed here.">
        {(control) => <Input {...control} disabled defaultValue="marta@example.com" />}
      </Field>
    </div>
  ),
};

export const LongValueNarrowScreen: Story = {
  render: () => (
    <div className="w-phone">
      <Field label="Public work link">
        {(control) => (
          <Input {...control} defaultValue="https://github.com/kubernetes/ingress-nginx/pull/12345#issuecomment-987654321" />
        )}
      </Field>
    </div>
  ),
};
