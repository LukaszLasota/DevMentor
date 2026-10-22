import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Trash2 } from "lucide-react";
import { expect, fn, userEvent } from "storybook/test";
import { Button } from "../../src";

const intents = ["primary", "neutral", "destructive"] as const;
const appearances = ["filled", "outline", "soft", "text"] as const;
const sizes = ["lg", "md", "sm", "xs"] as const;
const states = ["default", "hover", "focus", "pressed"] as const;

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Book session", intent: "primary", appearance: "filled", size: "md", onClick: fn() },
  argTypes: {
    intent: { control: "inline-radio", options: intents },
    appearance: { control: "inline-radio", options: appearances },
    size: { control: "inline-radio", options: sizes },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Book session" });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
    button.blur();
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const IntentsAndAppearances: Story = {
  render: () => (
    <table className="text-body-small">
      <tbody>
        {intents.map((intent) => (
          <tr key={intent}>
            <th scope="row" className="pr-paragraph text-left font-medium">
              {intent}
            </th>
            {appearances.map((appearance) => (
              <td key={appearance} className="p-related">
                <Button intent={intent} appearance={appearance}>
                  {intent === "destructive" ? "Remove slot" : intent === "primary" ? "Book session" : "Cancel"}
                </Button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-related">
      {sizes.map((size) => (
        <Button key={size} {...args} size={size}>
          Size {size}
        </Button>
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-related">
      <Button intent="primary" appearance="filled">
        <Plus aria-hidden="true" />
        Publish slot
      </Button>
      <Button intent="destructive" appearance="outline" iconOnly aria-label="Remove slot">
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <table className="text-body-small">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Intent / appearance</span>
          </th>
          {[...states, "disabled", "loading"].map((state) => (
            <th key={state} scope="col" className="p-related text-left font-medium">
              {state}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(["primary", "neutral", "destructive"] as const).map((intent) =>
          appearances.map((appearance) => (
            <tr key={`${intent}-${appearance}`}>
              <th scope="row" className="pr-paragraph text-left font-medium">
                {intent} / {appearance}
              </th>
              {states.map((state) => (
                <td key={state} className="p-related">
                  <Button intent={intent} appearance={appearance} data-preview-state={state} tabIndex={-1}>
                    Save
                  </Button>
                </td>
              ))}
              <td className="p-related">
                <Button intent={intent} appearance={appearance} disabled>
                  Save
                </Button>
              </td>
              <td className="p-related">
                <Button intent={intent} appearance={appearance} loading loadingLabel="Saving…">
                  Save
                </Button>
              </td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  ),
};

export const DisabledWithReason: Story = {
  render: () => (
    <div className="flex max-w-measure flex-col gap-related">
      <Button intent="primary" appearance="filled" disabled aria-describedby="book-reason">
        Book session
      </Button>
      <p id="book-reason" className="text-caption text-muted-foreground">
        Slots close two hours before they start. Pick a later time.
      </p>
    </div>
  ),
};

export const Loading: Story = {
  args: { loading: true, loadingLabel: "Saving prices…", children: "Save prices" },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /Save prices/ });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(canvas.getByRole("status")).toHaveTextContent("Saving prices…");
  },
};

export const LongLabelNarrowScreen: Story = {
  args: { children: "Publish your first open time so mentees can book you" },
  parameters: { viewport: { value: "mobile1" } },
  render: (args) => (
    <div className="w-72">
      <Button {...args} className="h-auto min-h-button-md w-full whitespace-normal py-related" />
    </div>
  ),
};
