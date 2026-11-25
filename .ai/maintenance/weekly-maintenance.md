# Weekly maintenance

The prompt of the weekly maintenance run (lesson 25). It replaces the course's Cezar workflow `weekly-maintenance`: same steps, run by hand as one Claude Code session at the repo root (paste the prompt). The run opens at most one docs PR and one issue; it never merges, never changes code outside the dead-code step, and never touches `.ai/specs/implemented/` or `.ai/specs/archive/` content.

The owner reads every PR and issue the run leaves, at least for the first weeks (lesson 25: trust in the automation is built slowly). Monthly, by hand: a full audit of the whole repo (`.ai/maintenance/2026-11-25-audit.md` is the baseline), a review of the decisions listed in the maintenance PRs, and a refactoring pass over the duplicate list.

## Prompt

```text
Run the weekly maintenance of this repository. Read AGENTS.md and .ai/README.md first and follow them: AI artifacts in .ai/, no secrets (.env* except .env.example, *.pem, ~/.ssh, ~/.aws, ~/.config/gh, ~/.kube, ~/.claude/projects), never weaken .claude/settings.json or the hooks, merges stay with the owner.

Step 1, audit (writes one file). Make a knowledge inventory limited to the pull requests merged into main in the last 7 days (gh pr list --state merged --search "merged:>=<date 7 days ago>"). Check the artifacts those PRs changed and the artifacts that describe the changed code: every AGENTS.md, .ai/specs/ (with implemented/, archive/, capabilities/), .ai/skills/, .ai/lessons.md, .ai/specs/product-brief.md decision rows, SDLC.md, README.md, UPGRADE_NOTES.md, CHANGELOG.md. For each spec touched, set its status: implemented in full, partially, not implemented, or abandoned. Find contradictions between documents and between a document and the code. Base every finding on evidence: file and line in the document, and file, line and commit in the code; without evidence write "not established". Compare with the newest report in .ai/maintenance/: which contradictions are new and which are gone. Write everything to .ai/maintenance/YYYY-MM-DD-audit.md (today's date). Change nothing else in this step.

Step 2, documentation drift (one PR). Take from today's report the contradictions where it established which version is true. Fix the documents that contradict it, on a branch docs/maintenance-YYYY-MM-DD from main, in one PR that also carries the report. Do not change code, and do not change the content of specs in .ai/specs/implemented/ or .ai/specs/archive/ (only the one "Superseded by" line a new spec allows). Move specs the report found implemented in full with git mv to .ai/specs/implemented/, add their capability digest in .ai/specs/capabilities/ as .ai/README.md describes, and fix references to them. List the contradictions without a resolution in the PR description as decisions for the owner. Labels: documentation, review, skip-qa, risk-low. If nothing needs fixing, open the PR with the report only.

Step 3, context check (one issue). Run npm run check:agents and take every error and warning. Open or update one issue titled "Weekly context check" with the files to fix and the reason for each. Fix nothing yourself.

Step 4, dependencies. For open Dependabot PRs whose CI fails, read the changelog and migration notes, fix the code without disabling tests or lowering thresholds, and push to that PR. If you cannot reach green tests, commit nothing and leave a PR comment: what you tried and what needs deciding. When there are no such PRs, say so in the step-2 PR description and continue.

Step 5, dead code. Run npx knip and npx jscpd packages. Remove only items that are certainly not used dynamically or from outside the repository (Next.js route files, page files, config files and public package entries are used by the framework, never dead). Put doubtful items on a list for decision. Describe the three largest duplicates in the PR; do not refactor them. Removals go in a separate PR chore/dead-code-YYYY-MM-DD with labels review, risk-low; no PR when nothing is removed.

Step 6, verify. Run npm test and npm run check:agents on every branch you pushed. If red, fix within the step that caused it, at most twice; then stop and report what is red in that PR.

End with a short summary: report path, PR links, issue link, what is red, and the owner's decisions.
```

## Schedule

No automatic schedule (owner decision, 2026-11-25): the owner starts the run by hand once a week by pasting the prompt into a Claude Code session at the repo root. The run needs GitHub access for `gh` and `git push`; all PRs are left for the owner to review and merge.
