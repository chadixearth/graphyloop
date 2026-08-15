---
name: vercel-deploy
description: Use this skill when deploying to Vercel or debugging a deploy - preflight checks, mirroring env keys into the project, migration ordering, preview before production, and the rollback path. Production deploys are gated on explicit approval.
---

# Vercel deploy

A deploy is user-visible and hard to undo. The checks below cost a minute; skipping
them costs a broken production URL, or a build that succeeds and then throws at
runtime because a key only existed locally.

## When to activate

- Shipping a preview or production deployment.
- "works locally, fails on Vercel" symptoms.
- Setting up a project's deploy pipeline for the first time.

## Procedure

1. **`preflight target=deploy`.** Clear every blocker: missing `VERCEL_TOKEN`, no
   `build` script, env files not git-ignored.
2. **Link the project** (`vercel link`) so `.vercel/project.json` pins org and
   project id — otherwise later commands are ambiguous about where they ship.
3. **Mirror runtime env keys into Vercel.** A local `.env.local` is NOT deployed.
   Every key the app reads at runtime must exist in the Vercel project, per
   environment (production / preview / development): `vercel env add <KEY> production`.
   Never print the values.
4. **Migrate the database BEFORE the app deploy.** New code against an old schema
   fails immediately; old code against an additive schema usually survives.
   Dry-run first, keep a rollback note. Destructive changes (drop, rename,
   narrowing a type) need two deploys — add the new shape, ship code, remove the
   old shape later.
5. **Build locally** (`npm run build`) — the cheapest possible failure.
6. **Preview deploy** (`vercel deploy`) and verify the REAL URL: the touched flow,
   not just that the page renders. Check function logs for runtime errors.
7. **Production** (`vercel deploy --prod`) only after explicit user approval, with
   the rollback command recorded in the report.

## Rollback

- `vercel rollback` (or promote the previous deployment) restores the app in seconds.
- A migration does not roll back with the app. If the deploy included a
  destructive migration, the rollback plan is the down migration — write it before
  applying the up.

## Common failure modes

| Symptom | Cause |
|---|---|
| Build passes, runtime 500 | env key exists locally, missing in the Vercel project |
| Works in preview, breaks in production | key set for preview only, or a different database per environment |
| `Module not found` in the build | runtime import from `devDependencies`, or a case-sensitive path that only works locally |
| Client-side "invalid API key" | server-only key referenced from client code, or a public key missing its `NEXT_PUBLIC_` prefix |
| Function timeout | long request in a serverless handler — move it to a background job |
| Stale content after deploy | cached route/ISR — confirm revalidation instead of assuming a bad build |

## Rules

- Never `--prod` without approval, and never as the first deploy of a change.
- Never print a token or an env value, including inside commands you show.
- Do not disable typecheck, lint or tests to make a deploy pass — fix the cause or stop and report.
- Report the preview URL, what you verified on it, and the rollback command.
