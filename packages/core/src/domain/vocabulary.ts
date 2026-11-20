import { z } from 'zod';

// Client-safe domain primitive (spec 2026-10-21-mentor-page): no `server-only`, no I/O.

export interface VocabularyEntry<K extends string> {
  /** Stored value, used in URLs, data and database CHECKs. */
  key: K;
  /** What people read on screen. */
  label: string;
}

export interface VocabularyOption<K extends string> {
  value: K;
  label: string;
}

/**
 * A controlled vocabulary: one definition feeds the Zod enum, the labels and the picker options.
 * Keys keep their declaration order everywhere (`normalize`, `options`).
 */
export interface Vocabulary<K extends string> {
  readonly keys: readonly [K, ...K[]];
  readonly entries: readonly VocabularyEntry<K>[];
  label(key: K): string;
  options(): VocabularyOption<K>[];
  /** Key for a key or a label, case-insensitive and with spaces or dashes alike (`"AI agents"` → `ai-agents`). */
  find(input: string): K | undefined;
  /** Distinct keys in declaration order. */
  normalize(keys: readonly K[]): K[];
  /** `z.enum` over the keys; `message` replaces Zod's default error. */
  schema(message?: string): z.ZodEnum<{ [P in K]: P }>;
}

const comparable = (text: string) => text.trim().toLowerCase().replace(/[\s_-]+/g, '-');

export function defineVocabulary<const K extends string>(
  entries: readonly [VocabularyEntry<K>, ...VocabularyEntry<K>[]],
): Vocabulary<K> {
  const keys = entries.map((entry) => entry.key) as [K, ...K[]];
  const labels = new Map<K, string>(entries.map((entry) => [entry.key, entry.label]));
  const byComparable = new Map<string, K>(
    entries.flatMap((entry) => [
      [comparable(entry.key), entry.key],
      [comparable(entry.label), entry.key],
    ]),
  );

  return {
    keys,
    entries,
    label: (key) => labels.get(key) as string,
    options: () => entries.map((entry) => ({ value: entry.key, label: entry.label })),
    find: (input) => byComparable.get(comparable(input)),
    normalize: (selected) => keys.filter((key) => selected.includes(key)),
    schema: (message) => z.enum(keys, message === undefined ? undefined : { error: message }) as z.ZodEnum<{ [P in K]: P }>,
  };
}
