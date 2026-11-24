import { describe, expect, it } from 'vitest';
import {
  batchCounts,
  batchState,
  D13_MIN_PUBLISHED,
  INVITATION_BATCH_SIZE,
  invitationStatus,
  stopState,
  type InvitationRowStatus,
  type StatusInput,
} from './invitation-batch.rules';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const DAY_MS = 86_400_000;
const ACCEPTED = new Date('2026-11-01T10:00:00.000Z');
const DUE = new Date(ACCEPTED.getTime() + 14 * DAY_MS);
const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);

function row(overrides: Partial<StatusInput> = {}): StatusInput {
  return { revokedAt: null, acceptedAt: null, expiresAt: ms(NOW, DAY_MS), publishDueAt: null, ...overrides };
}

const accepted = (overrides: Partial<StatusInput> = {}) => row({ acceptedAt: ACCEPTED, publishDueAt: DUE, ...overrides });

describe('constants', () => {
  it('caps a batch at 20 and stops below 5 publishers (R13, D13)', () => {
    expect(INVITATION_BATCH_SIZE).toBe(20);
    expect(D13_MIN_PUBLISHED).toBe(5);
  });
});

describe('invitationStatus (rule 3, first match wins)', () => {
  it('is revoked whenever revokedAt is set', () => {
    expect(invitationStatus(row({ revokedAt: ACCEPTED, expiresAt: ms(NOW, -1) }), [], NOW)).toBe('revoked');
  });

  it('is waiting while not accepted and expiresAt is after now', () => {
    expect(invitationStatus(row({ expiresAt: ms(NOW, 1) }), [], NOW)).toBe('waiting');
  });

  it('is expired when expiresAt is exactly now or earlier', () => {
    expect(invitationStatus(row({ expiresAt: NOW }), [], NOW)).toBe('expired');
    expect(invitationStatus(row({ expiresAt: ms(NOW, -DAY_MS) }), [], NOW)).toBe('expired');
  });

  it('is published for a slot created exactly at acceptedAt or exactly at publishDueAt', () => {
    expect(invitationStatus(accepted(), [ACCEPTED], NOW)).toBe('published');
    expect(invitationStatus(accepted(), [DUE], NOW)).toBe('published');
  });

  it('ignores a slot created 1 ms after publishDueAt or before acceptedAt (re-invited mentor)', () => {
    expect(invitationStatus(accepted(), [ms(DUE, 1)], NOW)).toBe('no_slot_in_window');
    expect(invitationStatus(accepted(), [ms(ACCEPTED, -1)], NOW)).toBe('no_slot_in_window');
  });

  it('is accepted with no slot yet while now is at or before publishDueAt', () => {
    expect(invitationStatus(accepted(), [], DUE)).toBe('accepted_no_slot');
    expect(invitationStatus(accepted(), [], ms(DUE, -1))).toBe('accepted_no_slot');
  });

  it('is no slot within two weeks once now is past publishDueAt', () => {
    expect(invitationStatus(accepted(), [], ms(DUE, 1))).toBe('no_slot_in_window');
  });

  it('treats a null publishDueAt as no deadline known: published after acceptance, else no slot yet, never no_slot_in_window', () => {
    const legacy = accepted({ publishDueAt: null });
    const muchLater = ms(NOW, 365 * DAY_MS);

    expect(invitationStatus(legacy, [ms(ACCEPTED, 100 * DAY_MS)], muchLater)).toBe('published');
    expect(invitationStatus(legacy, [ms(ACCEPTED, -1)], muchLater)).toBe('accepted_no_slot');
    expect(invitationStatus(legacy, [], muchLater)).toBe('accepted_no_slot');
  });
});

describe('batchCounts (rule 4)', () => {
  it('counts sent, accepted and published', () => {
    expect(
      batchCounts([
        { acceptedAt: ACCEPTED, status: 'published' },
        { acceptedAt: ACCEPTED, status: 'no_slot_in_window' },
        { acceptedAt: null, status: 'waiting' },
        { acceptedAt: null, status: 'revoked' },
      ]),
    ).toEqual({ sent: 4, accepted: 2, published: 1 });
    expect(batchCounts([])).toEqual({ sent: 0, accepted: 0, published: 0 });
  });
});

function statuses(published: number, rest: InvitationRowStatus, length = 20): InvitationRowStatus[] {
  return Array.from({ length }, (_, index) => (index < published ? 'published' : rest));
}

describe('stopState (rule 5, batch 1 only)', () => {
  const batch1 = { resumedAt: null };

  it('stops when batch 1 is decided with 4 publishers', () => {
    expect(stopState(batch1, statuses(4, 'no_slot_in_window'))).toEqual({ decided: true, published: 4, stopped: true });
  });

  it('does not stop with 5 publishers', () => {
    expect(stopState(batch1, statuses(5, 'expired'))).toEqual({ decided: true, published: 5, stopped: false });
  });

  it('is undecided while one invitation is still waiting or inside its window', () => {
    for (const pending of ['waiting', 'accepted_no_slot'] as const) {
      const rows = statuses(0, 'revoked');
      rows[19] = pending;
      expect(stopState(batch1, rows)).toEqual({ decided: false, published: 0, stopped: false });
    }
  });

  it('is never decided with fewer than 20 invitations', () => {
    expect(stopState(batch1, statuses(0, 'expired', 19))).toEqual({ decided: false, published: 0, stopped: false });
  });

  it('is lifted by resumedAt and absent without a batch 1', () => {
    expect(stopState({ resumedAt: NOW }, statuses(0, 'expired'))).toEqual({ decided: true, published: 0, stopped: false });
    expect(stopState(null, [])).toEqual({ decided: false, published: 0, stopped: false });
  });
});

describe('batchState', () => {
  it('is stopped for batch 1 and the open batch while stopped, else open or full', () => {
    expect(batchState({ number: 1, closedAt: NOW }, true)).toBe('stopped');
    expect(batchState({ number: 2, closedAt: null }, true)).toBe('stopped');
    expect(batchState({ number: 2, closedAt: NOW }, true)).toBe('full');
    expect(batchState({ number: 1, closedAt: null }, false)).toBe('open');
    expect(batchState({ number: 1, closedAt: NOW }, false)).toBe('full');
  });
});
