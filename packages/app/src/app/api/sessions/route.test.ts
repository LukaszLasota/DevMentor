// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // The behaviour is tested in core (`sessions.test.ts`, through the real apiHandler) and over HTTP in
  // `integration/text-session.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  getSession: 'getSession',
  sendSessionMessage: 'sendSessionMessage',
  submitSessionAnswer: 'submitSessionAnswer',
  getSessionNote: 'getSessionNote',
  sendSessionNote: 'sendSessionNote',
  decideSessionNote: 'decideSessionNote',
  SESSION_RESPONSE: 'SESSION_RESPONSE',
}));

describe('session routes', () => {
  it('GET /api/sessions/[id] wires getSession with no-store', async () => {
    expect((await import('./[id]/route')).GET).toEqual({ handler: 'getSession', options: 'SESSION_RESPONSE' });
  });

  it('POST /api/sessions/[id]/messages wires sendSessionMessage with no-store', async () => {
    expect((await import('./[id]/messages/route')).POST).toEqual({ handler: 'sendSessionMessage', options: 'SESSION_RESPONSE' });
  });

  it('POST /api/sessions/[id]/answer wires submitSessionAnswer with no-store', async () => {
    expect((await import('./[id]/answer/route')).POST).toEqual({ handler: 'submitSessionAnswer', options: 'SESSION_RESPONSE' });
  });

  it('/api/sessions/[id]/note wires GET getSessionNote and POST sendSessionNote; decision wires decideSessionNote', async () => {
    const note = await import('./[id]/note/route');
    expect(note.GET).toEqual({ handler: 'getSessionNote', options: 'SESSION_RESPONSE' });
    expect(note.POST).toEqual({ handler: 'sendSessionNote', options: 'SESSION_RESPONSE' });
    expect((await import('./[id]/note/decision/route')).POST).toEqual({ handler: 'decideSessionNote', options: 'SESSION_RESPONSE' });
  });
});
