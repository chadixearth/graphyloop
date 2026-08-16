---
name: dependency-audit
description: Use this skill before adding a dependency, when an audit or Dependabot alert fires, or when a lockfile changes in a review - triaging CVEs by real reachability, spotting typosquats and install scripts, pinning and lockfile discipline, and license checks. Covers deciding what actually needs fixing instead of chasing every advisory to zero.
---

# Dependency audit and supply chain

Two failures, opposite directions: shipping a package nobody vetted (install script,
typosquatted name, unmaintained transitive dep), and burning a day on advisories
that are unreachable in this app. Both come from not asking *is this reachable, and
what does it cost to remove*.

## When to activate

- Before `npm i <new-package>` (or pip/go/cargo/composer equivalent).
- `npm audit` / Dependabot / Snyk / GitHub alert, or a CI security job failing.
- A PR whose diff includes a lockfile.
- Post-incident: "was this package the way in?"

## Adding a dependency — the 60-second vet

1. **Do you need it?** Platform first: `Intl`, `URL`, `fetch`, `crypto.subtle`,
   `structuredClone`, CSS `:has`. A 3-line helper beats a transitive tree.
2. **Is the name right?** Typosquats live one character away
   (`react-domm`, `lodash.js`, `crossenv`, `discord.js-selfbot`). Copy the name from
   the official docs, never from a model's memory or a blog post.
3. **Is it alive?** Last publish, open-issue trend, maintainer count, downloads.
   One maintainer + last release three years ago = you are adopting the code.
4. **What does it drag in?** `npm view <pkg> dependencies` /
   `npx howfat <pkg>` — count transitives and installed size before, not after.
5. **Does it run code on install?** `npm view <pkg> scripts` — a `postinstall` in a
   utility library is a red flag; install with `--ignore-scripts` if you must.
6. **License compatible?** MIT/Apache-2.0/BSD fine for most products; AGPL/SSPL and
   "source-available" licenses are a legal decision, not a dev one.
7. **Pin it.** Exact version in `package.json` (no `^` for anything security- or
   build-critical), lockfile committed, `npm ci` in CI — never `npm install` there.

## Triaging an advisory

Run the tool, then think — the count is not the finding.

```
npm audit --json            # or: pnpm audit / yarn npm audit
npm ls <vulnerable-pkg>     # WHO pulls it in — the fix lives at that edge
pip-audit                   # python
govulncheck ./...           # go: reports reachable symbols, not just versions
cargo audit                 # rust
composer audit              # php
```

For each advisory answer four questions:

1. **Reachable?** Is the vulnerable function called on a path that handles
   untrusted input? A ReDoS in a CLI-only formatter, or a dev-dependency in
   `devDependencies` that never ships, is not the same risk as a parser in your
   request path. `govulncheck` answers this natively; in JS, grep the call sites.
2. **Runtime or build-time?** `devDependencies` still matter (they run on your
   machine and in CI, with tokens present) but they are not production exposure.
   Say which one you mean.
3. **Fix available?** Direct dep → bump and test. Transitive → bump the parent;
   if the parent is stale, `overrides`/`resolutions` (npm/pnpm/yarn) pin the fixed
   version, with a comment naming the advisory and a follow-up to remove it.
4. **No fix?** Mitigate and record: disable the feature, validate at the boundary,
   or replace the package. `npm audit fix --force` is not a triage step — it happily
   installs a major bump that breaks the build.

Severity from the advisory is a prior, not a verdict. A "critical" in an unused code
path is lower priority than a "moderate" in your auth flow. Order the report by
reachability, and say which CVEs you are deliberately accepting and why.

## Lockfile review

- Exactly one lockfile per project; two package managers means two dependency
  graphs and a nondeterministic build.
- A lockfile diff with no `package.json` change deserves a look: it can be a
  legitimate transitive bump, or an unrequested major slipping in.
- Check `resolved` URLs point at the expected registry (not a random tarball or
  git URL) and `integrity` hashes are present.
- Review the *added* names, not just the count — this is where a typosquat or an
  install-script package arrives.
- Keep `.npmrc`/registry config in the repo so every machine and CI resolve from
  the same place.

## Keeping it clean

- CI: `npm ci` + an audit step with an explicit threshold (fail on high in prod
  deps), plus Dependabot/Renovate grouped weekly so bumps are reviewable.
- Remove what you stopped using: `npx depcheck`, then delete. Unused packages are
  attack surface with no upside.
- Prefer fewer, larger, well-maintained dependencies over many micro-packages.
- Record the decision in memory (`memory_store`, type `decision`) when you accept a
  risk or add an override, so the next session does not re-litigate it.

## Verification

- Show the tool output before and after (`npm audit` summary counts, or the
  specific advisories resolved).
- `npm ci` from a clean state succeeds and the app builds — a fix that breaks the
  build is not a fix.
- Tests pass after the bump; for a major bump, name what you exercised.
- `npm ls <pkg>` proves the vulnerable version is actually gone from the tree, not
  merely deduped elsewhere.

## Reporting

`advisory · package (direct/transitive) · reachable? · runtime/dev · action taken`.
List accepted risks separately with the reason and the mitigation. Never report
"0 vulnerabilities" without the command output that says so, and never claim a
package is unreachable without naming where you looked.
