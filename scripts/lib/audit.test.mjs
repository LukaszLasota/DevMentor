import { describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
vi.mock('node:child_process', () => ({ execFileSync }));

const { collectBlockingAdvisories, evaluateAudit, main, readAllowlist, runNpmAudit } = await import('./audit.mjs');

const advisory = (id, severity, name = 'pkg') => ({
  url: `https://github.com/advisories/${id}`,
  title: `${name} issue`,
  name,
  severity,
});

const report = {
  vulnerabilities: {
    braces: { via: [advisory('GHSA-aaa', 'high', 'braces'), 'micromatch'] },
    lodash: { via: [advisory('GHSA-bbb', 'moderate', 'lodash')] },
    evil: { via: [advisory('GHSA-ccc', 'critical', 'evil')] },
  },
};

describe('collectBlockingAdvisories', () => {
  it('keeps only high/critical advisory objects, keyed by GHSA id', () => {
    expect([...collectBlockingAdvisories(report).keys()]).toEqual(['GHSA-aaa', 'GHSA-ccc']);
  });

  it('handles a report without vulnerabilities', () => {
    expect(collectBlockingAdvisories({}).size).toBe(0);
  });
});

describe('evaluateAudit', () => {
  it('separates allowlisted, blocking and expired entries', () => {
    const allowlist = [
      { id: 'GHSA-aaa', package: 'braces', reviewBy: '2027-01-01' },
      { id: 'GHSA-old', package: 'old', reviewBy: '2020-01-01' },
    ];

    const result = evaluateAudit({ report, allowlist, today: '2026-10-20' });

    expect(result.blocking.map(([id]) => id)).toEqual(['GHSA-ccc']);
    expect(result.expired.map((entry) => entry.id)).toEqual(['GHSA-old']);
  });
});

describe('main', () => {
  const run = (auditReport, allowlist) => {
    const log = vi.fn();
    const logError = vi.fn();
    const code = main({
      audit: () => JSON.stringify(auditReport),
      loadAllowlist: () => allowlist,
      today: '2026-10-20',
      log,
      logError,
    });
    return { code, log, logError };
  };

  it('passes when every blocking advisory is allowlisted', () => {
    const { code, log } = run({ vulnerabilities: { braces: report.vulnerabilities.braces } }, [
      { id: 'GHSA-aaa', package: 'braces', reviewBy: '2027-01-01' },
    ]);

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith('npm audit: no blocking advisories (1 allowlisted).');
  });

  it('fails on a blocking advisory and reports it', () => {
    const { code, logError } = run(report, [{ id: 'GHSA-aaa', package: 'braces', reviewBy: '2027-01-01' }]);

    expect(code).toBe(1);
    expect(logError).toHaveBeenCalledWith('CRITICAL GHSA-ccc evil: evil issue');
  });

  it('fails when an allowlist entry is past its review date', () => {
    const { code, logError } = run({}, [{ id: 'GHSA-aaa', package: 'braces', reviewBy: '2026-01-01' }]);

    expect(code).toBe(1);
    expect(logError.mock.calls[0][0]).toContain('passed its review date 2026-01-01');
  });

  it('uses npm audit, the repo allowlist and console by default', () => {
    execFileSync.mockReturnValueOnce(JSON.stringify({}));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(main()).toBe(0);
    log.mockRestore();
  });
});

describe('runNpmAudit', () => {
  it('returns stdout on success and on the non-zero exit npm uses for findings', () => {
    execFileSync.mockReturnValueOnce('{"ok":1}');
    expect(runNpmAudit()).toBe('{"ok":1}');

    execFileSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('exit 1'), { stdout: '{"found":1}' });
    });
    expect(runNpmAudit()).toBe('{"found":1}');
  });
});

describe('readAllowlist', () => {
  it('reads audit-allowlist.json with a reason and review date per entry', () => {
    for (const entry of readAllowlist()) {
      expect(entry).toEqual(expect.objectContaining({ id: expect.any(String), reason: expect.any(String) }));
      expect(entry.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
