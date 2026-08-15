/**
 * GraphyLoop stack detection + database/deploy preflight — zero dependencies.
 *
 * This module answers two questions an agent otherwise guesses at:
 *   "what is this project?"      -> detectStack()
 *   "can it safely migrate/ship?" -> preflight()
 *
 * It NEVER executes anything. Running `supabase db push` or `vercel --prod` is
 * an irreversible, shared-system action, so the contract here is: report the
 * blockers, then hand back an ordered command plan where every destructive step
 * carries an explicit gate the caller must satisfy. Turning a deploy into one
 * unattended tool call is exactly the failure mode this avoids.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createSecrets, PROVIDERS } from './secrets.mjs';

export const PREFLIGHT_TARGETS = ['db', 'deploy', 'all'];

const FRAMEWORKS = [
  { name: 'next', dep: 'next', label: 'Next.js', envFile: '.env.local', buildDir: '.next' },
  { name: 'nuxt', dep: 'nuxt', label: 'Nuxt', envFile: '.env', buildDir: '.output' },
  { name: 'sveltekit', dep: '@sveltejs/kit', label: 'SvelteKit', envFile: '.env', buildDir: 'build' },
  { name: 'remix', dep: '@remix-run/react', label: 'Remix', envFile: '.env', buildDir: 'build' },
  { name: 'astro', dep: 'astro', label: 'Astro', envFile: '.env', buildDir: 'dist' },
  { name: 'expo', dep: 'expo', label: 'Expo', envFile: '.env', buildDir: 'dist' },
  { name: 'vite', dep: 'vite', label: 'Vite', envFile: '.env.local', buildDir: 'dist' },
];

const DB_LIBS = [
  { name: 'supabase-js', dep: '@supabase/supabase-js' },
  { name: 'supabase-ssr', dep: '@supabase/ssr' },
  { name: 'prisma', dep: 'prisma' },
  { name: 'drizzle', dep: 'drizzle-orm' },
  { name: 'postgres', dep: 'postgres' },
  { name: 'pg', dep: 'pg' },
];

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
}

function firstExisting(root, names) {
  return names.find((n) => existsSync(resolve(root, n))) || null;
}

/** npm/pnpm/yarn/bun "run this binary" prefix, derived from the lockfile. */
function runners(pkgManager) {
  switch (pkgManager) {
    case 'pnpm': return { exec: 'pnpm dlx', run: 'pnpm run' };
    case 'yarn': return { exec: 'yarn dlx', run: 'yarn' };
    case 'bun': return { exec: 'bunx', run: 'bun run' };
    default: return { exec: 'npx --yes', run: 'npm run' };
  }
}

/**
 * Detect what the project is built with. Everything is evidence-based: a key in
 * package.json, a lockfile, a directory that exists. Nothing is inferred from
 * the project name.
 *
 * @param {string} projectRoot
 */
export function detectStack(projectRoot) {
  const root = resolve(projectRoot);
  const pkg = readJson(join(root, 'package.json'));
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  const scripts = pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};

  const framework = FRAMEWORKS.find((f) => deps[f.dep]) || null;
  const pkgManager = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(join(root, 'yarn.lock')) ? 'yarn'
      : existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock')) ? 'bun'
        : existsSync(join(root, 'package-lock.json')) ? 'npm'
          : pkg ? 'npm' : 'none';

  const dbLibs = DB_LIBS.filter((l) => deps[l.dep]).map((l) => l.name);
  const supabaseDir = existsSync(join(root, 'supabase')) ? 'supabase' : null;
  const supabaseConfig = existsSync(join(root, 'supabase', 'config.toml'));
  let migrations = null;
  for (const dir of ['supabase/migrations', 'prisma/migrations', 'drizzle', 'migrations']) {
    if (!existsSync(resolve(root, dir))) continue;
    let count = 0;
    try { count = readdirSync(resolve(root, dir)).filter((f) => /\.(sql|ts|js)$/.test(f) || !f.includes('.')).length; } catch { count = 0; }
    migrations = { dir, count };
    break;
  }

  const vercelLinked = existsSync(join(root, '.vercel', 'project.json'));
  const deployTarget = existsSync(join(root, 'vercel.json')) || vercelLinked ? 'vercel'
    : existsSync(join(root, 'netlify.toml')) ? 'netlify'
      : existsSync(join(root, 'Dockerfile')) ? 'docker'
        : framework ? 'vercel-compatible' : 'unknown';

  return {
    projectRoot: root,
    hasPackageJson: !!pkg,
    framework: framework ? framework.name : (pkg ? 'node' : 'unknown'),
    frameworkLabel: framework ? framework.label : (pkg ? 'Node' : 'unknown'),
    envFile: framework ? framework.envFile : '.env',
    buildDir: framework ? framework.buildDir : null,
    pkgManager,
    scripts: {
      dev: scripts.dev ? 'dev' : scripts.start ? 'start' : null,
      build: scripts.build ? 'build' : null,
      test: scripts.test ? 'test' : null,
      lint: scripts.lint ? 'lint' : null,
      typecheck: scripts.typecheck ? 'typecheck' : scripts['type-check'] ? 'type-check' : null,
    },
    db: {
      libs: dbLibs,
      supabase: dbLibs.some((l) => l.startsWith('supabase')) || !!supabaseDir,
      supabaseDir,
      supabaseLinked: supabaseConfig,
      migrations,
      orm: dbLibs.includes('prisma') ? 'prisma' : dbLibs.includes('drizzle') ? 'drizzle' : null,
    },
    deploy: { target: deployTarget, vercelLinked, vercelJson: existsSync(join(root, 'vercel.json')) },
    envFilesPresent: ['.env', '.env.local', '.env.example'].filter((f) => existsSync(join(root, f))),
    gitignored: gitignoreCovers(root),
  };
}

/** Which of the sensitive paths the project .gitignore already covers. */
function gitignoreCovers(root) {
  const file = join(root, '.gitignore');
  if (!existsSync(file)) return { file: null, env: false, graphyloop: false };
  let text = '';
  try { text = readFileSync(file, 'utf-8'); } catch { return { file, env: false, graphyloop: false }; }
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const has = (...pats) => pats.some((p) => lines.includes(p));
  return {
    file,
    env: has('.env', '.env*', '.env.local', '.env*.local'),
    graphyloop: has('.graphyloop/', '.graphyloop', '.graphyloop/*'),
  };
}

function stepsForDb(stack, secretsStatus, run) {
  const steps = [];
  const supabase = secretsStatus.providers.find((p) => p.provider === 'supabase');
  const ref = supabase && supabase.keys.find((k) => k.key === 'SUPABASE_PROJECT_REF');

  if (!stack.db.supabaseLinked) {
    steps.push({
      id: 'db-init',
      run: `${run.exec} supabase init`,
      why: 'creates supabase/config.toml + migrations dir (skip if the project already has one)',
      gate: null,
      skipIf: 'supabase/config.toml exists',
    });
  }
  steps.push({
    id: 'db-link',
    run: `${run.exec} supabase link --project-ref ${ref && ref.present ? '$SUPABASE_PROJECT_REF' : '<project-ref>'}`,
    why: 'points the local CLI at the hosted project (needs SUPABASE_ACCESS_TOKEN)',
    gate: null,
  });
  steps.push({
    id: 'db-diff',
    run: `${run.exec} supabase db diff --file <migration_name>`,
    why: 'captures schema changes as a migration file instead of an untracked dashboard edit',
    gate: null,
  });
  steps.push({
    id: 'db-dry-run',
    run: `${run.exec} supabase db push --dry-run`,
    why: 'MANDATORY before any apply — prints the SQL that would run',
    gate: null,
  });
  steps.push({
    id: 'db-push',
    run: `${run.exec} supabase db push`,
    why: 'applies pending migrations to the hosted database',
    gate: 'destructive: user confirmation + a rollback note required (see AGENTS.md data lane)',
  });
  steps.push({
    id: 'db-types',
    run: `${run.exec} supabase gen types typescript --linked > src/types/database.ts`,
    why: 'regenerates typed schema so the backend/frontend contract stays checked',
    gate: null,
  });
  if (stack.db.orm === 'prisma') {
    steps.push({
      id: 'db-prisma',
      run: `${run.exec} prisma migrate deploy`,
      why: 'project uses Prisma — apply its migrations instead of raw SQL push',
      gate: 'destructive: confirm target database first',
    });
  }
  return steps;
}

function stepsForDeploy(stack, run) {
  const steps = [];
  if (!stack.deploy.vercelLinked) {
    steps.push({
      id: 'deploy-link',
      run: `${run.exec} vercel link`,
      why: 'writes .vercel/project.json (org + project id) so later commands are unambiguous',
      gate: null,
    });
  }
  steps.push({
    id: 'deploy-env-push',
    run: `${run.exec} vercel env add <KEY> production`,
    why: 'a local .env.local is NOT deployed — every runtime key must exist in Vercel too',
    gate: null,
  });
  steps.push({
    id: 'deploy-pull',
    run: `${run.exec} vercel pull --yes --environment=preview`,
    why: 'pulls the project settings + env so the local build matches the remote one',
    gate: null,
  });
  if (stack.scripts.build) {
    steps.push({
      id: 'deploy-build',
      run: `${run.run} ${stack.scripts.build}`,
      why: 'a local build must pass before shipping — cheapest possible failure',
      gate: null,
    });
  }
  steps.push({
    id: 'deploy-preview',
    run: `${run.exec} vercel deploy`,
    why: 'preview deployment — verify the real URL before touching production',
    gate: null,
  });
  steps.push({
    id: 'deploy-prod',
    run: `${run.exec} vercel deploy --prod`,
    why: 'production deployment',
    gate: 'irreversible for users: explicit user approval + a rollback plan (`vercel rollback`) required',
  });
  return steps;
}

/**
 * Readiness report + ordered command plan for database setup and/or deploy.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {'db'|'deploy'|'all'} [args.target='all']
 * @param {Record<string,string>} [args.env]
 */
export function preflight({ projectRoot, target = 'all', env } = {}) {
  const want = String(target || 'all').toLowerCase();
  if (!PREFLIGHT_TARGETS.includes(want)) {
    return { error: `unknown target "${target}" (expected one of: ${PREFLIGHT_TARGETS.join(', ')})` };
  }
  const stack = detectStack(projectRoot);
  const secrets = createSecrets({ projectRoot, env });
  const status = secrets.status({});
  const run = runners(stack.pkgManager);

  const blockers = [];
  const warnings = [];
  const plan = [];

  const provider = (name) => status.providers.find((p) => p.provider === name);

  if (want === 'db' || want === 'all') {
    const sb = provider('supabase');
    for (const key of sb.missingRequired) {
      blockers.push({
        target: 'db', code: 'missing-secret', key,
        fix: `secrets_set key=${key} (get it from ${PROVIDERS.supabase.console})`,
      });
    }
    if (!sb.keys.find((k) => k.key === 'SUPABASE_ACCESS_TOKEN').present) {
      warnings.push('SUPABASE_ACCESS_TOKEN is not set — the supabase CLI cannot link or push migrations without it');
    }
    if (!stack.db.supabase) {
      warnings.push('no Supabase client dependency detected — add @supabase/supabase-js (or @supabase/ssr for Next.js) before wiring queries');
    }
    if (!stack.db.migrations) {
      warnings.push('no migrations directory found — schema changes should live in migration files, not the dashboard');
    }
    plan.push(...stepsForDb(stack, status, run));
  }

  if (want === 'deploy' || want === 'all') {
    const vc = provider('vercel');
    for (const key of vc.missingRequired) {
      blockers.push({
        target: 'deploy', code: 'missing-secret', key,
        fix: `secrets_set key=${key} (create one at ${PROVIDERS.vercel.console})`,
      });
    }
    if (!stack.scripts.build) {
      blockers.push({
        target: 'deploy', code: 'no-build-script',
        fix: 'add a "build" script to package.json — Vercel needs one to produce a deployment',
      });
    }
    if (stack.deploy.target === 'netlify' || stack.deploy.target === 'docker') {
      warnings.push(`deploy target looks like ${stack.deploy.target}, not Vercel — the plan below assumes Vercel`);
    }
    if (!stack.deploy.vercelLinked) {
      warnings.push('project is not linked to Vercel yet (.vercel/project.json missing) — run the link step first');
    }
    plan.push(...stepsForDeploy(stack, run));
  }

  // Committing a real env file is the single most common way these credentials
  // leak, so it is a blocker rather than a note.
  if (!stack.gitignored.env && stack.envFilesPresent.some((f) => f !== '.env.example')) {
    blockers.push({
      target: 'all', code: 'env-not-gitignored',
      fix: `${stack.envFilesPresent.filter((f) => f !== '.env.example').join(', ')} exists but .gitignore does not cover .env files — run env_sync (it adds the patterns) or add them by hand before committing`,
    });
  }

  const runtimeKeys = [];
  for (const p of status.providers) {
    for (const k of p.keys) {
      if (k.present && k.kind === 'public') runtimeKeys.push(k.key);
    }
  }

  return {
    ok: blockers.length === 0,
    target: want,
    stack,
    secrets: status.providers.map((p) => ({
      provider: p.provider, configured: p.configured, missingRequired: p.missingRequired,
    })),
    blockers,
    warnings,
    plan,
    runtimeKeysToMirrorInVercel: runtimeKeys,
    note: 'preflight never executes anything. Run the steps in order; any step with a "gate" needs the stated approval first.',
  };
}

export default { detectStack, preflight, PREFLIGHT_TARGETS };
