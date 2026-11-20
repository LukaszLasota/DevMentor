// Client-safe domain primitives (no `server-only`, no I/O): vocabularies, slugs, readiness.
export { defineVocabulary, type Vocabulary, type VocabularyEntry, type VocabularyOption } from './vocabulary';
export { MAX_STACK_TAGS, StackTags, type StackTagKey } from './vocabularies/stack-tags';
export { isReservedSlug, RESERVED_SLUGS, SLUG_FALLBACK, SLUG_MAX_LENGTH, slugCandidate, slugify } from './slug';
export {
  defineReadiness,
  NOT_READY_MESSAGE,
  type Readiness,
  type Requirement,
  type RequirementResult,
} from './readiness';
