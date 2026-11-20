import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger';
import { EventBus, type DomainEvents } from './events';

const payload: DomainEvents['auth.user.roles_changed'] = { userId: 'u1', roles: ['mentee', 'operator'] };

function bus() {
  const logger = { error: vi.fn() };

  return { events: new EventBus({ logger: logger as unknown as Logger }), logger };
}

describe('EventBus', () => {
  it('delivers the payload to every listener in subscription order', async () => {
    const { events } = bus();
    const calls: string[] = [];
    events.on('auth.user.roles_changed', async (p) => {
      calls.push(`first:${p.userId}`);
    });
    events.on('auth.user.roles_changed', (p) => {
      calls.push(`second:${p.roles.join(',')}`);
    });

    await events.emit('auth.user.roles_changed', payload);

    expect(calls).toEqual(['first:u1', 'second:mentee,operator']);
  });

  it('does nothing without listeners', async () => {
    const { events } = bus();

    await expect(events.emit('auth.user.roles_changed', payload)).resolves.toBeUndefined();
  });

  it('stops delivering after unsubscribe', async () => {
    const { events } = bus();
    const listener = vi.fn();
    const off = events.on('auth.user.roles_changed', listener);

    off();
    await events.emit('auth.user.roles_changed', payload);

    expect(listener).not.toHaveBeenCalled();
  });

  it('logs a failing listener and still runs the others', async () => {
    const { events, logger } = bus();
    const failure = new Error('listener broke');
    const after = vi.fn();
    events.on('auth.user.roles_changed', () => {
      throw failure;
    });
    events.on('auth.user.roles_changed', after);

    await events.emit('auth.user.roles_changed', payload);

    expect(after).toHaveBeenCalledWith(payload);
    expect(logger.error).toHaveBeenCalledWith(
      { err: failure, event: 'auth.user.roles_changed' },
      'Domain event listener failed',
    );
  });

  it('keeps listeners of different events apart', async () => {
    const { events } = bus();
    const accepted: DomainEvents['invitations.invitation.accepted'] = {
      invitationId: 'i1',
      userId: 'u1',
      publishDueAt: new Date('2026-12-01T10:00:00.000Z'),
    };
    const onAccepted = vi.fn();
    const onRolesChanged = vi.fn();
    events.on('invitations.invitation.accepted', onAccepted);
    events.on('auth.user.roles_changed', onRolesChanged);

    await events.emit('invitations.invitation.accepted', accepted);

    expect(onAccepted).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(onRolesChanged).not.toHaveBeenCalled();
  });

  it('carries the slot payload of availability.slot.published', async () => {
    const { events } = bus();
    const received: DomainEvents['availability.slot.published'][] = [];
    const slot = { mentorProfileId: 'p1', slotId: 's1', startsAt: new Date('2026-06-22T16:00:00.000Z') };
    events.on('availability.slot.published', (p) => {
      received.push(p);
    });

    await events.emit('availability.slot.published', slot);

    expect(received).toEqual([slot]);
  });
});
