// Agent-context gate (lesson 10, spec .ai/specs/2026-11-16-agent-context-routing.md): keeps the agent
// instruction files small, their routes valid and every CLAUDE.md a bare import of its AGENTS.md.
//
// 1. Budgets: root AGENTS.md <= 150 lines, each packages/*/AGENTS.md <= 120 lines (warning at 80%).
//    packages/app/AGENTS.md counts only our part below the last `<!-- END:… -->` marker: the blocks
//    above it are written by `next dev` and are not ours to trim.
// 2. Routes: every backticked repo path in an AGENTS.md must exist, and every row of the root
//    `| Task | Read |` table must route to at least one such path.
// 3. Sections: `path.md § Name` (or `§2`) after a markdown path must match a heading (warning only).
// 4. Every CLAUDE.md is exactly `@AGENTS.md\n` next to an AGENTS.md; every packages/*/AGENTS.md has one.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT_FILE = 'AGENTS.md';
export const ROOT_BUDGET = 150;
export const PACKAGE_BUDGET = 120;
export const WARN_RATIO = 0.8;
export const CLAUDE_CONTENT = '@AGENTS.md\n';

/** Backticked tokens with these prefixes are repo paths and must exist. */
export const PATH_PREFIXES = ['.ai/', '.github/', '.claude/', '.agents/', 'packages/', 'docs/', 'scripts/'];
/** Bare file names with these extensions are root files — checked in the root AGENTS.md only (in package
 * files a bare name like `errors.ts` is relative to the section that lists it). */
const ROOT_FILE_PATTERN = /^[\w.-]+\.(?:md|json|mjs|mts|ts)$/;
/** Placeholders and patterns, not paths: `<concept>`, `YYYY-MM-DD`, `{a,b}`, globs, ellipses. */
const PLACEHOLDER_PATTERN = /[<>{}*…]|YYYY|\.\.\./;
/** A dated example name such as `2026-10-20-user-login.md` (naming rule); real references carry their folder. */
const NAMING_EXAMPLE_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;
/** Paths mentioned on purpose although they do not exist (each with its reason). */
export const ALLOWLIST = new Map([
  ['.codex/', 'preventive CODEOWNERS entry; no Codex config yet'],
  ['.mcp.json', 'preventive CODEOWNERS entry; no project MCP config yet'],
  ['src/app/layout.tsx', 'named as not existing (one root layout per route group)'],
  ['packages/app/src/app/layout.tsx', 'named as not existing (one root layout per route group)'],
]);
/** Directories never searched for CLAUDE.md: dependencies, build output, installed skills, course material. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.agents', 'coverage', 'storybook-static', 'prototypes']);
const SKIP_DIR_PATTERN = /^lekcja-/;

/** Dotenv files are never read and may be named without existing (`.env`, `.env.local`, `.env.example`…). */
function isEnvFile(token) {
  return /^\.env(?:\.|$)/.test(token.split('/').at(-1));
}

/**
 * Classifies one backticked token: the repo path to check, or null when it is not a checkable path.
 * `isRoot` enables bare root file names (`SDLC.md`, `vitest.config.mts`).
 */
export function pathOf(token, isRoot) {
  if (/\s/.test(token) || PLACEHOLDER_PATTERN.test(token)) return null;
  if (isEnvFile(token) || ALLOWLIST.has(token)) return null;
  if (PATH_PREFIXES.some((prefix) => token.startsWith(prefix))) return token;
  if (isRoot && ROOT_FILE_PATTERN.test(token) && !NAMING_EXAMPLE_PATTERN.test(token)) return token;
  return null;
}

/** Every checkable path in a markdown text, with its line and an optional `§` section reference. */
export function findReferences(text, isRoot) {
  const references = [];
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const path = pathOf(match[1], isRoot);
      if (!path) continue;
      const after = line.slice(match.index + match[0].length);
      // `§ Name` ends at a comma, a pipe, an opening parenthesis or a sentence-ending period.
      const section = path.endsWith('.md') ? after.match(/^\s*§\s*([^,|()]+?)\s*\.?\s*(?=[,|(]|$)/)?.[1] : undefined;
      references.push({ line: index + 1, path, section });
    }
  });
  return references;
}

/** Rows of the root `| Task | Read |` table: `{ line, task, read }`, or null when the table is missing. */
export function routingRows(text) {
  const lines = text.split('\n');
  const header = lines.findIndex((line) => /^\|\s*Task\s*\|\s*Read\s*\|\s*$/.test(line));
  if (header === -1) return null;
  const rows = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith('|'); i += 1) {
    const [, task, read] = lines[i].split('|').map((cell) => cell.trim());
    rows.push({ line: i + 1, task, read });
  }
  return rows;
}

/** Lines that count against the budget: all of them, or only those after the last managed-block marker. */
export function countedLines(text) {
  const lines = text.replace(/\n$/, '').split('\n');
  const lastMarker = lines.findLastIndex((line) => /^<!-- END:.*-->$/.test(line.trim()));
  return { count: lines.length - lastMarker - 1, ownPart: lastMarker !== -1 };
}

/** True when a markdown heading of `text` matches the section name (`2` matches `## 2. …`). */
export function hasHeading(text, name) {
  const headings = text
    .split('\n')
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#+\s*/, ''));
  if (/^\d+$/.test(name)) return headings.some((heading) => heading.startsWith(`${name}.`));
  return headings.some((heading) => heading.toLowerCase().includes(name.toLowerCase()));
}

/** Checks one AGENTS.md: budget, existing paths, section headings and (root only) the routing table. */
export function checkAgentsFile(path, text, { exists, read }) {
  const isRoot = path === ROOT_FILE;
  const budget = isRoot ? ROOT_BUDGET : PACKAGE_BUDGET;
  const errors = [];
  const warnings = [];
  const { count, ownPart } = countedLines(text);
  const lines = `${count}/${budget} lines${ownPart ? ' (own part)' : ''}`;

  if (count > budget) errors.push(`${path}: ${count} lines, budget ${budget}`);
  else if (count >= budget * WARN_RATIO) warnings.push(`${path}: ${count} lines, ${Math.round((count / budget) * 100)}% of budget ${budget}`);

  const references = findReferences(text, isRoot);
  for (const { line, path: target, section } of references) {
    if (!exists(target)) {
      errors.push(`${path}:${line}: missing path ${target}`);
    } else if (section && !hasHeading(read(target), section)) {
      warnings.push(`${path}:${line}: ${target} has no heading "${section}"`);
    }
  }

  if (isRoot) {
    const rows = routingRows(text);
    if (rows === null) errors.push(`${path}: no | Task | Read | routing table`);
    for (const row of rows ?? []) {
      if (findReferences(row.read, true).length === 0) errors.push(`${path}:${row.line}: route "${row.task}" names no repo path`);
    }
  }

  return { summary: `${path}  ${lines}  ${references.length} paths`, errors, warnings };
}

/** Checks the CLAUDE.md files: bare `@AGENTS.md` import next to an AGENTS.md, and one per package AGENTS.md. */
export function checkClaudeFiles(claudeFiles, agentsFiles, { exists, read }) {
  const errors = [];
  for (const path of claudeFiles) {
    if (read(path) !== CLAUDE_CONTENT) errors.push(`${path}: must contain exactly "@AGENTS.md" and a newline`);
    const sibling = path.replace(/CLAUDE\.md$/, 'AGENTS.md');
    if (!exists(sibling)) errors.push(`${path}: imports ${sibling}, which does not exist`);
  }
  for (const path of agentsFiles) {
    const sibling = path.replace(/AGENTS\.md$/, 'CLAUDE.md');
    if (!claudeFiles.includes(sibling)) errors.push(`${path}: no sibling ${sibling} (Claude Code reads AGENTS.md through it)`);
  }
  return errors;
}

/** The root AGENTS.md plus every packages/<name>/AGENTS.md. */
export function listAgentsFiles(cwd, fs = { existsSync, readdirSync }) {
  const packages = fs
    .readdirSync(join(cwd, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/AGENTS.md`)
    .filter((path) => fs.existsSync(join(cwd, path)))
    .sort();
  return [ROOT_FILE, ...packages];
}

/** Every CLAUDE.md below `dir` (repo-relative), skipping dependencies, build output and course material. */
export function listClaudeFiles(cwd, dir = '', fs = { readdirSync }) {
  const out = [];
  for (const entry of fs.readdirSync(join(cwd, dir), { withFileTypes: true })) {
    const child = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !SKIP_DIR_PATTERN.test(entry.name)) out.push(...listClaudeFiles(cwd, child, fs));
    } else if (entry.name === 'CLAUDE.md') {
      out.push(child);
    }
  }
  return out.sort();
}

/** Runs the gate and returns the process exit code (0 ok, possibly with warnings; 1 errors). */
export function main({
  cwd = process.cwd(),
  agentsFiles = () => listAgentsFiles(cwd),
  claudeFiles = () => listClaudeFiles(cwd),
  exists = (path) => existsSync(join(cwd, path)),
  read = (path) => readFileSync(join(cwd, path), 'utf8'),
  log = console.log,
  logError = console.error,
} = {}) {
  const errors = [];
  const warnings = [];
  const agents = agentsFiles();

  for (const path of agents) {
    if (!exists(path)) {
      errors.push(`${path}: missing`);
      continue;
    }
    const result = checkAgentsFile(path, read(path), { exists, read });
    log(`  ${result.summary}${result.errors.length ? '' : ' ok'}`);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const claude = claudeFiles();
  const claudeErrors = checkClaudeFiles(claude, agents.filter(exists), { exists, read });
  log(`  ${claude.length} CLAUDE.md files → @AGENTS.md${claudeErrors.length ? '' : ' ok'}`);
  errors.push(...claudeErrors);

  for (const warning of warnings) log(`warning: ${warning}`);
  for (const error of errors) logError(`error: ${error}`);

  const counts = `${agents.length} AGENTS.md files, ${claude.length} CLAUDE.md files`;
  if (errors.length > 0) {
    logError(`check:agents: ${counts}, ${errors.length} error(s).`);
    return 1;
  }
  log(`check:agents: ${counts}, all ok${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
  return 0;
}
