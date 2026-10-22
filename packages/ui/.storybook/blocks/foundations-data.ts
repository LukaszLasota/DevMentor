// Documentation data for the Foundations pages. Values are never repeated here:
// blocks read the live CSS variables from src/tokens.css.

export type ColorRole = { token: string; role: string; use: string; avoid: string; source: string };

export const colorRoles: ColorRole[] = [
  { token: "--background", role: "Page background", use: "Page and panel fill", avoid: "—", source: "R01.3" },
  { token: "--foreground", role: "Main text", use: "Body text, headings", avoid: "—", source: "R01.3" },
  { token: "--muted", role: "Quiet surface", use: "Fact chips, row hover, code blocks", avoid: "Whole sections", source: "R01.3, R03.3" },
  { token: "--muted-foreground", role: "Secondary text", use: "Author and time, metadata", avoid: "Body text", source: "R01.3, R02.2" },
  { token: "--primary", role: "Primary action", use: "The one main action on a screen", avoid: "Decoration, headings", source: "tokeny.md (trainer)" },
  { token: "--primary-foreground", role: "Text on primary action", use: "Label of the primary button", avoid: "—", source: "contrast" },
  { token: "--link", role: "Link", use: "Links in text", avoid: "Buttons", source: "tokeny.md (trainer)" },
  { token: "--destructive", role: "Destructive", use: "Delete, errors", avoid: "Decoration", source: "tokeny.md (trainer)" },
  { token: "--border", role: "Divider line", use: "Thin lines between rows and sections", avoid: "Field outlines (too faint)", source: "R01.1, R03.2" },
  { token: "--input", role: "Field outline", use: "Outline of inputs, selects, checkboxes", avoid: "Decorative lines", source: "R03.2, WCAG 1.4.11" },
  { token: "--ring", role: "Focus ring", use: "Keyboard focus", avoid: "—", source: "WCAG 2.4.7" },
];

export type ContrastPair = { fg: string; bg: string; kind: "text" | "ui"; note: string };

export const contrastPairs: ContrastPair[] = [
  { fg: "--foreground", bg: "--background", kind: "text", note: "Body text" },
  { fg: "--foreground", bg: "--muted", kind: "text", note: "Text in chips and code blocks" },
  { fg: "--muted-foreground", bg: "--background", kind: "text", note: "Metadata" },
  { fg: "--muted-foreground", bg: "--muted", kind: "text", note: "Metadata on a chip" },
  { fg: "--primary-foreground", bg: "--primary", kind: "text", note: "Primary button label" },
  { fg: "--link", bg: "--background", kind: "text", note: "Link" },
  { fg: "--link", bg: "--muted", kind: "text", note: "Link on a quiet surface" },
  { fg: "--destructive", bg: "--background", kind: "text", note: "Error text" },
  { fg: "--destructive-foreground", bg: "--destructive", kind: "text", note: "Delete button label" },
  { fg: "--input", bg: "--background", kind: "ui", note: "Field outline" },
  { fg: "--ring", bg: "--background", kind: "ui", note: "Focus ring" },
  { fg: "--border", bg: "--background", kind: "ui", note: "Divider (decorative, exempt)" },
];

export type TextStyle = { name: string; className: string; token: string; role: string; sample: string };

export const textStyles: TextStyle[] = [
  { name: "Display", className: "text-display font-semibold", token: "--dm-text-display", role: "Landing headline only", sample: "Get unstuck today" },
  { name: "Heading 1", className: "text-heading-1 font-semibold", token: "--dm-text-heading-1", role: "Page title", sample: "Find a mentor" },
  { name: "Heading 2", className: "text-heading-2 font-semibold", token: "--dm-text-heading-2", role: "Section title", sample: "Open times" },
  { name: "Heading 3", className: "text-heading-3 font-semibold", token: "--dm-text-heading-3", role: "Panel title", sample: "Your prices" },
  { name: "Heading 4", className: "text-heading-4 font-semibold", token: "--dm-text-heading-4", role: "Group title", sample: "Public work" },
  { name: "Body large", className: "text-body-large", token: "--dm-text-body-large", role: "Lead paragraph", sample: "Book a 25- or 50-minute text session with a senior engineer." },
  { name: "Body", className: "text-body", token: "--dm-text-body", role: "Running text", sample: "Mentors who most recently published open times come first." },
  { name: "Body small", className: "text-body-small", token: "--dm-text-body-small", role: "Dense rows, table cells", sample: "Upgraded ingress-nginx to 1.28 on a 40-node cluster." },
  { name: "Label", className: "text-label font-medium", token: "--dm-text-label", role: "Field labels, buttons", sample: "Display name" },
  { name: "Caption", className: "text-caption", token: "--dm-text-caption", role: "Metadata, timestamps", sample: "Published 2 days ago" },
  { name: "Code / price", className: "font-mono text-body-small tabular-nums", token: "--dm-font-code", role: "Code, file names, prices, times (R01.2, R03.1)", sample: "values.yaml · 120.00 PLN · 18:30" },
];

export type Step = { token: string; tailwind: string; relation: string; example: string };

export const spacingSteps: Step[] = [
  { token: "--dm-space-related", tailwind: "gap-related / p-related", relation: "Within a group", example: "Label and field, chips side by side, list row padding" },
  { token: "--dm-space-paragraph", tailwind: "gap-paragraph", relation: "Between paragraphs", example: "Paragraphs, messages in a session (R02.1)" },
  { token: "--dm-space-panel", tailwind: "p-panel", relation: "Inside a panel", example: "Padding of a panel or dialog" },
  { token: "--dm-space-component", tailwind: "gap-component", relation: "Between components", example: "Form and the table below it" },
  { token: "--dm-space-section", tailwind: "mt-section", relation: "Between sections", example: "Sections of a page" },
];

export const radiusSteps: Step[] = [
  { token: "--dm-radius-control", tailwind: "rounded-control", relation: "Small controls", example: "Checkbox, chip, input" },
  { token: "--dm-radius-button", tailwind: "rounded-button", relation: "Buttons", example: "Every button size" },
  { token: "--dm-radius-card", tailwind: "rounded-card", relation: "Cards", example: "Mentor card when it is a link target" },
  { token: "--dm-radius-panel", tailwind: "rounded-panel", relation: "Panels and dialogs", example: "Dialog, onboarding panel" },
];

export const durationSteps: Step[] = [
  { token: "--dm-duration-control", tailwind: "duration-(--dm-duration-control)", relation: "Controls", example: "Hover, focus, pressed" },
  { token: "--dm-duration-menu", tailwind: "duration-(--dm-duration-menu)", relation: "Menus", example: "Menu, popover open/close" },
  { token: "--dm-duration-dialog", tailwind: "duration-(--dm-duration-dialog)", relation: "Dialogs", example: "Dialog open/close" },
];
