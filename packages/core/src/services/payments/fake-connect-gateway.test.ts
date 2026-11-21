import { describe, expect, it } from 'vitest';
import { FakeConnectGateway } from './fake-connect-gateway';

const TRANSFER = { bookingId: 'b-1', attempt: 1, amountCents: 12000, currency: 'PLN', destination: 'acct_1', sourceTransaction: 'ch_1' };

describe('FakeConnectGateway', () => {
  it('creates one account per mentor, mints links, and lets a test move its state', async () => {
    const gateway = new FakeConnectGateway();

    const first = await gateway.createAccount('m-1');
    const again = await gateway.createAccount('m-1');
    expect(first).toEqual(again);
    expect(first).toMatchObject({ kind: 'ok', data: { id: 'acct_fake_m-1', payoutsEnabled: false, transfers: 'pending' } });
    expect(gateway.configured).toBe(true);

    await expect(gateway.createAccountLink('acct_fake_m-1', 'r', 'f')).resolves.toEqual({ kind: 'ok', data: { url: 'https://connect.fake.test/onboard/acct_fake_m-1/1' } });
    expect(gateway.links).toEqual([{ accountId: 'acct_fake_m-1', returnUrl: 'r', refreshUrl: 'f' }]);

    gateway.update('acct_fake_m-1', { payoutsEnabled: true, transfers: 'active' });
    await expect(gateway.retrieveAccount('acct_fake_m-1')).resolves.toMatchObject({ data: { payoutsEnabled: true, transfers: 'active' } });
    await expect(gateway.retrieveAccount('acct_missing')).resolves.toEqual({ kind: 'rejected', status: 404, code: 'resource_missing' });

    gateway.newAccount = { payoutsEnabled: true };
    await expect(gateway.createAccount('m-2')).resolves.toMatchObject({ data: { payoutsEnabled: true } });
  });

  it('keeps one transfer per key, finds it by booking, and can drop a response after doing it', async () => {
    const gateway = new FakeConnectGateway();

    await expect(gateway.findTransfer('b-1')).resolves.toEqual({ kind: 'ok', data: null });
    gateway.dropNextTransferResponse = true;
    await expect(gateway.createTransfer(TRANSFER)).resolves.toEqual({ kind: 'retryable' });
    await expect(gateway.findTransfer('b-1')).resolves.toEqual({ kind: 'ok', data: { id: 'tr_fake_b-1_1' } });
    await expect(gateway.createTransfer(TRANSFER)).resolves.toEqual({ kind: 'ok', data: { id: 'tr_fake_b-1_1' } });
    expect(gateway.transfers).toHaveLength(1);
  });

  it('answers a scripted failure once on every method', async () => {
    const gateway = new FakeConnectGateway();
    const calls = [
      () => gateway.createAccount('m'),
      () => gateway.createAccountLink('a', 'r', 'f'),
      () => gateway.retrieveAccount('a'),
      () => gateway.findTransfer('b'),
      () => gateway.createTransfer(TRANSFER),
    ];

    for (const call of calls) {
      gateway.nextFailure = { kind: 'retryable' };
      await expect(call()).resolves.toEqual({ kind: 'retryable' });
    }
  });
});
