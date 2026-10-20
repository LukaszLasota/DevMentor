// Validation-gate audit logic: high/critical advisories fail unless explicitly
// allowlisted (with a reason and review date) in audit-allowlist.json.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const ALLOWLIST_URL = new URL('../../audit-allowlist.json', import.meta.url);

/** Blocking advisories in an `npm audit --json` report, keyed by GHSA id. */
export function collectBlockingAdvisories(report) {
  const advisories = new Map();

  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via) {
      if (typeof via === 'object' && BLOCKING.has(via.severity)) {
        advisories.set(via.url.split('/').pop(), { title: via.title, package: via.name, severity: via.severity });
      }
    }
  }

  return advisories;
}

export function evaluateAudit({ report, allowlist, today }) {
  const advisories = collectBlockingAdvisories(report);
  const expired = allowlist.filter((entry) => entry.reviewBy < today);
  const blocking = [...advisories].filter(([id]) => !allowlist.some((entry) => entry.id === id));

  return { advisories, expired, blocking };
}

export function runNpmAudit() {
  try {
    return execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON report is still on stdout.
    return error.stdout;
  }
}

export function readAllowlist() {
  return JSON.parse(readFileSync(ALLOWLIST_URL, 'utf8'));
}

/** Runs the gate and returns the process exit code. */
export function main({
  audit = runNpmAudit,
  loadAllowlist = readAllowlist,
  today = new Date().toISOString().slice(0, 10),
  log = console.log,
  logError = console.error,
} = {}) {
  const { advisories, expired, blocking } = evaluateAudit({
    report: JSON.parse(audit()),
    allowlist: loadAllowlist(),
    today,
  });

  for (const entry of expired) {
    logError(`Allowlist entry ${entry.id} (${entry.package}) passed its review date ${entry.reviewBy}; re-check it.`);
  }

  for (const [id, advisory] of blocking) {
    logError(`${advisory.severity.toUpperCase()} ${id} ${advisory.package}: ${advisory.title}`);
  }

  if (expired.length > 0 || blocking.length > 0) {
    return 1;
  }

  log(`npm audit: no blocking advisories (${advisories.size} allowlisted).`);

  return 0;
}
