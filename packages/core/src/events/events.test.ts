import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger';
import { EventBus } from './events';

const payload = { userId: 'u1', roles: ['mentee', 'operator'] };

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
});
