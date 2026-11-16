import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_CONTENT,
  checkAgentsFile,
  checkClaudeFiles,
  checkPackages,
  countedLines,
  expandBraces,
  findPackageNames,
  findReferences,
  hasHeading,
  listAgentsFiles,
  listClaudeFiles,
  listPackages,
  main,
  normalizeEol,
  packageHasName,
  packageNamesOf,
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
    ['.mcp.json', true, '.mcp.json'],
    ['docker-compose.yml', true, 'docker-compose.yml'],
    ['pnpm-workspace.yaml', true, 'pnpm-workspace.yaml'],
    ['commitlint.config.cjs', true, 'commitlint.config.cjs'],
    ['next.config.js', true, 'next.config.js'],
    ['netlify.toml', true, 'netlify.toml'],
    ['docker-compose.yml', false, null],
    ['packages/app/src/app/layout.tsx', true, null],
    ['2026-10-20-user-login.md', true, null],
    ['@devmentor/core', true, null],
    ['~/.claude/projects', true, null],
    ['/api/health', true, null],
  ])('%s (root: %s) → %s', (token, isRoot, expected) => {
    expect(pathOf(token, isRoot)).toBe(expected);
  });
});

describe('expandBraces', () => {
  it.each([
    ['feedback/{A, B}.tsx', ['feedback/A.tsx', 'feedback/B.tsx']],
    ['forms/CrudForm.tsx', ['forms/CrudForm.tsx']],
  ])('%s → %j', (token, expected) => {
    expect(expandBraces(token)).toEqual(expected);
  });
});

describe('packageNamesOf', () => {
  it.each([
    ['errors.ts', ['errors.ts']],
    ['api/apiCall.ts', ['api/apiCall.ts']],
    ['backend/', ['backend/']],
    ['(auth)/sign-in/SignInForm.tsx', ['(auth)/sign-in/SignInForm.tsx']],
    ['feedback/{LoadingMessage,EmptyState}.tsx', ['feedback/LoadingMessage.tsx', 'feedback/EmptyState.tsx']],
    ['packages/ui/src/backend/', null],
    ['node_modules/next/dist/docs/', null],
    ['@devmentor/core/http', null],
    ['/api/*', null],
    ['.env', null],
    ['.codex/', null],
    ['src/app/layout.tsx', null],
    ['<concept>/<name>.ts', null],
    ['{a,<b>}.ts', null],
    ['try/catch', null],
    ['process.env', null],
    ['NextResponse.json()', null],
    ['npm run dev', null],
  ])('%s → %j', (token, expected) => {
    expect(packageNamesOf(token)).toEqual(expected);
  });
});

describe('findPackageNames', () => {
  it('returns each package file name with its line, braces expanded', () => {
    expect(findPackageNames('- `errors.ts` and `packages/core/x.ts`\n- `f/{A,B}.tsx`, `npm test`')).toEqual([
      { line: 1, name: 'errors.ts' },
      { line: 2, name: 'f/A.tsx' },
      { line: 2, name: 'f/B.tsx' },
    ]);
  });
});

describe('packageHasName', () => {
  const files = ['packages/ui/src/backend/api/apiCall.ts', 'packages/ui/src/myerrors.ts'];

  it.each([
    ['apiCall.ts', true],
    ['api/apiCall.ts', true],
    ['backend/', true],
    ['errors.ts', false],
    ['forms/CrudForm.tsx', false],
    ['forms/', false],
  ])('%s → %s', (name, expected) => {
    expect(packageHasName(files, name)).toBe(expected);
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

describe('normalizeEol', () => {
  it('turns CRLF and lone CR into LF', () => {
    expect(normalizeEol('a\r\nb\rc\n')).toBe('a\nb\nc\n');
  });
});

describe('countedLines', () => {
  const app = 'packages/app/AGENTS.md';
  const managed = [
    '<!-- BEGIN:nextjs-agent-rules -->',
    'managed',
    '<!-- END:nextjs-agent-rules -->',
    '',
    '<!-- BEGIN:nextjs-agent-feedback -->',
    '<!-- END:nextjs-agent-feedback -->',
  ].join('\n');

  it('counts every line of a plain file, ignoring the final newline', () => {
    expect(countedLines('a\nb\nc\n')).toEqual({ count: 3, ownPart: false });
  });

  it('skips the leading next dev blocks of packages/app/AGENTS.md', () => {
    expect(countedLines(`${managed}\n\n## Ours\nrule\n`, app)).toEqual({ count: 3, ownPart: true });
  });

  it('skips the managed blocks of a CRLF file', () => {
    expect(countedLines(`${managed}\n\n## Ours\nrule\n`.replaceAll('\n', '\r\n'), app)).toEqual({ count: 3, ownPart: true });
  });

  it('counts an END marker in any other file like ordinary text', () => {
    const text = `${lines(5)}\n<!-- END:nextjs-agent-rules -->\nrule\n`;
    expect(countedLines(text, 'packages/ui/AGENTS.md')).toEqual({ count: 7, ownPart: false });
    expect(countedLines(text, 'AGENTS.md')).toEqual({ count: 7, ownPart: false });
  });

  it('counts own text before a block, unknown block names and unclosed blocks in packages/app/AGENTS.md', () => {
    const own = `${lines(5)}\n${managed}\n`;
    expect(countedLines(own, app)).toEqual({ count: 11, ownPart: false });
    const unknown = `<!-- BEGIN:x -->\n${lines(5)}\n<!-- END:x -->\n`;
    expect(countedLines(unknown, app)).toEqual({ count: 7, ownPart: false });
    const unclosed = `<!-- BEGIN:nextjs-agent-rules -->\n${lines(5)}\n<!-- END:nextjs-agent-feedback -->\n`;
    expect(countedLines(unclosed, app)).toEqual({ count: 7, ownPart: false });
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
  const packageFiles = vi.fn(() => ['packages/ui/src/backend/forms/CrudForm.tsx']);
  const fs = { exists: (path) => path in files, read: (path) => files[path], packageFiles };

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
    const text = `<!-- BEGIN:nextjs-agent-rules -->\n${lines(200)}\n<!-- END:nextjs-agent-rules -->\n## Ours`;
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

  it('reports a file name in a package file that the package does not have', () => {
    const text = '## Panel layer\n- `forms/CrudForm.tsx`, `tables/DataTable.tsx`\n- `feedback/{A,B}.tsx`';
    expect(checkAgentsFile('packages/ui/AGENTS.md', text, fs)).toEqual({
      summary: 'packages/ui/AGENTS.md  3/120 lines  0 paths, 4 package names',
      errors: [
        'packages/ui/AGENTS.md:2: missing file tables/DataTable.tsx in packages/ui',
        'packages/ui/AGENTS.md:3: missing file feedback/A.tsx in packages/ui',
        'packages/ui/AGENTS.md:3: missing file feedback/B.tsx in packages/ui',
      ],
      warnings: [],
    });
    expect(packageFiles).toHaveBeenCalledWith('ui');
  });

  it('checks bare file names only in package files', () => {
    packageFiles.mockClear();
    expect(checkAgentsFile('docs/AGENTS.md', 'See `errors.ts`.', fs).errors).toEqual([]);
    expect(checkAgentsFile('packages/db/AGENTS.md', 'See `npm test`.', fs).errors).toEqual([]);
    expect(packageFiles).not.toHaveBeenCalled();
  });

  it('cannot hide a package file behind an END marker', () => {
    const text = `${lines(200)}\n<!-- END:nextjs-agent-rules -->\n## Ours`;
    expect(checkAgentsFile('packages/ui/AGENTS.md', text, fs).errors).toEqual(['packages/ui/AGENTS.md: 202 lines, budget 120']);
  });

  it('parses a CRLF file like an LF one', () => {
    const text = `# Root\n${table('| Feature | `SDLC.md` § Definition of Ready |')}\n`.replaceAll('\n', '\r\n');
    const crlf = { ...fs, read: (path) => files[path].replaceAll('\n', '\r\n') };
    expect(checkAgentsFile('AGENTS.md', text, crlf)).toEqual({
      summary: 'AGENTS.md  4/150 lines  1 paths',
      errors: [],
      warnings: [],
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

  it('accepts a CRLF import and an import without the final newline', () => {
    const files = { 'CLAUDE.md': '@AGENTS.md\r\n', 'packages/db/CLAUDE.md': '@AGENTS.md' };
    const fs = { exists: () => true, read: (path) => files[path] };
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

describe('checkPackages', () => {
  it('warns about a package without AGENTS.md', () => {
    const fs = { exists: (path) => path === 'packages/db/AGENTS.md' };
    expect(checkPackages(['db', 'new'], fs)).toEqual([
      'packages/new: no package rules — add packages/new/AGENTS.md if it has package-specific rules',
    ]);
  });
});

describe('file discovery', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  function repo() {
    dir = mkdtempSync(join(tmpdir(), 'agents-'));
    for (const sub of ['packages/app', 'packages/empty', 'packages/new', 'packages/db/src', 'node_modules/x', 'lekcja-06', 'prototypes/p', '.agents/skills/s']) {
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
      'packages/app/package.json',
      'packages/new/package.json',
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

  it('lists the packages: directories with a package.json', () => {
    expect(listPackages(repo())).toEqual(['app', 'new']);
  });

  it('lists CLAUDE.md files outside dependencies, installed skills and course material', () => {
    expect(listClaudeFiles(repo())).toEqual(['CLAUDE.md', 'packages/app/CLAUDE.md', 'packages/db/src/CLAUDE.md']);
  });
});

describe('main', () => {
  const okFiles = {
    'AGENTS.md': `# Root\n${table('| Package | `packages/db/AGENTS.md` |')}\n`,
    'packages/db/AGENTS.md': '# db\nSee `docs/a.md` § Missing, then `src/orm.ts`.\n',
    'packages/db/src/orm.ts': '',
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
      packages: () => ['db'],
      exists: (path) => path in files,
      read: (path) => files[path],
      packageFiles: (pkg) => Object.keys(files).filter((path) => path.startsWith(`packages/${pkg}/`)),
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
      '  packages/db/AGENTS.md  2/120 lines  1 paths, 1 package names ok',
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

  it('warns about a new package without AGENTS.md', () => {
    const { code, log } = run(okFiles, { packages: () => ['db', 'new'] });

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(
      'warning: packages/new: no package rules — add packages/new/AGENTS.md if it has package-specific rules',
    );
    expect(log).toHaveBeenLastCalledWith('check:agents: 2 AGENTS.md files, 2 CLAUDE.md files, all ok (2 warning(s)).');
  });

  it('fails a new package with CLAUDE.md but no AGENTS.md', () => {
    const files = { ...okFiles, 'packages/new/CLAUDE.md': CLAUDE_CONTENT };
    const { code, logError } = run(files, {
      packages: () => ['db', 'new'],
      claudeFiles: () => ['CLAUDE.md', 'packages/db/CLAUDE.md', 'packages/new/CLAUDE.md'],
    });

    expect(code).toBe(1);
    expect(logError).toHaveBeenCalledWith('error: packages/new/CLAUDE.md: imports packages/new/AGENTS.md, which does not exist');
  });

  it('prints no warning suffix when there are no warnings', () => {
    const { log } = run({ ...okFiles, 'packages/db/AGENTS.md': '# db\n' });
    expect(log).toHaveBeenLastCalledWith('check:agents: 2 AGENTS.md files, 2 CLAUDE.md files, all ok.');
  });

  it('reads the real file system by default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agents-'));
    for (const [path, text] of Object.entries({ ...okFiles, 'packages/db/package.json': '{}' })) {
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
