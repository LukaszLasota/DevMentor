import { describe, expect, it } from 'vitest';
import { DECLINE_COMMENT_MESSAGE, NOTE_LENGTH_MESSAGE, sessionNoteDecisionSchema, sessionNoteSchema } from './session-note.schema';

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) => result.error?.issues.map((issue) => issue.message);

describe('sessionNoteSchema', () => {
  it('trims and bounds the note', () => {
    expect(sessionNoteSchema.parse({ body: `  ${'n'.repeat(20)}  `, decision: 'approved' })).toEqual({ body: 'n'.repeat(20) });
    expect(issues(sessionNoteSchema.safeParse({ body: 'short' }))).toEqual([NOTE_LENGTH_MESSAGE]);
    expect(issues(sessionNoteSchema.safeParse({}))).toEqual([NOTE_LENGTH_MESSAGE]);
  });
});

describe('sessionNoteDecisionSchema', () => {
  it('approves a version, or declines it with a trimmed comment', () => {
    expect(sessionNoteDecisionSchema.parse({ decision: 'approved', version: 1, comment: 'ignored' })).toEqual({ decision: 'approved', version: 1 });
    expect(sessionNoteDecisionSchema.parse({ decision: 'declined', version: 2, comment: '  Add the queue part.  ' })).toEqual({
      decision: 'declined',
      version: 2,
      comment: 'Add the queue part.',
    });
  });

  it('needs a comment to decline, a version, and a known decision', () => {
    expect(issues(sessionNoteDecisionSchema.safeParse({ decision: 'declined', version: 1, comment: 'no' }))).toEqual([DECLINE_COMMENT_MESSAGE]);
    expect(issues(sessionNoteDecisionSchema.safeParse({ decision: 'declined', version: 1 }))).toEqual([DECLINE_COMMENT_MESSAGE]);
    expect(issues(sessionNoteDecisionSchema.safeParse({ decision: 'approved', version: 0 }))).toEqual(['Pick the note version you are deciding on.']);
    expect(issues(sessionNoteDecisionSchema.safeParse({ decision: 'approved' }))).toEqual(['Pick the note version you are deciding on.']);
    expect(issues(sessionNoteDecisionSchema.safeParse({ decision: 'maybe', version: 1 }))).toEqual(['Approve or decline the note.']);
  });
});
