import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  dateChangelog,
  extractNotes,
  main,
  nextVersion,
  parseVersion,
  plan,
  prepare,
  releaseTags,
  runCommand,
  setVersions,
  tagExists,
  workspaceDirs,
} from './release.mjs';

const CHANGELOG = `# Changelog

Intro.

## [1.1.0] — unreleased

### Features
- Next thing.

## [1.0.0] — unreleased (draft, lesson 22)

The first release.

### Fixes
- A fix.

[1.0.0]: https://github.com/example/repo/releases/tag/v1.0.0
`;

let root;

const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const writeJson = (path, value) => writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);

/** A fake `run` answering git/gh by command line; unknown commands fail like a real non-zero exit. */
function fakeRun({ localTags = [], remoteTags = [], releases = [] } = {}) {
  return vi.fn((command, args) => {
    const line = [command, ...args].join(' ');

    if (line.startsWith('git tag --list ')) {
      return localTags.includes(args[2]) ? `${args[2]}\n` : '';
    }

    if (line.startsWith('git ls-remote --tags origin ')) {
      const tag = args[3].replace('refs/tags/', '');

      return remoteTags.includes(tag) ? `abc123\trefs/tags/${tag}\n` : '';
    }

    if (line.startsWith('gh api --paginate ')) {
      return releases.map((tag) => `${tag}\n`).join('');
    }

    throw new Error(`unexpected command: ${line}`);
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'release-test-'));
  writeJson('package.json', { name: 'root', version: '1.0.0', private: true, workspaces: ['packages/*', 'tools'] });
  mkdirSync(join(root, 'packages/a'), { recursive: true });
  mkdirSync(join(root, 'packages/b'), { recursive: true });
  mkdirSync(join(root, 'packages/not-a-package'), { recursive: true });
  writeFileSync(join(root, 'packages/README.md'), 'not a folder');
  mkdirSync(join(root, 'tools'));
  writeJson('packages/a/package.json', { name: '@x/a', version: '1.0.0' });
  writeJson('packages/b/package.json', { name: '@x/b', version: '1.0.0', dependencies: { '@x/a': '*' } });
  writeJson('tools/package.json', { name: '@x/tools', version: '1.0.0' });
  writeJson('package-lock.json', {
    name: 'root',
    version: '1.0.0',
    packages: {
      '': { name: 'root', version: '1.0.0' },
      'packages/a': { name: '@x/a', version: '1.0.0' },
      'node_modules/dep': { version: '1.0.0' },
    },
  });
  writeFileSync(join(root, 'CHANGELOG.md'), CHANGELOG);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('parseVersion / compareVersions', () => {
  it('parses MAJOR.MINOR.PATCH', () => {
    expect(parseVersion('10.2.0')).toEqual([10, 2, 0]);
  });

  it.each(['1.0', '1.0.0-rc.1', '01.0.0', 'v1.0.0', ''])('rejects %j', (version) => {
    expect(() => parseVersion(version)).toThrow('is not a MAJOR.MINOR.PATCH version');
  });

  it('orders versions numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
  });
});

describe('nextVersion', () => {
  it.each([
    ['major', '0.1.0', '1.0.0'],
    ['minor', '1.2.3', '1.3.0'],
    ['patch', '1.2.3', '1.2.4'],
  ])('%s bump of %s is %s', (bump, current, expected) => {
    expect(nextVersion(current, bump)).toBe(expected);
  });

  it('takes a custom version, trimmed and without a leading v', () => {
    expect(nextVersion('1.0.0', 'custom', ' v2.0.0 ')).toBe('2.0.0');
  });

  it('ignores the custom version for a named bump', () => {
    expect(nextVersion('1.0.0', 'patch', '9.9.9')).toBe('1.0.1');
  });

  it('requires a version for bump=custom', () => {
    expect(() => nextVersion('1.0.0', 'custom')).toThrow('bump=custom needs the "version" input');
  });

  it('validates a custom version', () => {
    expect(() => nextVersion('1.0.0', 'custom', '2.0')).toThrow('is not a MAJOR.MINOR.PATCH version');
  });

  it('rejects an unknown bump', () => {
    expect(() => nextVersion('1.0.0', 'huge')).toThrow('Unknown bump "huge"; use one of major, minor, patch, custom.');
  });
});

describe('tagExists / releaseTags', () => {
  it('finds a tag that exists only locally or only on origin', () => {
    expect(tagExists('v1.0.0', fakeRun({ localTags: ['v1.0.0'] }))).toBe(true);
    expect(tagExists('v1.0.0', fakeRun({ remoteTags: ['v1.0.0'] }))).toBe(true);
    expect(tagExists('v1.0.0', fakeRun())).toBe(false);
  });

  it('lists release tags through the gh API for the repository', () => {
    const run = fakeRun({ releases: ['v1.0.0', 'v0.9.0'] });

    expect(releaseTags(run, 'owner/repo')).toEqual(['v1.0.0', 'v0.9.0']);
    expect(run).toHaveBeenCalledWith('gh', ['api', '--paginate', 'repos/owner/repo/releases', '--jq', '.[].tag_name']);
  });
});

describe('extractNotes / dateChangelog', () => {
  it('returns the section body up to the next section', () => {
    expect(extractNotes(CHANGELOG, '1.1.0')).toBe('### Features\n- Next thing.\n');
  });

  it('stops at the link definitions at the bottom', () => {
    expect(extractNotes(CHANGELOG, '1.0.0')).toBe('The first release.\n\n### Fixes\n- A fix.\n');
  });

  it('reads a last section that has no link definitions after it', () => {
    expect(extractNotes('## [2.0.0]\nBig.', '2.0.0')).toBe('Big.\n');
  });

  it('does not match a version that only starts the same', () => {
    expect(() => extractNotes('## [1.0.10] — 2026-01-01\nx\n', '1.0.1')).toThrow(
      'CHANGELOG.md has no "## [1.0.1]" section; write the release notes first.',
    );
  });

  it('fails on an empty section', () => {
    expect(() => extractNotes('## [2.0.0]\n\n## [1.0.0]\nold\n', '2.0.0')).toThrow(
      'The "## [2.0.0]" section in CHANGELOG.md is empty.',
    );
  });

  it('replaces "unreleased…" in the heading with the date and leaves the rest', () => {
    const dated = dateChangelog(CHANGELOG, '1.0.0', '2026-11-24');

    expect(dated).toContain('## [1.0.0] — 2026-11-24\n');
    expect(dated).toContain('## [1.1.0] — unreleased\n');
    expect(dated.replace('2026-11-24', 'unreleased (draft, lesson 22)')).toBe(CHANGELOG);
  });

  it('keeps a heading that already has a date', () => {
    const changelog = '## [1.0.0] — 2026-11-20\nx\n';

    expect(dateChangelog(changelog, '1.0.0', '2026-11-24')).toBe(changelog);
  });
});

describe('workspaceDirs / setVersions', () => {
  it('expands dir/* to folders with a package.json and keeps exact paths', () => {
    expect(workspaceDirs(root, ['packages/*', 'tools'])).toEqual(['packages/a', 'packages/b', 'tools']);
  });

  it('sets the version in every manifest and the lockfile, nothing else', () => {
    expect(setVersions(root, '1.1.0')).toEqual([
      'package.json',
      'packages/a/package.json',
      'packages/b/package.json',
      'tools/package.json',
      'package-lock.json',
    ]);

    expect(readJson('package.json')).toEqual({
      name: 'root',
      version: '1.1.0',
      private: true,
      workspaces: ['packages/*', 'tools'],
    });
    expect(readJson('packages/b/package.json')).toEqual({ name: '@x/b', version: '1.1.0', dependencies: { '@x/a': '*' } });
    expect(readJson('tools/package.json').version).toBe('1.1.0');

    const lock = readJson('package-lock.json');

    expect(lock.version).toBe('1.1.0');
    expect(lock.packages[''].version).toBe('1.1.0');
    expect(lock.packages['packages/a'].version).toBe('1.1.0');
    expect(lock.packages['node_modules/dep'].version).toBe('1.0.0');
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toMatch(/\n {2}"version": "1\.1\.0",\n[\s\S]*}\n$/);
  });

  it('handles a project without workspaces, lockfile packages or lockfile', () => {
    writeJson('package.json', { name: 'solo', version: '1.0.0' });
    writeJson('package-lock.json', { name: 'solo', version: '1.0.0' });

    expect(setVersions(root, '2.0.0')).toEqual(['package.json', 'package-lock.json']);
    expect(readJson('package-lock.json')).toEqual({ name: 'solo', version: '2.0.0' });

    rmSync(join(root, 'package-lock.json'));

    expect(setVersions(root, '3.0.0')).toEqual(['package.json']);
  });
});

describe('plan', () => {
  it('plans a new release for a version with a changelog section', () => {
    expect(plan({ root, bump: 'minor', run: fakeRun(), repository: 'o/r' })).toEqual({
      version: '1.1.0',
      tag: 'v1.1.0',
      mode: 'release',
    });
  });

  it('fails a new release without a changelog section', () => {
    expect(() => plan({ root, bump: 'patch', run: fakeRun(), repository: 'o/r' })).toThrow(
      'CHANGELOG.md has no "## [1.0.1]" section',
    );
  });

  it.each(['1.0.0', '0.9.0'])('refuses custom %s that is not greater than the current 1.0.0', (custom) => {
    expect(() => plan({ root, bump: 'custom', custom, run: fakeRun(), repository: 'o/r' })).toThrow(
      `${custom} must be greater than the current version 1.0.0.`,
    );
  });

  it('recovers only the Release when the tag exists without one, even for the current version', () => {
    const run = fakeRun({ remoteTags: ['v1.0.0'], releases: ['v0.9.0'] });

    expect(plan({ root, bump: 'custom', custom: '1.0.0', run, repository: 'o/r' })).toEqual({
      version: '1.0.0',
      tag: 'v1.0.0',
      mode: 'recover',
    });
  });

  it('stops when the tag and its Release both exist', () => {
    const run = fakeRun({ localTags: ['v1.1.0'], releases: ['v1.1.0'] });

    expect(() => plan({ root, bump: 'minor', run, repository: 'o/r' })).toThrow(
      'v1.1.0 is already tagged and released; nothing to do (tags are never overwritten).',
    );
  });
});

describe('prepare', () => {
  it('dates the changelog, writes the notes and bumps every version', () => {
    const notesPath = join(root, 'notes.md');
    const files = prepare({ root, version: '1.1.0', notesPath, today: '2026-11-24' });

    expect(files).toEqual([
      'package.json',
      'packages/a/package.json',
      'packages/b/package.json',
      'tools/package.json',
      'package-lock.json',
      'CHANGELOG.md',
    ]);
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toContain('## [1.1.0] — 2026-11-24\n');
    expect(readFileSync(notesPath, 'utf8')).toBe('### Features\n- Next thing.\n');
    expect(readJson('packages/a/package.json').version).toBe('1.1.0');
  });

  it('changes nothing when the version has no changelog section', () => {
    expect(() => prepare({ root, version: '3.0.0', notesPath: join(root, 'n.md'), today: '2026-11-24' })).toThrow(
      'no "## [3.0.0]" section',
    );
    expect(readJson('package.json').version).toBe('1.0.0');
  });
});

describe('runCommand', () => {
  it('returns stdout and throws on a non-zero exit', () => {
    expect(runCommand('node', ['-e', 'process.stdout.write("ok")'])).toBe('ok');
    expect(() => runCommand('node', ['-e', 'process.exit(3)'])).toThrow();
  });
});

describe('main', () => {
  const call = (argv, overrides = {}) => {
    const log = vi.fn();
    const logError = vi.fn();
    const code = main({ argv, root, env: {}, run: fakeRun(), today: '2026-11-24', log, logError, ...overrides });

    return { code, log, logError };
  };

  it('plan prints the outputs and appends them to $GITHUB_OUTPUT', () => {
    const output = join(root, 'github-output');
    const run = fakeRun();

    writeFileSync(output, 'earlier=1\n');

    const { code, log } = call(['plan', '--bump', 'minor'], { env: { GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'o/r' }, run });

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith('version=1.1.0\ntag=v1.1.0\nmode=release');
    expect(readFileSync(output, 'utf8')).toBe('earlier=1\nversion=1.1.0\ntag=v1.1.0\nmode=release\n');
  });

  it('plan asks gh for the origin repository outside Actions', () => {
    const run = fakeRun({ localTags: ['v1.1.0'] });
    const { code, log } = call(['plan', '--bump', 'custom', '--version', '1.1.0'], { run });

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith('version=1.1.0\ntag=v1.1.0\nmode=recover');
    expect(run).toHaveBeenCalledWith('gh', ['api', '--paginate', 'repos/{owner}/{repo}/releases', '--jq', '.[].tag_name']);
  });

  it('prepare lists the changed files', () => {
    const { code, log } = call(['prepare', '--version', '1.1.0', '--notes', join(root, 'notes.md')]);

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(
      'files=package.json packages/a/package.json packages/b/package.json tools/package.json package-lock.json CHANGELOG.md',
    );
  });

  it('notes writes only the notes file', () => {
    const notesPath = join(root, 'notes.md');
    const { code, log } = call(['notes', '--version', '1.0.0', '--notes', notesPath]);

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(`notes=${notesPath}`);
    expect(readFileSync(notesPath, 'utf8')).toBe('The first release.\n\n### Fixes\n- A fix.\n');
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(CHANGELOG);
  });

  it.each([
    [['notes', '--version', '1.0', '--notes', 'n.md'], 'release: "1.0" is not a MAJOR.MINOR.PATCH version'],
    [['notes', '--version', '1.0.0'], 'release: Missing --notes.'],
    [['plan'], 'release: Missing --bump.'],
    [['ship'], 'release: Unknown command "ship"; use plan, prepare or notes.'],
    [['plan', '--force'], "release: Unknown option '--force'"],
  ])('%j fails with an error line and exit code 1', (argv, message) => {
    const { code, log, logError } = call(argv);

    expect(code).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(logError.mock.calls[0][0]).toContain(message);
  });

  it('uses the process defaults when called without options', () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const argv = process.argv;

    process.argv = ['node', 'release.mjs', 'ship'];

    try {
      expect(main()).toBe(1);
      expect(logError).toHaveBeenCalledWith('release: Unknown command "ship"; use plan, prepare or notes.');
    } finally {
      process.argv = argv;
      logError.mockRestore();
    }
  });
});
