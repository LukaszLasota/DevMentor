import { z } from 'zod';
import { MAX_STACK_TAGS, StackTags } from '../../domain/vocabularies/stack-tags';
import { emailField } from '../auth/fields';

// `POST /api/admin/invitations` and the /admin/invitations form (spec 2026-11-24-invitation-batches).
// Shape only: whether a batch is open, the address already invited or a mentor is the service's call.

export const STACK_TAG_REQUIRED_MESSAGE = 'Pick at least one stack tag.';
export const STACK_TAG_UNKNOWN_MESSAGE = 'Pick from TypeScript, React, Python and AI agents.';
export const STACK_TAG_DUPLICATE_MESSAGE = 'Each stack tag only once.';
export const STACK_TAGS_TOO_MANY_MESSAGE = 'Pick up to four stack tags.';

export const invitationCreateSchema = z.strictObject({
  email: emailField,
  stackTags: z
    .array(StackTags.schema(STACK_TAG_UNKNOWN_MESSAGE), { error: STACK_TAG_REQUIRED_MESSAGE })
    // One check, so one message (lesson 2026-11-14).
    .superRefine((tags, ctx) => {
      let message: string | null = null;

      if (tags.length === 0) {
        message = STACK_TAG_REQUIRED_MESSAGE;
      } else if (tags.length > MAX_STACK_TAGS) {
        message = STACK_TAGS_TOO_MANY_MESSAGE;
      } else if (new Set(tags).size !== tags.length) {
        message = STACK_TAG_DUPLICATE_MESSAGE;
      }

      if (message !== null) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
});

export type InvitationCreateInput = z.output<typeof invitationCreateSchema>;
