import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env';
import type { CreatedInvitation, InvitationView, InvitationWithLink } from '../services/invitations/invitation.service';

const { orm, getOrm, getEnv, service, InvitationService } = vi.hoisted(() => {
  const orm = { em: { fork: vi.fn(() => 'forked-em') }, close: vi.fn(async () => undefined) };
  const service = {
    create: vi.fn<(input: unknown, actor: unknown) => Promise<CreatedInvitation>>(),
    revoke: vi.fn<(id: string) => Promise<InvitationView>>(),
    resend: vi.fn<(id: string) => Promise<InvitationWithLink>>(),
    list: vi.fn<(input: unknown) => Promise<InvitationView[]>>(),
  };

  return {
    orm,
    getOrm: vi.fn<(options: unknown) => Promise<typeof orm>>(async () => orm),
    getEnv: vi.fn<() => Env>(),
    service,
    // A constructor returning the shared fake service; the deps it got are in `mock.calls`.
    InvitationService: vi.fn(function InvitationService() {
      return service;
    }),
  };
});
vi.mock('@devmentor/db', async (importOriginal) => ({ ...(await importOriginal<object>()), getOrm }));
vi.mock('../config/env', async (importOriginal) => ({ ...(await importOriginal<object>()), getEnv }));
vi.mock('../services/invitations/invitation.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  InvitationService,
}));

const { parseEnv } = await import('../config/env');
const { SlotService } = await import('../services/availability/slot.service');
const { AccountService } = await import('../services/auth/account.service');
const { InvitationBatchService } = await import('../services/invitations/invitation-batch.service');
const { LogMailer } = await import('../mail/log-mailer');
const { ResendMailer } = await import('../mail/resend-mailer');
const { INVITATIONS_STOPPED_MESSAGE } = await import('../services/invitations/invitation-batch.rules');
const { ConflictError, NotFoundError, ServiceUnavailableError, ValidationError } = await import('../http/errors');
const {
  cliMailSender,
  executeInviteCommand,
  formatAuditLine,
  formatInvitationTable,
  formatTimestamp,
  INVITE_USAGE,
  parseInviteArgs,
  parseTags,
  runInviteCli,
} = await import('./invite-cli');

const ID = '0b9b3f0e-5c3c-4f39-9d55-2a7f0e3b8a11';
const ID_2 = '7d1c2c56-1f7b-4bd5-8a5e-0c4f8f5e9b22';
const NOW = new Date('2026-11-14T20:15:03.456Z');
const LINK = 'http://localhost:3000/invitation/raw-token';
const clock = { now: () => NOW };

function view(overrides: Partial<InvitationView> = {}): InvitationView {
  return {
    id: ID,
    email: 'ada@example.com',
    stackTags: ['typescript', 'react'],
    batch: 'b1',
    status: 'pending',
    createdAt: NOW,
    expiresAt: new Date('2026-11-28T20:15:03.456Z'),
    acceptedAt: null,
    publishDueAt: null,
    revokedAt: null,
    bookableSlots: null,
    d13: null,
    ...overrides,
  };
}

const env = () => parseEnv({ DATABASE_URL: 'postgres://localhost/dev', APP_URL: 'http://localhost:3000' });

function run(argv: string[]) {
  const stdout = vi.fn<(text: string) => void>();
  const stderr = vi.fn<(text: string) => void>();

  return { stdout, stderr, code: runInviteCli({ argv, stdout, stderr }) };
}

const lines = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls.map(([text]) => text);

beforeEach(() => {
  vi.clearAllMocks();
  getEnv.mockReturnValue(env());
});

describe('parseTags', () => {
  it('takes slugs and display names case-insensitively, trimmed, empty items dropped', () => {
    expect(parseTags(' TypeScript, react ,,AI agents,PYTHON')).toEqual(['typescript', 'react', 'ai-agents', 'python']);
  });

  it('gives no tags for a missing option, and passes unknown names on for the service to refuse', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('rust')).toEqual(['rust']);
  });
});

describe('parseInviteArgs', () => {
  it('parses create with every option', () => {
    expect(
      parseInviteArgs(['create', '--email', 'Ada@Example.com', '--tags', 'react,TypeScript', '--batch', 'b1', '--operator', 'lukasz']),
    ).toEqual({ kind: 'create', email: 'Ada@Example.com', tags: ['react', 'typescript'], batch: 'b1', operator: 'lukasz' });
  });

  it('leaves missing create values empty so the service reports each field', () => {
    expect(parseInviteArgs(['create'])).toEqual({ kind: 'create', email: '', tags: [], batch: undefined, operator: '' });
  });

  it('parses revoke, resend and list', () => {
    expect(parseInviteArgs(['revoke', ID])).toEqual({ kind: 'revoke', id: ID });
    expect(parseInviteArgs(['resend', ID])).toEqual({ kind: 'resend', id: ID });
    expect(parseInviteArgs(['list'])).toEqual({ kind: 'list', batch: undefined });
    expect(parseInviteArgs(['list', '--batch=b2'])).toEqual({ kind: 'list', batch: 'b2' });
  });

  it('answers help for --help or -h, with or without a command', () => {
    expect(parseInviteArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseInviteArgs(['create', '-h'])).toEqual({ kind: 'help' });
  });

  it.each([
    [[], 'Give a command: create, revoke, resend or list.'],
    [['invite'], 'Unknown command "invite". Use create, revoke, resend or list.'],
    [['toString'], 'Unknown command "toString". Use create, revoke, resend or list.'],
    [['revoke'], 'revoke takes exactly one invitation id (see `npm run invite -- list`).'],
    [['resend', ID, ID_2], 'resend takes exactly one invitation id (see `npm run invite -- list`).'],
    [['revoke', ID, '--email', 'a@b.c'], 'revoke does not take --email.'],
    [['list', '--email', 'a@b.c', '--operator', 'x'], 'list does not take --email, --operator.'],
    [['list', 'b1'], 'Unexpected argument "b1".'],
    [['create', 'ada@example.com'], 'Unexpected argument "ada@example.com".'],
  ])('refuses %j', (argv, message) => {
    expect(() => parseInviteArgs(argv)).toThrow(message);
  });

  it('refuses unknown options and options without a value', () => {
    expect(() => parseInviteArgs(['list', '--batches', 'b1'])).toThrow(/Unknown option '--batches'/);
    expect(() => parseInviteArgs(['create', '--email'])).toThrow(/--email <value>' argument missing/);
  });
});

describe('formatting', () => {
  it('prints timestamps in UTC to the second', () => {
    expect(formatTimestamp(NOW)).toBe('2026-11-14T20:15:03Z');
  });

  it('builds token-free audit lines', () => {
    expect(formatAuditLine('invited', view(), NOW, 'lukasz')).toBe(
      `2026-11-14T20:15:03Z invited ada@example.com tags=typescript,react batch=b1 by lukasz id=${ID} expires=2026-11-28T20:15:03Z`,
    );
    expect(formatAuditLine('invited', view(), NOW, 'lukasz', 3)).toBe(
      `2026-11-14T20:15:03Z invited ada@example.com tags=typescript,react batch=b1 in-batch=3 by lukasz id=${ID} expires=2026-11-28T20:15:03Z`,
    );
    expect(formatAuditLine('resent', view({ batch: null }), NOW)).toBe(
      `2026-11-14T20:15:03Z resent ada@example.com tags=typescript,react batch=- id=${ID} expires=2026-11-28T20:15:03Z`,
    );
    expect(formatAuditLine('revoked', view(), NOW)).toBe(
      `2026-11-14T20:15:03Z revoked ada@example.com tags=typescript,react batch=b1 id=${ID}`,
    );
  });

  it('lists invitations as an aligned table with a count per status and the D13 columns', () => {
    const accepted = (id: string, email: string, bookableSlots: number, d13: InvitationView['d13']) =>
      view({
        id,
        email,
        stackTags: ['python'],
        batch: null,
        status: 'accepted',
        acceptedAt: new Date('2026-11-15T09:00:00.000Z'),
        publishDueAt: new Date('2026-11-29T09:00:00.000Z'),
        bookableSlots,
        d13,
      });

    expect(
      formatInvitationTable([
        view(),
        accepted(ID_2, 'linus@example.com', 3, 'met'),
        accepted(ID_2, 'grace@example.com', 0, 'pending'),
        accepted(ID_2, 'alan@example.com', 0, 'missed'),
      ]),
    ).toBe(
      [
        'ID                                    Email              Tags              Batch  Status    Created            Expires            Accepted           Publish due        Bookable  D13',
        `${ID}  ada@example.com    typescript,react  b1     pending   2026-11-14T20:15Z  2026-11-28T20:15Z  -                  -                  -         -`,
        `${ID_2}  linus@example.com  python            -      accepted  2026-11-14T20:15Z  2026-11-28T20:15Z  2026-11-15T09:00Z  2026-11-29T09:00Z  3         met`,
        `${ID_2}  grace@example.com  python            -      accepted  2026-11-14T20:15Z  2026-11-28T20:15Z  2026-11-15T09:00Z  2026-11-29T09:00Z  0         pending`,
        `${ID_2}  alan@example.com   python            -      accepted  2026-11-14T20:15Z  2026-11-28T20:15Z  2026-11-15T09:00Z  2026-11-29T09:00Z  0         missed`,
        '',
        '4 invitations (pending 1, accepted 3, expired 0, revoked 0). Times in UTC.',
      ].join('\n'),
    );
    expect(formatInvitationTable([view({ status: 'revoked' })]).split('\n').at(-1)).toBe(
      '1 invitation (pending 0, accepted 0, expired 0, revoked 1). Times in UTC.',
    );
  });

  it('says so when there is nothing to list', () => {
    expect(formatInvitationTable([])).toBe('No invitations.');
    expect(formatInvitationTable([], 'b9')).toBe('No invitations in batch "b9".');
  });
});

describe('executeInviteCommand', () => {
  const out = () => {
    const stdout = vi.fn<(text: string) => void>();
    return { stdout, clock };
  };

  const created = (): CreatedInvitation => ({ invitation: view(), link: LINK, batchNumber: 3, sent: 7 });
  const AUDIT = `2026-11-14T20:15:03Z invited ada@example.com tags=typescript,react batch=b1 in-batch=3 by lukasz id=${ID} expires=2026-11-28T20:15:03Z`;

  it('create with MAIL_PROVIDER=resend confirms the email and prints the audit line, never the link', async () => {
    service.create.mockResolvedValue(created());
    const io = out();

    await executeInviteCommand(
      { kind: 'create', email: 'ada@example.com', tags: ['react'], batch: undefined, operator: ' lukasz ' },
      service,
      { ...io, mailProvider: 'resend' },
    );

    expect(service.create).toHaveBeenCalledWith(
      { email: 'ada@example.com', tags: ['react'], batch: undefined },
      { kind: 'cli', operator: ' lukasz ' },
    );
    expect(io.stdout).toHaveBeenCalledExactlyOnceWith(
      ['Invitation emailed to ada@example.com (batch 3, 7 of 20).', '', 'Audit line for the shared note:', AUDIT].join('\n'),
    );
    expect(JSON.stringify(io.stdout.mock.calls)).not.toContain('raw-token');
  });

  it('create with MAIL_PROVIDER=log says nothing was delivered and prints the link block on stdout', async () => {
    service.create.mockResolvedValue(created());
    const io = out();

    await executeInviteCommand(
      { kind: 'create', email: 'ada@example.com', tags: ['react'], batch: undefined, operator: 'lukasz' },
      service,
      { ...io, mailProvider: 'log' },
    );

    expect(io.stdout).toHaveBeenCalledExactlyOnceWith(
      [
        'MAIL_PROVIDER=log: the email was not delivered.',
        'Invitation link for ada@example.com (shown once; send it by hand):',
        LINK,
        '',
        'Invitation created for ada@example.com (batch 3, 7 of 20).',
        '',
        'Audit line for the shared note:',
        AUDIT,
      ].join('\n'),
    );
  });

  it('resend prints the new link and its audit line', async () => {
    service.resend.mockResolvedValue({ invitation: view(), link: LINK });
    const io = out();

    await executeInviteCommand({ kind: 'resend', id: ID }, service, { ...io, mailProvider: 'resend' });

    expect(service.resend).toHaveBeenCalledWith(ID);
    const [[text]] = io.stdout.mock.calls;
    expect(text.split('\n')).toEqual([
      'Invitation link for ada@example.com (shown once; send it by hand):',
      LINK,
      '',
      'The previous link no longer works. Audit line for the shared note:',
      `2026-11-14T20:15:03Z resent ada@example.com tags=typescript,react batch=b1 id=${ID} expires=2026-11-28T20:15:03Z`,
    ]);
  });

  it('revoke prints the audit line and no link', async () => {
    service.revoke.mockResolvedValue(view({ status: 'revoked', revokedAt: NOW }));
    const io = out();

    await executeInviteCommand({ kind: 'revoke', id: ID }, service, { ...io, mailProvider: 'log' });

    expect(service.revoke).toHaveBeenCalledWith(ID);
    expect(io.stdout).toHaveBeenCalledExactlyOnceWith(
      `Invitation revoked: its link no longer works. Audit line for the shared note:\n2026-11-14T20:15:03Z revoked ada@example.com tags=typescript,react batch=b1 id=${ID}`,
    );
  });

  it('list prints the table of the batch', async () => {
    service.list.mockResolvedValue([]);
    const io = out();

    await executeInviteCommand({ kind: 'list', batch: 'b9' }, service, { ...io, mailProvider: 'log' });

    expect(service.list).toHaveBeenCalledWith({ batch: 'b9' });
    expect(io.stdout).toHaveBeenCalledExactlyOnceWith('No invitations in batch "b9".');
  });
});

describe('runInviteCli', () => {
  it('prints the usage for --help without touching the database', async () => {
    const { stdout, stderr, code } = run(['--help']);

    expect(await code).toBe(0);
    expect(stdout).toHaveBeenCalledExactlyOnceWith(INVITE_USAGE);
    expect(stderr).not.toHaveBeenCalled();
    expect(getEnv).not.toHaveBeenCalled();
    expect(getOrm).not.toHaveBeenCalled();
  });

  it('reports a usage error with the help hint (exit 1)', async () => {
    const { stdout, stderr, code } = run(['explode']);

    expect(await code).toBe(1);
    expect(lines(stderr)).toEqual([
      'Unknown command "explode". Use create, revoke, resend or list.',
      'Run `npm run invite -- --help` for usage.',
    ]);
    expect(stdout).not.toHaveBeenCalled();
    expect(getOrm).not.toHaveBeenCalled();
  });

  it('runs the command through a dedicated quiet ORM and the real service graph, then closes the pool', async () => {
    service.list.mockResolvedValue([view()]);
    const { stdout, stderr, code } = run(['list']);

    expect(await code).toBe(0);
    expect(getOrm).toHaveBeenCalledWith({ clientUrl: 'postgres://localhost/dev', pool: { min: 0, max: 1 }, debug: false });
    const [[deps]] = InvitationService.mock.calls as unknown as [[Record<string, unknown>]];
    expect(deps).toMatchObject({ em: 'forked-em', env: getEnv.mock.results[0].value });
    expect(deps.accountService).toBeInstanceOf(AccountService);
    expect(deps.slotService).toBeInstanceOf(SlotService);
    expect(deps.invitationBatchService).toBeInstanceOf(InvitationBatchService);
    expect(deps.mailSender).toBeInstanceOf(LogMailer);
    expect(lines(stdout)[0]).toContain('ada@example.com');
    expect(stderr).not.toHaveBeenCalled();
    expect(orm.close).toHaveBeenCalledOnce();
  });

  it('create with the log mailer prints the link on stdout only, never on stderr (exit 0)', async () => {
    service.create.mockResolvedValue({ invitation: view(), link: LINK, batchNumber: 1, sent: 1 });
    const { stdout, stderr, code } = run(['create', '--email', 'ada@example.com', '--tags', 'react', '--operator', 'lukasz']);

    expect(await code).toBe(0);
    expect(lines(stdout).join('\n')).toContain(LINK);
    expect(stderr).not.toHaveBeenCalled();
  });

  it('create with MAIL_PROVIDER=resend builds the Resend mailer and prints no link', async () => {
    getEnv.mockReturnValue(
      parseEnv({ DATABASE_URL: 'postgres://localhost/dev', APP_URL: 'http://localhost:3000', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 're_test', MAIL_FROM: 'DevMentor <hello@devmentor.test>' }),
    );
    service.create.mockResolvedValue({ invitation: view(), link: LINK, batchNumber: 1, sent: 1 });
    const { stdout, stderr, code } = run(['create', '--email', 'ada@example.com', '--tags', 'react', '--operator', 'lukasz']);

    expect(await code).toBe(0);
    const [[deps]] = InvitationService.mock.calls as unknown as [[Record<string, unknown>]];
    expect(deps.mailSender).toBeInstanceOf(ResendMailer);
    expect(lines(stdout).join('\n')).not.toContain(LINK);
    expect(lines(stdout)[0]).toContain('Invitation emailed to ada@example.com (batch 1, 1 of 20).');
    expect(stderr).not.toHaveBeenCalled();
  });

  it('resend while stopped prints the stopped message (exit 1)', async () => {
    service.resend.mockRejectedValue(new ConflictError(INVITATIONS_STOPPED_MESSAGE, { code: 'INVITATIONS_STOPPED' }));
    const { stdout, stderr, code } = run(['resend', ID]);

    expect(await code).toBe(1);
    expect(lines(stderr)).toEqual([INVITATIONS_STOPPED_MESSAGE]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('prints service warnings as plain lines on stderr and drops info lines', async () => {
    service.list.mockImplementation(async () => {
      const [[{ logger }]] = InvitationService.mock.calls as unknown as [[{ logger: { info(msg: string): void; warn(msg: string): void } }]];
      logger.info('Invitation created');
      logger.warn('APP_URL is not set: invitation links cannot be built');
      return [];
    });
    const { stderr, code } = run(['list']);

    expect(await code).toBe(0);
    expect(lines(stderr)).toEqual(['warning: APP_URL is not set: invitation links cannot be built']);
  });

  it('prints validation errors per option (exit 1) and still closes the pool', async () => {
    service.create.mockRejectedValue(
      new ValidationError('Invalid invitation.', {
        email: ['Enter a valid email address, e.g. name@example.com.'],
        tags: ['Unknown stack tag. Use: typescript, react, python, ai-agents.'],
      }),
    );
    const { stdout, stderr, code } = run(['create', '--email', 'nope', '--tags', 'rust', '--operator', 'lukasz']);

    expect(await code).toBe(1);
    expect(lines(stderr)).toEqual([
      'Invalid invitation.',
      '  --email: Enter a valid email address, e.g. name@example.com.',
      '  --tags: Unknown stack tag. Use: typescript, react, python, ai-agents.',
    ]);
    expect(stdout).not.toHaveBeenCalled();
    expect(orm.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['revoke', new NotFoundError('Invitation not found.')],
    ['revoke', new ConflictError('An accepted invitation cannot be revoked.')],
    ['resend', new ServiceUnavailableError('Invitations are unavailable.')],
  ] as const)('prints the message of a service error from %s (exit 1)', async (kind, error) => {
    service[kind].mockRejectedValue(error);
    const { stderr, code } = run([kind, ID]);

    expect(await code).toBe(1);
    expect(lines(stderr)).toEqual([error.message]);
  });

  it('reports unexpected failures (env, database) without a stack (exit 1)', async () => {
    getOrm.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    const first = run(['list']);
    expect(await first.code).toBe(1);
    expect(lines(first.stderr)).toEqual(['invite failed: connect ECONNREFUSED 127.0.0.1:5432']);

    getEnv.mockImplementationOnce(() => {
      throw 'not an Error';
    });
    const second = run(['list']);
    expect(await second.code).toBe(1);
    expect(lines(second.stderr)).toEqual(['invite failed: not an Error']);
  });
});

describe('cliMailSender', () => {
  it('picks Resend or the log mailer by MAIL_PROVIDER and writes no warning', () => {
    const logger = { warn: vi.fn(), info: vi.fn() };
    const resendEnv = parseEnv({
      DATABASE_URL: 'postgres://localhost/dev',
      MAIL_PROVIDER: 'resend',
      MAIL_API_KEY: 're_test',
      MAIL_FROM: 'DevMentor <hello@devmentor.test>',
    });

    expect(cliMailSender(resendEnv, logger as never)).toBeInstanceOf(ResendMailer);
    expect(cliMailSender(env(), logger as never)).toBeInstanceOf(LogMailer);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
