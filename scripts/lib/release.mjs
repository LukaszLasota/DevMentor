// Release logic for `.github/workflows/release.yml` (lesson 24): the next version, the no-overwrite tag
// check, version bumps in every package.json and the lockfile, and the release notes from CHANGELOG.md.
// Commands (run from the repository root):
//   plan    --bump <major|minor|patch|custom> [--version X.Y.Z]   decide the version and the mode
//   prepare --version X.Y.Z --notes <file>                         bump versions, date the changelog, write notes
//   notes   --version X.Y.Z --notes <file>                         only write the notes (recovery from a tag)
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUMPS = ['major', 'minor', 'patch', 'custom'];

export class ReleaseError extends Error {}

/** [major, minor, patch] of a plain MAJOR.MINOR.PATCH version. */
export function parseVersion(version) {
  const match = SEMVER.exec(version);

  if (!match) {
    throw new ReleaseError(`"${version}" is not a MAJOR.MINOR.PATCH version (pre-release and build suffixes are not supported).`);
  }

  return match.slice(1).map(Number);
}

/** Negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a, b) {
  const right = parseVersion(b);

  return parseVersion(a)
    .map((part, index) => part - right[index])
    .find((diff) => diff !== 0) ?? 0;
}

export function nextVersion(current, bump, custom) {
  const [major, minor, patch] = parseVersion(current);

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'custom': {
      const version = (custom ?? '').trim().replace(/^v/, '');

      if (version === '') {
        throw new ReleaseError('bump=custom needs the "version" input (e.g. 1.2.0).');
      }

      parseVersion(version);

      return version;
    }
    default:
      throw new ReleaseError(`Unknown bump "${bump}"; use one of ${BUMPS.join(', ')}.`);
  }
}

/** True when the tag exists locally or on origin; a git failure throws instead of reading as "absent". */
export function tagExists(tag, run) {
  const local = run('git', ['tag', '--list', tag]).trim() !== '';
  const remote = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).trim() !== '';

  return local || remote;
}

/** Tag names of every GitHub Release (drafts included), through the gh CLI. */
export function releaseTags(run, repository) {
  return run('gh', ['api', '--paginate', `repos/${repository}/releases`, '--jq', '.[].tag_name'])
    .split('\n')
    .filter(Boolean);
}

function sectionBounds(lines, version) {
  const heading = `## [${version}]`;
  const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));

  if (start === -1) {
    throw new ReleaseError(`CHANGELOG.md has no "${heading}" section; write the release notes first.`);
  }

  // The section ends at the next heading of the same level or at the link definitions at the bottom.
  const length = lines.slice(start + 1).findIndex((line) => line.startsWith('## ') || /^\[[^\]]+\]:\s/.test(line));

  return { start, end: length === -1 ? lines.length : start + 1 + length };
}

/** The body of the `## [version]` section, without its heading. */
export function extractNotes(changelog, version) {
  const lines = changelog.split('\n');
  const { start, end } = sectionBounds(lines, version);
  const notes = lines.slice(start + 1, end).join('\n').trim();

  if (notes === '') {
    throw new ReleaseError(`The "## [${version}]" section in CHANGELOG.md is empty.`);
  }

  return `${notes}\n`;
}

/** Replaces "unreleased…" in the section heading with the release date; a dated heading stays as it is. */
export function dateChangelog(changelog, version, today) {
  const lines = changelog.split('\n');
  const { start } = sectionBounds(lines, version);

  lines[start] = lines[start].replace(/\bunreleased\b.*$/i, today);

  return lines.join('\n');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Workspace folders (relative to root) from the root `workspaces` patterns: `dir/*` or an exact path. */
export function workspaceDirs(root, patterns) {
  return patterns.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) {
      return [pattern];
    }

    const parent = pattern.slice(0, -2);

    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json')))
      .map((entry) => `${parent}/${entry.name}`)
      .sort();
  });
}

/** Sets one version in the root package.json, every workspace package.json and package-lock.json. */
export function setVersions(root, version) {
  const rootManifest = readJson(join(root, 'package.json'));
  const workspaces = workspaceDirs(root, rootManifest.workspaces ?? []);
  const changed = ['package.json'];

  rootManifest.version = version;
  writeJson(join(root, 'package.json'), rootManifest);

  for (const dir of workspaces) {
    const path = join(root, dir, 'package.json');
    const manifest = readJson(path);

    manifest.version = version;
    writeJson(path, manifest);
    changed.push(`${dir}/package.json`);
  }

  const lockPath = join(root, 'package-lock.json');

  if (existsSync(lockPath)) {
    const lock = readJson(lockPath);

    lock.version = version;

    for (const key of ['', ...workspaces]) {
      if (lock.packages?.[key]) {
        lock.packages[key].version = version;
      }
    }

    writeJson(lockPath, lock);
    changed.push('package-lock.json');
  }

  return changed;
}

/**
 * Decides what the workflow does. A new version must be greater than the current one and have a changelog
 * section. An existing tag is never moved: with its GitHub Release missing the run only recovers the
 * Release (mode `recover`), with the Release present it stops.
 */
export function plan({ root, bump, custom, run, repository }) {
  const current = readJson(join(root, 'package.json')).version;
  const version = nextVersion(current, bump, custom);
  const tag = `v${version}`;

  if (tagExists(tag, run)) {
    if (releaseTags(run, repository).includes(tag)) {
      throw new ReleaseError(`${tag} is already tagged and released; nothing to do (tags are never overwritten).`);
    }

    return { version, tag, mode: 'recover' };
  }

  if (compareVersions(version, current) <= 0) {
    throw new ReleaseError(`${version} must be greater than the current version ${current}.`);
  }

  extractNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version);

  return { version, tag, mode: 'release' };
}

function writeNotes(root, version, notesPath) {
  writeFileSync(notesPath, extractNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version));
}

export function prepare({ root, version, notesPath, today }) {
  parseVersion(version);

  const changelogPath = join(root, 'CHANGELOG.md');
  const changelog = dateChangelog(readFileSync(changelogPath, 'utf8'), version, today);

  writeFileSync(changelogPath, changelog);
  writeNotes(root, version, notesPath);

  return [...setVersions(root, version), 'CHANGELOG.md'];
}

export function runCommand(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function required(options, name) {
  if (!options[name]) {
    throw new ReleaseError(`Missing --${name}.`);
  }

  return options[name];
}

/** Runs one command and returns the process exit code; outputs go to $GITHUB_OUTPUT when it is set. */
export function main({
  argv = process.argv.slice(2),
  root = process.cwd(),
  env = process.env,
  run = runCommand,
  today = new Date().toISOString().slice(0, 10),
  log = console.log,
  logError = console.error,
} = {}) {
  try {
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { bump: { type: 'string' }, version: { type: 'string' }, notes: { type: 'string' } },
    });
    const [command] = positionals;
    let outputs;

    if (command === 'plan') {
      outputs = plan({ root, bump: required(values, 'bump'), custom: values.version, run,
        // gh fills `{owner}/{repo}` from the origin remote when the script runs outside Actions.
        repository: env.GITHUB_REPOSITORY ?? '{owner}/{repo}',
      });
    } else if (command === 'prepare') {
      const files = prepare({ root, version: required(values, 'version'), notesPath: required(values, 'notes'), today });

      outputs = { files: files.join(' ') };
    } else if (command === 'notes') {
      const version = required(values, 'version');

      parseVersion(version);
      writeNotes(root, version, required(values, 'notes'));
      outputs = { notes: values.notes };
    } else {
      throw new ReleaseError(`Unknown command "${command}"; use plan, prepare or notes.`);
    }

    const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);

    log(lines.join('\n'));

    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    }

    return 0;
  } catch (error) {
    logError(`release: ${error.message}`);

    return 1;
  }
}
