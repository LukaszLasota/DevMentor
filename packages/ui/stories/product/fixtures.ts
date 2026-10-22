// Story data taken from the specs (#23–#28): vocabulary, copy, price examples. Names and links are
// invented but realistic; no ratings, counts or client names (prompt rule 7, N02).
import type { MentorCardProps, MentorPageSlot } from "../../src/mentors";

export const prices = { price25: "$40.00", price50: "$75.00" };

export const marta: MentorCardProps = {
  slug: "marta-kowal",
  displayName: "Marta Kowal",
  avatarUrl: null,
  publicWorkUrl: "https://github.com/kubernetes/ingress-nginx/pull/12345",
  bio: "Platform engineer. Upgraded ingress-nginx to 1.28 on a 40-node cluster without downtime and wrote the Helm runbook our on-call team uses.",
  stackTags: ["typescript", "ai-agents"],
  prices,
  nextBookableSlotAt: "2026-11-05T17:30:00Z",
};

export const tomasz: MentorCardProps = {
  slug: "tomasz-wrona",
  displayName: "Tomasz Wrona",
  avatarUrl: null,
  publicWorkUrl: "https://tomaszwrona.dev/posts/react-server-components-migration",
  bio: "Moved a 120-route React app to server components; happy to look at your estimate before you quote a client.",
  stackTags: ["react", "typescript"],
  prices: { price25: "$35.00", price50: "$60.00" },
  nextBookableSlotAt: "2026-11-06T08:00:00Z",
};

export const longTexts: MentorCardProps = {
  ...marta,
  slug: "aleksandra-nowakowska-wisniewska",
  displayName: "Aleksandra Nowakowska-Wiśniewska",
  publicWorkUrl: "https://github.com/some-organisation-with-a-long-name/an-even-longer-repository-name/pull/98765",
  bio: "I run the platform team at a 200-person company. Last quarter I upgraded ingress-nginx to 1.28 across 40 nodes without downtime, moved our Helm charts to OCI registries and wrote the runbook the on-call team still uses. Ask me about Helm upgrades that broke staging on a Friday ev…",
  stackTags: ["typescript", "react", "python", "ai-agents"],
};

export const slots: MentorPageSlot[] = [
  { id: "s1", startsAt: "2026-11-05T09:00:00Z", meetsLeadTime: false },
  { id: "s2", startsAt: "2026-11-05T17:30:00Z", meetsLeadTime: true },
  { id: "s3", startsAt: "2026-11-06T08:00:00Z", meetsLeadTime: true },
];

export const manySlots: MentorPageSlot[] = Array.from({ length: 14 }, (_, i) => ({
  id: `m${i}`,
  startsAt: new Date(Date.UTC(2026, 10, 5 + Math.floor(i / 2), i % 2 ? 17 : 8, 30)).toISOString(),
  meetsLeadTime: i > 0,
}));
