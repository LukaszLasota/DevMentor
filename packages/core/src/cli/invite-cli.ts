import { parseArgs } from 'node:util';
import { getOrm, type EntityManager } from '@devmentor/db';
import { getEnv, type Env } from '../config/env';
import { EventBus } from '../events/events';
import { isAppError, isValidationError } from '../http/errors';
import { createLogger, type Logger } from '../logger';
import { LogMailer } from '../mail/log-mailer';
import { PasswordHasher } from '../security/password';
import { RateLimiter } from '../security/rate-limit';
import { AccountService } from '../services/auth/account.service';
import { InvitationService, type InvitationView } from '../services/invitations/invitation.service';
import { systemClock, type Clock } from '../time/clock';

export const INVITE_USAGE = `Mentor invitations (spec 2026-10-21-mentor-invitations). Send the printed link by hand.

Usage:
  npm run invite -- create --email <email> --tags <tag,...> [--batch <name>] --operator <name>
  npm run invite -- revoke <id>
  npm run invite -- resend <id>
  npm run invite -- list [--batch <name>]
  npm run invite -- --help

Tags: typescript, react, python, ai-agents (display names such as "TypeScript" or "AI agents" work too).
create and resend print the link once: it is not stored and cannot be shown again (resend makes a new one).
Times are UTC.`;

const HELP_HINT = 'Run `npm run invite -- --help` for usage.';

/** A command line the CLI cannot run: printed with the usage hint, exit code 1. */
export class InviteUsageError extends Error {}

export type InviteCommand =
  | { kind: 'help' }
  | { kind: 'create'; email: string; tags: string[]; batch?: string; operator: string }
  | { kind: 'revoke'; id: string }
  | { kind: 'resend'; id: string }
  | { kind: 'list'; batch?: string };

type OptionName = 'email' | 'tags' | 'batch' | 'operator';

const ALLOWED_OPTIONS: Record<Exclude<InviteCommand['kind'], 'help'>, readonly OptionName[]> = {
  create: ['email', 'tags', 'batch', 'operator'],
  revoke: [],
  resend: [],
  list: ['batch'],
};

function isCommandKind(value: string): value is keyof typeof ALLOWED_OPTIONS {
  return Object.hasOwn(ALLOWED_OPTIONS, value);
}

/**
 * Stack tags from `--tags`: comma-separated, case-insensitive, slugs or display names
 * ("AI agents" → `ai-agents`). Unknown names pass through for the service to refuse by name.
 */
export function parseTags(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((tag) => tag.length > 0);
}

/**
 * `npm run invite -- <command> …` → a command. Only syntax is checked here; the values (email,
 * tags, operator, id) are validated by `InvitationService`, the one source of those rules.
 */
export function parseInviteArgs(argv: readonly string[]): InviteCommand {
  let parsed;

  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        email: { type: 'string' },
        tags: { type: 'string' },
        batch: { type: 'string' },
        operator: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    throw new InviteUsageError((error as Error).message);
  }

  const { values, positionals } = parsed;

  if (values.help === true) {
    return { kind: 'help' };
  }

  const [kind, ...rest] = positionals;

  if (kind === undefined) {
    throw new InviteUsageError('Give a command: create, revoke, resend or list.');
  }

  if (!isCommandKind(kind)) {
    throw new InviteUsageError(`Unknown command "${kind}". Use create, revoke, resend or list.`);
  }

  const allowed = ALLOWED_OPTIONS[kind];
  const extra = (Object.keys(values) as OptionName[]).filter((name) => !allowed.includes(name));

  if (extra.length > 0) {
    throw new InviteUsageError(`${kind} does not take ${extra.map((name) => `--${name}`).join(', ')}.`);
  }

  if (kind === 'revoke' || kind === 'resend') {
    if (rest.length !== 1) {
      throw new InviteUsageError(`${kind} takes exactly one invitation id (see \`npm run invite -- list\`).`);
    }

    return { kind, id: rest[0] };
  }

  if (rest.length > 0) {
    throw new InviteUsageError(`Unexpected argument "${rest[0]}".`);
  }

  if (kind === 'list') {
    return { kind, batch: values.batch };
  }

  return {
    kind,
    email: values.email ?? '',
    tags: parseTags(values.tags),
    batch: values.batch,
    operator: values.operator ?? '',
  };
}

/** UTC to the second, without milliseconds: `2026-11-14T20:15:03Z`. */
export function formatTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** UTC to the minute for the list table, or `-`. */
function formatTableDate(date: Date | null): string {
  return date === null ? '-' : `${date.toISOString().slice(0, 16)}Z`;
}

/**
 * The token-free line the operator pastes into the shared note (R16: operator actions by hand are
 * logged), e.g. `2026-11-14T20:15:03Z invited ada@example.com tags=react,typescript batch=b1 by
 * lukasz id=… expires=…`.
 */
export function formatAuditLine(
  action: 'invited' | 'revoked' | 'resent',
  invitation: InvitationView,
  at: Date,
  operator?: string,
): string {
  return [
    formatTimestamp(at),
    action,
    invitation.email,
    `tags=${invitation.stackTags.join(',')}`,
    `batch=${invitation.batch ?? '-'}`,
    ...(operator === undefined ? [] : [`by ${operator}`]),
    `id=${invitation.id}`,
    ...(action === 'revoked' ? [] : [`expires=${formatTimestamp(invitation.expiresAt)}`]),
  ].join(' ');
}

/** Aligned table of invitations with a per-status count; never a token. */
export function formatInvitationTable(invitations: readonly InvitationView[], batch?: string): string {
  if (invitations.length === 0) {
    return batch === undefined ? 'No invitations.' : `No invitations in batch "${batch}".`;
  }

  const rows = [
    ['ID', 'Email', 'Tags', 'Batch', 'Status', 'Created', 'Expires', 'Accepted', 'Publish due'],
    ...invitations.map((invitation) => [
      invitation.id,
      invitation.email,
      invitation.stackTags.join(','),
      invitation.batch ?? '-',
      invitation.status,
      formatTableDate(invitation.createdAt),
      formatTableDate(invitation.expiresAt),
      formatTableDate(invitation.acceptedAt),
      formatTableDate(invitation.publishDueAt),
    ]),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const table = rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd());
  const counts = (['pending', 'accepted', 'expired', 'revoked'] as const)
    .map((status) => `${status} ${invitations.filter((invitation) => invitation.status === status).length}`)
    .join(', ');
  const noun = invitations.length === 1 ? 'invitation' : 'invitations';

  return [...table, '', `${invitations.length} ${noun} (${counts}). Times in UTC.`].join('\n');
}

function linkBlock(email: string, link: string): string[] {
  return [`Invitation link for ${email} (shown once; send it by hand):`, link, ''];
}

export type InviteOperations = Pick<InvitationService, 'create' | 'revoke' | 'resend' | 'list'>;

/** Runs one parsed command against the service and prints its result. */
export async function executeInviteCommand(
  command: Exclude<InviteCommand, { kind: 'help' }>,
  service: InviteOperations,
  { stdout, clock }: { stdout: (text: string) => void; clock: Clock },
): Promise<void> {
  switch (command.kind) {
    case 'create': {
      const { email, tags, batch, operator } = command;
      const { invitation, link } = await service.create({ email, tags, batch, operator });

      stdout(
        [
          ...linkBlock(invitation.email, link),
          'Audit line for the shared note:',
          formatAuditLine('invited', invitation, clock.now(), operator.trim()),
        ].join('\n'),
      );
      return;
    }
    case 'resend': {
      const { invitation, link } = await service.resend(command.id);

      stdout(
        [
          ...linkBlock(invitation.email, link),
          'The previous link no longer works. Audit line for the shared note:',
          formatAuditLine('resent', invitation, clock.now()),
        ].join('\n'),
      );
      return;
    }
    case 'revoke': {
      const invitation = await service.revoke(command.id);

      stdout(
        ['Invitation revoked: its link no longer works. Audit line for the shared note:', formatAuditLine('revoked', invitation, clock.now())].join(
          '\n',
        ),
      );
      return;
    }
    case 'list':
      stdout(formatInvitationTable(await service.list({ batch: command.batch }), command.batch));
  }
}

/**
 * The service graph the CLI needs, built by hand instead of the request container: the container
 * turns on the SQL debug log in development and resolves the mailer eagerly (its warning), which
 * would bury the one-time link. Nothing here sends mail; `AccountService` is only needed by
 * `accept`, which the CLI never calls.
 */
function invitationServiceFor(em: EntityManager, env: Env, logger: Logger): InvitationService {
  const clock = systemClock;
  const events = new EventBus({ logger });
  const accountService = new AccountService({
    em,
    env,
    clock,
    events,
    logger,
    mailSender: new LogMailer({ logger }),
    passwordHasher: new PasswordHasher({ concurrency: env.PASSWORD_HASH_CONCURRENCY, waitMs: env.PASSWORD_HASH_WAIT_MS }),
    rateLimiter: new RateLimiter({ em, clock, logger }),
  });

  return new InvitationService({ em, env, clock, events, logger, accountService });
}

/** Warnings and errors of the services as plain `warning: <msg>` lines on stderr; info lines are dropped. */
function cliLogger(stderr: (line: string) => void): Logger {
  const logger = createLogger({
    write: (line: string) => stderr(`warning: ${(JSON.parse(line) as { msg: string }).msg}`),
  });
  logger.level = 'warn';

  return logger;
}

function reportError(error: unknown, stderr: (line: string) => void): void {
  if (isValidationError(error)) {
    stderr(error.message);

    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      stderr(`  --${field}: ${messages.join(' ')}`);
    }

    return;
  }

  if (isAppError(error)) {
    stderr(error.message);
    return;
  }

  stderr(`invite failed: ${error instanceof Error ? error.message : String(error)}`);
}

export interface InviteCliOptions {
  argv: readonly string[];
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * `npm run invite -- …`: the operator's by-hand invitation tool (R16). Parses before touching the
 * database (so `--help` and usage errors need none), then runs the command on a dedicated quiet ORM
 * with one connection and closes it. Returns the exit code: 0, or 1 with the reason on stderr.
 */
export async function runInviteCli({ argv, stdout, stderr }: InviteCliOptions): Promise<number> {
  let command: InviteCommand;

  try {
    command = parseInviteArgs(argv);
  } catch (error) {
    stderr((error as InviteUsageError).message);
    stderr(HELP_HINT);
    return 1;
  }

  if (command.kind === 'help') {
    stdout(INVITE_USAGE);
    return 0;
  }

  try {
    const env = getEnv();
    const orm = await getOrm({ clientUrl: env.DATABASE_URL, pool: { min: 0, max: 1 }, debug: false });

    try {
      const service = invitationServiceFor(orm.em.fork(), env, cliLogger(stderr));
      await executeInviteCommand(command, service, { stdout, clock: systemClock });
    } finally {
      await orm.close();
    }

    return 0;
  } catch (error) {
    reportError(error, stderr);
    return 1;
  }
}
