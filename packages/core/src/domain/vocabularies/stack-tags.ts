import { defineVocabulary } from '../vocabulary';

/**
 * Beachhead stack tags (D24): the only tags a mentor page or an invitation can carry. The
 * `invitations.stack_tags` and `mentor_profiles.stack_tags` CHECKs in `@devmentor/db` hand-write the
 * same keys; `stack-tags.test.ts` fails when they drift.
 */
export const StackTags = defineVocabulary([
  { key: 'typescript', label: 'TypeScript' },
  { key: 'react', label: 'React' },
  { key: 'python', label: 'Python' },
  { key: 'ai-agents', label: 'AI agents' },
]);

export type StackTagKey = (typeof StackTags.keys)[number];

/** A page carries at most this many tags (all four). */
export const MAX_STACK_TAGS = StackTags.keys.length;
