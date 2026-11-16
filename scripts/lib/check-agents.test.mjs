import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_CONTENT,
  checkAgentsFile,
  checkClaudeFiles,
  countedLines,
  findReferences,
  hasHeading,
  listAgentsFiles,
  listClaudeFiles,
  main,
  pathOf,
  routingRows,
} from './check-agents.mjs';

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');
const table = (...rows) => ['| Task | Read |', '|---|---|', ...rows].join('\n');

describe('pathOf', () => {
  it.each([
    ['.ai/lessons.md', true, '.ai/lessons.md'],
    ['packages/core/src/http/', false, 'packages/core/src/http/'],
    ['.github/workflows/ci.yml', false, '.github/workflows/ci.yml'],
    ['SDLC.md', true, 'SDLC.md'],
    ['vitest.config.mts', true, 'vitest.config.mts'],
    ['SDLC.md', false, null],
    ['errors.ts', false, null],
    ['backend/', true, null],
    ['api/apiCall.ts', true, null],
    ['npm run validate', true, null],
    ['packages/db/src/entities/<concept>/', true, null],
    ['.ai/runs/YYYY-MM-DD-slug.md', true, null],
    ['packages/ui/src/backend/feedback/{A,B}.tsx', true, null],
    ['scripts/**/*.test.mjs', true, null],
    ['docker compose …', true, null],
    ['.env', true, null],
    ['.env.example', true, null],
    ['packages/app/.env.local', true, null],
    ['.codex/', true, null],
    ['.mcp.json', true, null],
    ['packages/app/src/app/layout.tsx', true, null],
    ['2026-10-20-user-login.md', true, null],
    ['@devmentor/core', true, null],
    ['~/.claude/projects', true, null],
    ['/api/health', true, null],
  ])('%s (root: %s) → %s', (token, isRoot, expected) => {
    expect(pathOf(token, isRoot)).toBe(expected);
  });
});

describe('findReferences', () => {
  it('returns each path with its line and the section named after a markdown path', () => {
    const text = [
      'Read `SDLC.md` § Definition of Ready, `docs/a.md` §2 (Rules) and `npm test`.',
      'See `packages/ui/AGENTS.md` § Reference implementations.',
      '`packages/core/src/x.ts` § Not a section | `docs/b.md` (comment)',
    ].join('\n');

    expect(findReferences(text, true)).toEqual([
      { line: 1, path: 'SDLC.md', section: 'Definition of Ready' },
      { line: 1, path: 'docs/a.md', section: '2' },
      { line: 2, path: 'packages/ui/AGENTS.md', section: 'Reference implementations' },
      { line: 3, path: 'packages/core/src/x.ts', section: undefined },
      { line: 3, path: 'docs/b.md', section: undefined },
    ]);
  });
});

describe('routingRows', () => {
  it('returns null without a routing table', () => {
    expect(routingRows('# Title\n| A | B |')).toBeNull();
  });

  it('returns the rows below the header until the table ends', () => {
    const text = `intro\n${table('| Bug fix | `.ai/lessons.md` |', '| Review | `CODE_REVIEW.md` |')}\n\nafter`;
    expect(routingRows(text)).toEqual([
      { line: 4, task: 'Bug fix', read: '`.ai/lessons.md`' },
      { line: 5, task: 'Review', read: '`CODE_REVIEW.md`' },
    ]);
  });
});

describe('countedLines', () => {
  it('counts every line of a plain file, ignoring the final newline', () => {
    expect(countedLines('a\nb\nc\n')).toEqual({ count: 3, ownPart: false });
  });

  it('counts only the lines after the last managed-block marker', () => {
    const text = '<!-- BEGIN:x -->\nmanaged\n<!-- END:x -->\n<!-- BEGIN:y -->\n<!-- END:y -->\n\n## Ours\nrule\n';
    expect(countedLines(text)).toEqual({ count: 3, ownPart: true });
  });
});

describe('hasHeading', () => {
  const text = '# Title\n## 2. How to place\n### Services and DI (Awilix)\nnot # a heading';

  it.each([
    ['services and di', true],
    ['2', true],
    ['How to place', true],
    ['1', false],
    ['a heading', false],
  ])('%s → %s', (name, expected) => {
    expect(hasHeading(text, name)).toBe(expected);
  });
});

describe('checkAgentsFile', () => {
  const files = { 'SDLC.md': '# SDLC\n## Definition of Ready\n', 'docs/a.md': '# A\n' };
  const fs = { exists: (path) => path in files, read: (path) => files[path] };

  it('passes a root file within budget whose routes exist', () => {
    const text = `# Root\n${table('| Feature | `SDLC.md` § Definition of Ready |')}\n`;
    expect(checkAgentsFile('AGENTS.md', text, fs)).toEqual({
      summary: 'AGENTS.md  4/150 lines  1 paths',
      errors: [],
      warnings: [],
    });
  });

  it('fails a root file over 150 lines and warns from 80% of the budget', () => {
    const over = checkAgentsFile('AGENTS.md', `${table('| A | `SDLC.md` |')}\n${lines(148)}`, fs);
    expect(over.errors).toEqual(['AGENTS.md: 151 lines, budget 150']);

    const near = checkAgentsFile('AGENTS.md', `${table('| A | `SDLC.md` |')}\n${lines(117)}`, fs);
    expect(near.errors).toEqual([]);
    expect(near.warnings).toEqual(['AGENTS.md: 120 lines, 80% of budget 150']);
  });

  it('uses the 120-line budget for package files', () => {
    expect(checkAgentsFile('packages/db/AGENTS.md', lines(121), fs).errors).toEqual([
      'packages/db/AGENTS.md: 121 lines, budget 120',
    ]);
    expect(checkAgentsFile('packages/db/AGENTS.md', lines(96), fs).warnings).toEqual([
      'packages/db/AGENTS.md: 96 lines, 80% of budget 120',
    ]);
  });

  it('marks the own-part count of a file with managed blocks', () => {
    const text = `<!-- BEGIN:x -->\n${lines(200)}\n<!-- END:x -->\n## Ours`;
    expect(checkAgentsFile('packages/app/AGENTS.md', text, fs)).toEqual({
      summary: 'packages/app/AGENTS.md  1/120 lines (own part)  0 paths',
      errors: [],
      warnings: [],
    });
  });

  it('reports a missing path as an error and a missing section as a warning', () => {
    const text = 'Read `docs/missing.md` and `docs/a.md` § Nowhere.';
    expect(checkAgentsFile('packages/ui/AGENTS.md', text, fs)).toMatchObject({
      errors: ['packages/ui/AGENTS.md:1: missing path docs/missing.md'],
      warnings: ['packages/ui/AGENTS.md:1: docs/a.md has no heading "Nowhere"'],
    });
  });

  it('requires the routing table and a repo path in every route', () => {
    expect(checkAgentsFile('AGENTS.md', '# Root', fs).errors).toEqual(['AGENTS.md: no | Task | Read | routing table']);
    expect(checkAgentsFile('AGENTS.md', table('| Review | the review checklist |'), fs).errors).toEqual([
      'AGENTS.md:3: route "Review" names no repo path',
    ]);
  });
});

describe('checkClaudeFiles', () => {
  it('accepts bare imports next to every AGENTS.md', () => {
    const fs = { exists: () => true, read: () => CLAUDE_CONTENT };
    expect(checkClaudeFiles(['CLAUDE.md', 'packages/db/CLAUDE.md'], ['AGENTS.md', 'packages/db/AGENTS.md'], fs)).toEqual([]);
  });

  it('reports extra content, a missing import target and a package AGENTS.md without CLAUDE.md', () => {
    const files = { 'CLAUDE.md': '@AGENTS.md\n\n# Extra rules\n', 'docs/CLAUDE.md': CLAUDE_CONTENT };
    const fs = { exists: (path) => path !== 'docs/AGENTS.md', read: (path) => files[path] };

    expect(checkClaudeFiles(['CLAUDE.md', 'docs/CLAUDE.md'], ['AGENTS.md', 'packages/ui/AGENTS.md'], fs)).toEqual([
      'CLAUDE.md: must contain exactly "@AGENTS.md" and a newline',
      'docs/CLAUDE.md: imports docs/AGENTS.md, which does not exist',
      'packages/ui/AGENTS.md: no sibling packages/ui/CLAUDE.md (Claude Code reads AGENTS.md through it)',
    ]);
  });
});

describe('file discovery', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  function repo() {
    dir = mkdtempSync(join(tmpdir(), 'agents-'));
    for (const sub of ['packages/app', 'packages/empty', 'packages/db/src', 'node_modules/x', 'lekcja-06', 'prototypes/p', '.agents/skills/s']) {
      mkdirSync(join(dir, sub), { recursive: true });
    }
    for (const file of [
      'AGENTS.md',
      'CLAUDE.md',
      'packages/app/AGENTS.md',
      'packages/app/CLAUDE.md',
      'packages/db/AGENTS.md',
      'packages/db/src/CLAUDE.md',
      'packages/README.md',
      'node_modules/x/CLAUDE.md',
      'lekcja-06/CLAUDE.md',
      'prototypes/p/CLAUDE.md',
      '.agents/skills/s/CLAUDE.md',
    ]) {
      writeFileSync(join(dir, file), CLAUDE_CONTENT);
    }
    return dir;
  }

  it('lists the root and package AGENTS.md files', () => {
    expect(listAgentsFiles(repo())).toEqual(['AGENTS.md', 'packages/app/AGENTS.md', 'packages/db/AGENTS.md']);
  });

  it('lists CLAUDE.md files outside dependencies, installed skills and course material', () => {
    expect(listClaudeFiles(repo())).toEqual(['CLAUDE.md', 'packages/app/CLAUDE.md', 'packages/db/src/CLAUDE.md']);
  });
});

describe('main', () => {
  const okFiles = {
    'AGENTS.md': `# Root\n${table('| Package | `packages/db/AGENTS.md` |')}\n`,
    'packages/db/AGENTS.md': '# db\nSee `docs/a.md` § Missing.\n',
    'docs/a.md': '# A\n',
    'CLAUDE.md': CLAUDE_CONTENT,
    'packages/db/CLAUDE.md': CLAUDE_CONTENT,
  };
  const run = (files, overrides = {}) => {
    const log = vi.fn();
    const logError = vi.fn();
    const code = main({
      agentsFiles: () => ['AGENTS.md', 'packages/db/AGENTS.md'],
      claudeFiles: () => ['CLAUDE.md', 'packages/db/CLAUDE.md'],
      exists: (path) => path in files,
      read: (path) => files[path],
      log,
      logError,
      ...overrides,
    });
    return { code, log, logError };
  };

  it('returns 0 and prints one line per file, the warnings and the totals', () => {
    const { code, log, logError } = run(okFiles);

    expect(code).toBe(0);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      '  AGENTS.md  4/150 lines  1 paths ok',
      '  packages/db/AGENTS.md  2/120 lines  1 paths ok',
      '  2 CLAUDE.md files → @AGENTS.md ok',
      'warning: packages/db/AGENTS.md:2: docs/a.md has no heading "Missing"',
      'check:agents: 2 AGENTS.md files, 2 CLAUDE.md files, all ok (1 warning(s)).',
    ]);
    expect(logError).not.toHaveBeenCalled();
  });

  it('returns 1 and lists every error', () => {
    const files = { ...okFiles, 'AGENTS.md': `# Root\n${table('| Review | `CODE_REVIEW.md` |')}\n`, 'CLAUDE.md': 'rules\n' };
    const { code, log, logError } = run(files);

    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith('  AGENTS.md  4/150 lines  1 paths');
    expect(log).toHaveBeenCalledWith('  2 CLAUDE.md files → @AGENTS.md');
    expect(logError.mock.calls.map(([line]) => line)).toEqual([
      'error: AGENTS.md:4: missing path CODE_REVIEW.md',
      'error: CLAUDE.md: must contain exactly "@AGENTS.md" and a newline',
      'check:agents: 2 AGENTS.md files, 2 CLAUDE.md files, 2 error(s).',
    ]);
  });

  it('reports a listed AGENTS.md that does not exist', () => {
    const files = Object.fromEntries(Object.entries(okFiles).filter(([path]) => path !== 'packages/db/AGENTS.md'));
    const { code, logError } = run(files, { claudeFiles: () => ['CLAUDE.md'] });

    expect(code).toBe(1);
    expect(logError).toHaveBeenCalledWith('error: packages/db/AGENTS.md: missing');
  });

  it('prints no warning suffix when there are no warnings', () => {
    const { log } = run({ ...okFiles, 'packages/db/AGENTS.md': '# db\n' });
    expect(log).toHaveBeenLastCalledWith('check:agents: 2 AGENTS.md files, 2 CLAUDE.md files, all ok.');
  });

  it('reads the real file system by default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agents-'));
    for (const [path, text] of Object.entries(okFiles)) {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    const log = vi.fn();

    try {
      expect(main({ cwd: dir, log, logError: vi.fn() })).toBe(0);
      expect(log).toHaveBeenLastCalledWith('check:agents: 2 AGENTS.md files, 2 CLAUDE.md files, all ok (1 warning(s)).');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
