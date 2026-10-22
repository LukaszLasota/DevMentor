import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Badge, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../../src";

const slots = [
  { start: "Thu 14 Nov, 18:30", state: "Bookable", tone: "success" as const },
  { start: "Fri 15 Nov, 07:00", state: "Bookable", tone: "success" as const },
  { start: "Fri 15 Nov, 09:30", state: "Closes 2 h before start", tone: "warning" as const },
];

function SlotTable() {
  return (
    <Table>
      <TableCaption>Your open times, in your time zone.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Start</TableHead>
          <TableHead>State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {slots.map((slot) => (
          <TableRow key={slot.start}>
            <TableCell className="font-mono tabular-nums">{slot.start}</TableCell>
            <TableCell>
              <Badge tone={slot.tone}>{slot.state}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const meta = {
  title: "Primitives/Table",
  component: Table,
  render: () => <SlotTable />,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("row")).toHaveLength(4);
    await expect(canvas.getByRole("columnheader", { name: "Start" })).toBeVisible();
  },
};

export const NarrowScreen: Story = {
  render: () => (
    <div className="w-72">
      <SlotTable />
    </div>
  ),
};
