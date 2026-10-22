import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_FILE, findViolations, isScanned, listFiles, main } from './check-tokens.mjs';

describe('findViolations', () => {
  it.each([
    ['color: #335cff;', 'raw colour'],
    ['background: rgb(0 0 0 / 0.5);', 'raw colour'],
    ['color: oklch(0.6 0.1 40);', 'raw colour'],
    ['className="bg-zinc-900 px-6"', 'Tailwind palette class'],
    ['className="text-white"', 'Tailwind palette class'],
    ['className="hover:bg-indigo-500"', 'Tailwind palette class'],
    ['className="p-[13px]"', 'Tailwind arbitrary value'],
  ])('flags %s as %s', (line, rule) => {
    expect(findViolations('a.tsx', line)).toEqual([expect.objectContaining({ path: 'a.tsx', line: 1, rule })]);
  });

  it.each([
    'className="bg-primary text-primary-foreground"',
    'color: var(--dm-bg-white-0);',
    'className="text-muted-foreground p-panel rounded-control"',
    'const id = "#main";',
  ])('accepts token usage: %s', (line) => {
    expect(findViolations('a.tsx', line)).toEqual([]);
  });

  it('reports the line number of each finding', () => {
    expect(findViolations('a.css', 'a {}\nb { color: #fff; }')).toEqual([
      { path: 'a.css', line: 2, rule: 'raw colour', match: '#fff' },
    ]);
  });
});

describe('isScanned', () => {
  it.each([
    ['packages/ui/src/button.tsx', true],
    ['packages/ui/src/styles.css', true],
    ['packages/ui/stories/foundations/Color.mdx', true],
    ['packages/ui/.storybook/main.ts', true],
    [TOKEN_FILE, false],
    ['packages/ui/stories/design-system/WhatToAvoid.mdx', false],
    ['packages/ui/src/button.test.tsx', false],
    ['packages/ui/src/logo.svg', false],
  ])('%s → %s', (path, expected) => {
    expect(isScanned(path)).toBe(expected);
  });
});

describe('listFiles', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('walks directories and skips node_modules and storybook-static', () => {
    dir = mkdtempSync(join(tmpdir(), 'tokens-'));
    for (const sub of ['src/nested', 'src/node_modules', 'src/storybook-static']) mkdirSync(join(dir, sub), { recursive: true });
    writeFileSync(join(dir, 'src/a.tsx'), '');
    writeFileSync(join(dir, 'src/nested/b.css'), '');
    writeFileSync(join(dir, 'src/node_modules/c.tsx'), '');
    writeFileSync(join(dir, 'src/storybook-static/d.css'), '');

    expect(listFiles('src', dir).sort()).toEqual(['src/a.tsx', 'src/nested/b.css']);
  });

  it('throws on a missing root instead of passing silently', () => {
    dir = mkdtempSync(join(tmpdir(), 'tokens-'));
    expect(() => listFiles('missing', dir)).toThrow('Path not found: missing');
  });
});

describe('main', () => {
  const files = { 'ui/a.tsx': 'className="bg-primary"', 'ui/b.tsx': 'className="text-white"' };

  it('returns 0 and logs a summary when every file is clean', () => {
    const log = vi.fn();
    const code = main({ roots: ['ui'], list: () => ['ui/a.tsx'], read: (p) => files[p], log });
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith('check:tokens: 1 files clean.');
  });

  it('returns 1 and lists every finding with file and line', () => {
    const logError = vi.fn();
    const code = main({ roots: ['ui'], list: () => Object.keys(files), read: (p) => files[p], logError });
    expect(code).toBe(1);
    expect(logError).toHaveBeenCalledWith('ui/b.tsx:1  Tailwind palette class: text-white');
  });

  it('returns 2 when a root cannot be scanned', () => {
    const logError = vi.fn();
    const code = main({
      roots: ['nope'],
      list: () => {
        throw new Error('Path not found: nope');
      },
      logError,
    });
    expect(code).toBe(2);
    expect(logError).toHaveBeenCalledWith('check:tokens could not scan: Path not found: nope');
  });

  it('reads the real file system by default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tokens-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/a.css'), 'a { color: #fff; }');
    const logError = vi.fn();

    try {
      expect(main({ cwd: dir, roots: ['src'], logError })).toBe(1);
      expect(logError).toHaveBeenCalledWith('src/a.css:1  raw colour: #fff');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
