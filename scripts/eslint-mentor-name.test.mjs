import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Lesson 17 gate (eslint.config.mjs): no inline fallback for a mentor's displayName in core services.
// The rule's RED/GREEN on real commits is in .ai/context/2026-11-23-lesson-17-review.md; this keeps
// the rule itself from being loosened or scoped away without a failing test.
const cwd = fileURLToPath(new URL('../', import.meta.url));
const eslint = new ESLint({ cwd });
const SERVICE = 'packages/core/src/services/bookings/example.service.ts';

async function errors(code, filePath = SERVICE) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').map((message) => message.line);
}

describe('no inline mentor-name fallback in core services', () => {
  it.each([
    ["export const a = (p: { displayName: string | null }) => p.displayName ?? '';"],
    ["export const a = (p: { displayName: string | null }) => p.displayName ?? 'your mentor';"],
    ["export const a = (p: { displayName: string | null }) => p.displayName || 'Your mentor';"],
    ['export const a = (p: { displayName: string | null }, e: string) => p.displayName ?? `${e}`;'],
  ])('flags %s', async (code) => {
    expect(await errors(code)).toEqual([1]);
  }, 30_000);

  it('allows null mapping, the helper itself and code outside core services', async () => {
    expect(await errors('export const a = (p: { displayName: string | null }) => p.displayName ?? null;')).toEqual([]);
    expect(await errors("export const a = (p: { displayName: string | null }) => p.displayName ?? '';", 'packages/core/src/services/mentors/mentor-name.ts')).toEqual([]);
    expect(await errors("export const a = (p: { displayName: string | null }) => p.displayName ?? '';", 'packages/app/src/app/x.ts')).toEqual([]);
  }, 30_000);
});
