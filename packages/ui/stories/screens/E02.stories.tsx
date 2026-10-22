import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ErrorMessage } from "../../src";
import { MentorPageView } from "../../src/mentors";
import { MentorListPattern } from "../patterns/MentorListPattern";
import { longTexts, manySlots, marta, prices, slots, tomasz } from "../product/fixtures";
import { PublicFrame } from "./frames";

const meta = {
  title: "Screens/E02 Finding a mentor",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MentorsList: Story = {
  name: "/mentors — results",
  render: () => (
    <PublicFrame>
      <MentorListPattern state={{ kind: "results", tag: null, items: [marta, tomasz, longTexts] }} />
    </PublicFrame>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Find a mentor" })).toBeVisible();
  },
};
export const MentorsFiltered: Story = {
  name: "/mentors?tag=react — filtered",
  render: () => (
    <PublicFrame>
      <MentorListPattern state={{ kind: "results", tag: "react", items: [tomasz] }} />
    </PublicFrame>
  ),
};
export const MentorsLoading: Story = {
  name: "/mentors — loading",
  render: () => (
    <PublicFrame>
      <MentorListPattern state={{ kind: "loading" }} />
    </PublicFrame>
  ),
};
export const MentorsEmpty: Story = {
  name: "/mentors — nobody has open times",
  render: () => (
    <PublicFrame>
      <MentorListPattern state={{ kind: "results", tag: null, items: [] }} />
    </PublicFrame>
  ),
};
export const MentorsEmptyForTag: Story = {
  name: "/mentors?tag=python — none for this tag",
  render: () => (
    <PublicFrame>
      <MentorListPattern state={{ kind: "results", tag: "python", items: [] }} />
    </PublicFrame>
  ),
};
export const MentorsUnknownTag: Story = {
  name: "/mentors?tag=java — unknown tag",
  render: () => (
    <PublicFrame>
      <MentorListPattern state={{ kind: "unknown-tag" }} />
    </PublicFrame>
  ),
};
export const MentorPage: Story = {
  name: "/m/[slug] — bookable",
  render: () => (
    <PublicFrame>
      <MentorPageView {...marta} offerReady prices={prices} slots={slots} />
    </PublicFrame>
  ),
};
export const MentorPageManyTimes: Story = {
  name: "/m/[slug] — many open times",
  render: () => (
    <PublicFrame>
      <MentorPageView {...marta} offerReady prices={prices} slots={manySlots} />
    </PublicFrame>
  ),
};
export const MentorPageNotBookable: Story = {
  name: "/m/[slug] — not bookable yet",
  render: () => (
    <PublicFrame>
      <MentorPageView {...marta} offerReady={false} prices={null} slots={[]} />
    </PublicFrame>
  ),
};
export const MentorPageError: Story = {
  name: "/m/[slug] — cannot load",
  render: () => (
    <PublicFrame>
      <ErrorMessage message="This mentor page cannot be shown right now. Try again in a minute." onRetry={() => undefined} />
    </PublicFrame>
  ),
};
