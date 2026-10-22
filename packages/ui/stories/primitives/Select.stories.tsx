import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent } from "storybook/test";
import { Field, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../src";

const tags = [
  { value: "typescript", label: "TypeScript" },
  { value: "react", label: "React" },
  { value: "python", label: "Python" },
  { value: "ai-agents", label: "AI agents" },
];

function TagSelect(props: { defaultValue?: string; disabled?: boolean; error?: string; label?: string; preview?: string }) {
  return (
    <div className="max-w-measure">
      <Field label={props.label ?? "Stack tag"} error={props.error}>
        {(control) => (
          <Select defaultValue={props.defaultValue} disabled={props.disabled}>
            <SelectTrigger {...control} data-preview-state={props.preview} tabIndex={props.preview ? -1 : undefined}>
              <SelectValue placeholder="Choose a tag" />
            </SelectTrigger>
            <SelectContent>
              {tags.map((tag) => (
                <SelectItem key={tag.value} value={tag.value}>
                  {tag.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </div>
  );
}

const meta = {
  title: "Primitives/Select",
  component: Select,
  render: () => <TagSelect />,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Stack tag" });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Python" }));
    await expect(trigger).toHaveTextContent("Python");
    await userEvent.keyboard("{Enter}");
    await expect(await screen.findByRole("listbox")).toBeVisible();
    await userEvent.keyboard("{Escape}");
  },
};

export const StateMatrix: Story = {
  render: () => (
    <div className="flex flex-col gap-paragraph">
      {(["default", "hover", "focus"] as const).map((state) => (
        <TagSelect key={state} label={`Stack tag (${state})`} defaultValue="react" preview={state} />
      ))}
      <TagSelect label="Stack tag (error)" error="Choose a stack tag to filter the list." />
      <TagSelect label="Stack tag (disabled)" defaultValue="python" disabled />
    </div>
  ),
};

export const NarrowScreen: Story = {
  render: () => (
    <div className="w-phone">
      <TagSelect defaultValue="ai-agents" />
    </div>
  ),
};
