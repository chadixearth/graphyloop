/**
 * GraphyLoop secrets + env layer — zero dependencies, Node >= 20.
 *
 * Why this exists: "set up Supabase" and "deploy to Vercel" both stall on the
 * same thing — credentials. Without a home for them the agent either asks the
 * user to paste keys into the chat (which puts a service-role key in a model
 * transcript, a log, and possibly a training set) or hardcodes them into a
 * committed file. Both are the failure this module removes.
 *
 * Design rules, in priority order:
 *   1. A secret VALUE never crosses back into the agent's context. Status is
 *      masked-only; env_sync moves values file-to-file and reports key NAMES.
 *      There is deliberately no "reveal" call in the tool surface.
 *   2. The store is project-scoped (<project>/.graphyloop/secrets.json) because
 *      Supabase/Vercel credentials are per project, and is made ungittable
 *      before the first value is written, not after.
 *   3. Values are read, never invented: process.env -> local store -> the
 *      project's own .env files, with the winning source reported so drift
 *      between them is visible instead of mysterious.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync, copyFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';

export const SECRETS_FILE = '.graphyloop/secrets.json';

// Files a framework loads on its own, in the order they win at runtime.
export const ENV_FILES = ['.env.local', '.env.development.local', '.env', '.env.example'];

/** Env files we read when resolving a key (never .env.example — it holds names only). */
const READ_ENV_FILES = ['.env.local', '.env.development.local', '.env'];

// kind drives how a value may be handled, not just how it is labelled:
//   public — safe to ship to a browser bundle (still masked in reports)
//   secret — server-only; leaking it is an incident, so it is never aliased
//            into a NEXT_PUBLIC_*/VITE_* name by env_sync
export const PROVIDERS = {
  supabase: {
    label: 'Supabase',
    purpose: 'database, auth, storage',
    console: 'https://supabase.com/dashboard/project/_/settings/api',
    keys: [
      {
        key: 'SUPABASE_URL', kind: 'public', required: true,
        publicAlias: true,
        hint: 'Project URL from Settings -> API (https://<ref>.supabase.co)',
        looksLike: /^https:\/\/[a-z0-9-]+\.supabase\.(co|in|red)(\/.*)?$/i,
      },
      {
        key: 'SUPABASE_ANON_KEY', kind: 'public', required: true,
        publicAlias: true,
        hint: 'anon / publishable key — safe in the browser, RLS still applies',
      },
      {
        key: 'SUPABASE_SERVICE_ROLE_KEY', kind: 'secret', required: false,
        hint: 'server-only key that BYPASSES RLS — never expose it to client code',
      },
      {
        key: 'SUPABASE_DB_URL', kind: 'secret', required: false,
        alsoWrite: ['DATABASE_URL'],
        hint: 'Postgres connection string used by migrations (Settings -> Database)',
        looksLike: /^postgres(ql)?:\/\//i,
      },
      {
        key: 'SUPABASE_PROJECT_REF', kind: 'public', required: false,
        hint: 'project ref for `supabase link --project-ref <ref>`',
      },
      {
        key: 'SUPABASE_ACCESS_TOKEN', kind: 'secret', required: false,
        hint: 'personal access token for the supabase CLI (supabase.com/dashboard/account/tokens)',
      },
    ],
  },
  vercel: {
    label: 'Vercel',
    purpose: 'deploy, preview URLs, env promotion',
    console: 'https://vercel.com/account/tokens',
    keys: [
      {
        key: 'VERCEL_TOKEN', kind: 'secret', required: true,
        hint: 'access token from vercel.com/account/tokens (scope it to one project)',
      },
      { key: 'VERCEL_ORG_ID', kind: 'public', required: false, hint: 'from .vercel/project.json after `vercel link`' },
      { key: 'VERCEL_PROJECT_ID', kind: 'public', required: false, hint: 'from .vercel/project.json after `vercel link`' },
    ],
  },
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

/** Public-prefix aliases per framework, applied only to kind:'public' keys. */
const PUBLIC_PREFIXES = {
  next: 'NEXT_PUBLIC_',
  vite: 'VITE_',
  astro: 'PUBLIC_',
  sveltekit: 'PUBLIC_',
  nuxt: 'NUXT_PUBLIC_',
  expo: 'EXPO_PUBLIC_',
  remix: null,
  node: null,
  unknown: null,
};

const KEY_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_VALUE_BYTES = 8192;

/**
 * Mask a value for reporting. Long values keep a 4-char tail so a user can tell
 * two keys apart; short ones show nothing, because 3 of 6 characters of a
 * password is a real leak.
 */
export function maskValue(value) {
  const s = String(value ?? '');
  if (s.length === 0) return '';
  if (s.length <= 8) return '*'.repeat(s.length);
  return `${'*'.repeat(8)}${s.slice(-4)} (${s.length} chars)`;
}

/** Every key name known to any provider (used to reject typos early). */
export function knownKeys() {
  const out = new Map();
  for (const [name, provider] of Object.entries(PROVIDERS)) {
    for (const spec of provider.keys) out.set(spec.key, { provider: name, ...spec });
  }
  return out;
}

/** Minimal `KEY=value` parser: no interpolation, no export, quotes stripped. */
export function parseEnvFile(text) {
  const out = new Map();
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out.set(key, value);
  }
  return out;
}

/** Serialize a `KEY=value` line, quoting only when the value needs it. */
function envLine(key, value) {
  const needsQuotes = /[\s"'#]/.test(value);
  const v = needsQuotes ? `"${String(value).replace(/(["\\])/g, '\\$1')}"` : value;
  return `${key}=${v}`;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function writeAtomic(file, contents, mode) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, contents, mode ? { mode } : undefined);
  renameSync(tmp, file);
  if (mode) {
    // Best effort: Windows has no POSIX mode bits, and a rename can reset them.
    try { chmodSync(file, mode); } catch { /* not fatal */ }
  }
}

/**
 * Secrets store + env materializer for one project root.
 *
 * @param {object} [opts]
 * @param {string} [opts.projectRoot] defaults to GRAPHYLOOP_PROJECT_ROOT or cwd
 * @param {Record<string,string>} [opts.env] process env to resolve against
 */
export function createSecrets(opts = {}) {
  const projectRoot = opts.projectRoot || process.env.GRAPHYLOOP_PROJECT_ROOT || process.cwd();
  const env = opts.env || process.env;
  const storePath = resolve(projectRoot, SECRETS_FILE);
  const guardPath = resolve(projectRoot, '.graphyloop', '.gitignore');
  const gitignorePath = resolve(projectRoot, '.gitignore');

  function loadStore() {
    if (!existsSync(storePath)) return { version: 1, updatedAt: null, values: {} };
    try {
      const parsed = JSON.parse(readFileSync(storePath, 'utf-8'));
      const values = parsed && typeof parsed.values === 'object' && parsed.values ? parsed.values : {};
      return { version: 1, updatedAt: parsed.updatedAt ?? null, values };
    } catch {
      // A hand-edited store must not brick every later call; quarantine like the
      // engine does with state.json.
      try { renameSync(storePath, `${storePath}.corrupt-${stamp()}`); } catch { /* best effort */ }
      return { version: 1, updatedAt: null, values: {} };
    }
  }

  /**
   * Make `.graphyloop/` ungittable BEFORE the first secret lands in it. The
   * guard file itself is committable on purpose: it protects teammates who
   * clone the repo and run graphyloop later.
   */
  function ensureStoreGuard() {
    const body = [
      '# graphyloop local state — never commit. Written by graphyloop, safe to keep.',
      'secrets.json',
      'secrets.json.*',
      'state.json',
      'state.json.*',
      '*.lock',
      '*.tmp-*',
      '',
    ].join('\n');
    if (existsSync(guardPath)) {
      const current = readFileSync(guardPath, 'utf-8');
      if (current.includes('secrets.json')) return { guard: guardPath, created: false };
      writeAtomic(guardPath, `${current.replace(/\s*$/, '')}\n${body}`);
      return { guard: guardPath, created: false, updated: true };
    }
    writeAtomic(guardPath, body);
    return { guard: guardPath, created: true };
  }

  /** Append env-file patterns to the project .gitignore when they are missing. */
  function ensureEnvGitignore(files) {
    const want = new Set(['.env', '.env.local', '.env*.local', ...files.filter((f) => f !== '.env.example')]);
    const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
    const lines = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
    // A `.env*` style glob already covers every pattern we would add.
    const broad = [...lines].some((l) => l === '.env*' || l === '.env**' || l === '*.env');
    const missing = broad ? [] : [...want].filter((p) => !lines.has(p));
    if (missing.length === 0) return { gitignore: gitignorePath, added: [] };
    const block = [
      '',
      '# graphyloop: local env files hold real credentials — never commit them',
      ...missing,
      '',
    ].join('\n');
    writeAtomic(gitignorePath, `${existing.replace(/\s*$/, '')}${existing ? '\n' : ''}${block.replace(/^\n/, '')}`);
    return { gitignore: gitignorePath, added: missing };
  }

  /** Values found in the project's own env files, keyed by file. */
  function envFileValues() {
    const perFile = new Map();
    for (const name of READ_ENV_FILES) {
      const file = resolve(projectRoot, name);
      if (!existsSync(file)) continue;
      try { perFile.set(name, parseEnvFile(readFileSync(file, 'utf-8'))); } catch { /* unreadable: skip */ }
    }
    return perFile;
  }

  /**
   * Resolve one key across every source.
   * @returns {{present:boolean, source:string|null, value:string|null, sources:string[]}}
   */
  function resolveKey(key, store, perFile, aliases = []) {
    const names = [key, ...aliases];
    const found = [];
    let winner = null;

    for (const name of names) {
      if (env[name] !== undefined && String(env[name]).length > 0) {
        found.push('env');
        winner = winner || { source: 'env', value: String(env[name]), via: name };
        break;
      }
    }
    for (const name of names) {
      if (store.values[name] !== undefined && String(store.values[name]).length > 0) {
        found.push('store');
        winner = winner || { source: 'store', value: String(store.values[name]), via: name };
        break;
      }
    }
    for (const [file, map] of perFile) {
      const hit = names.find((n) => map.get(n));
      if (hit) {
        found.push(file);
        winner = winner || { source: file, value: String(map.get(hit)), via: hit };
      }
    }

    if (!winner) return { present: false, source: null, value: null, sources: [] };
    return {
      present: true, source: winner.source, value: winner.value, via: winner.via,
      sources: [...new Set(found)],
    };
  }

  return {
    projectRoot,
    storeFile: storePath,

    /**
     * Masked readiness report. Returns key NAMES, presence, source and a mask —
     * never a value, because this result is handed straight to a model.
     */
    status({ provider } = {}) {
      const wanted = provider && provider !== 'all' ? [provider] : PROVIDER_NAMES;
      const unknown = wanted.filter((p) => !PROVIDERS[p]);
      if (unknown.length) {
        return { error: `unknown provider "${unknown[0]}" (expected one of: ${PROVIDER_NAMES.join(', ')}, all)` };
      }
      const store = loadStore();
      const perFile = envFileValues();

      const providers = wanted.map((name) => {
        const spec = PROVIDERS[name];
        const keys = spec.keys.map((k) => {
          const r = resolveKey(k.key, store, perFile, k.alsoWrite || []);
          const row = {
            key: k.key, kind: k.kind, required: !!k.required,
            present: r.present, source: r.source, sources: r.sources,
            masked: r.present ? maskValue(r.value) : null,
            hint: k.hint,
          };
          if (r.present && k.looksLike && !k.looksLike.test(r.value)) {
            row.warning = `value does not look like a ${k.key} (expected ${String(k.looksLike)})`;
          }
          if (r.present && r.sources.length > 1) {
            row.warning = `${row.warning ? `${row.warning}; ` : ''}defined in more than one place (${r.sources.join(', ')}) — the app may not read the one you just set`;
          }
          return row;
        });
        const missingRequired = keys.filter((k) => k.required && !k.present).map((k) => k.key);
        return {
          provider: name, label: spec.label, purpose: spec.purpose, console: spec.console,
          configured: missingRequired.length === 0,
          missingRequired,
          keys,
        };
      });

      return {
        ok: true,
        projectRoot,
        storeFile: existsSync(storePath) ? storePath : null,
        note: 'values are never returned — use env_sync to write them into the project env file',
        providers,
      };
    },

    /**
     * Store one credential locally. The value is written to disk and echoed back
     * only as a mask.
     */
    set({ key, value, provider } = {}) {
      const name = String(key ?? '').trim();
      if (!name) return { error: 'need a key name, e.g. SUPABASE_URL' };
      if (!KEY_RE.test(name)) {
        return { error: `invalid key "${name}" — use UPPER_SNAKE_CASE (A-Z, 0-9, _), 2-64 chars` };
      }
      const raw = value === undefined || value === null ? '' : String(value);
      if (!raw.trim()) {
        return { error: `need a value for ${name} (pass it via GRAPHYLOOP_SECRET_VALUE to keep it out of the process list)` };
      }
      if (Buffer.byteLength(raw, 'utf8') > MAX_VALUE_BYTES) {
        return { error: `value for ${name} exceeds ${MAX_VALUE_BYTES} bytes` };
      }

      const known = knownKeys();
      const spec = known.get(name);
      if (provider && provider !== 'all' && !PROVIDERS[provider]) {
        return { error: `unknown provider "${provider}" (expected one of: ${PROVIDER_NAMES.join(', ')})` };
      }

      const guard = ensureStoreGuard();
      const store = loadStore();
      const replaced = store.values[name] !== undefined;
      store.values[name] = raw;
      writeAtomic(storePath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), values: store.values }, null, 2)}\n`, 0o600);

      const warnings = [];
      if (!spec) {
        warnings.push(`${name} is not a known Supabase/Vercel key — stored anyway, but check the spelling`);
      } else if (spec.looksLike && !spec.looksLike.test(raw)) {
        warnings.push(`${name} does not match the expected shape ${String(spec.looksLike)} — stored anyway`);
      }
      if (spec && spec.kind === 'secret') {
        warnings.push(`${name} is server-only — never reference it from client-side code`);
      }

      return {
        ok: true,
        key: name,
        provider: spec ? spec.provider : (provider || null),
        kind: spec ? spec.kind : 'unknown',
        masked: maskValue(raw),
        replaced,
        storeFile: storePath,
        gitignore: guard,
        nextStep: 'run env_sync to write the project env file the app actually reads',
        warnings,
      };
    },

    /** Remove a stored credential (the store is the only source we own). */
    forget({ key } = {}) {
      const name = String(key ?? '').trim();
      if (!name) return { error: 'need a key name' };
      const store = loadStore();
      if (store.values[name] === undefined) return { error: `no stored value for "${name}"` };
      delete store.values[name];
      writeAtomic(storePath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), values: store.values }, null, 2)}\n`, 0o600);
      return { ok: true, key: name, removed: true, storeFile: storePath };
    },

    /**
     * Materialize stored/env credentials into the env file the framework reads,
     * plus a values-free .env.example. Values move file-to-file: the return value
     * carries key names, counts and conflicts only.
     *
     * @param {object} args
     * @param {string} [args.target]     env file name (default .env.local)
     * @param {string} [args.providers]  comma-separated provider filter
     * @param {string} [args.framework]  next|vite|astro|sveltekit|nuxt|expo (alias prefixes)
     * @param {boolean} [args.force]     overwrite a differing existing value (backs up first)
     */
    envSync({ target, providers, framework, force } = {}) {
      const names = providers
        ? String(providers).split(',').map((s) => s.trim()).filter(Boolean)
        : PROVIDER_NAMES;
      const unknown = names.filter((p) => !PROVIDERS[p]);
      if (unknown.length) {
        return { error: `unknown provider "${unknown[0]}" (expected one of: ${PROVIDER_NAMES.join(', ')})` };
      }
      const fileName = String(target || '.env.local').trim();
      if (fileName.includes('..') || /[\\/]/.test(fileName)) {
        return { error: `target must be a file name inside the project (got "${fileName}")` };
      }
      if (!fileName.startsWith('.env')) {
        return { error: `target must be an .env* file (got "${fileName}")` };
      }

      const store = loadStore();
      const perFile = envFileValues();
      const prefix = PUBLIC_PREFIXES[String(framework || '').toLowerCase()] || null;

      // Only sources we own can be written out: the local store and the process
      // env. Copying a value out of another .env file into this one would just
      // duplicate it and create the drift we warn about.
      const writable = new Map();
      const skipped = [];
      for (const provider of names) {
        for (const k of PROVIDERS[provider].keys) {
          const r = resolveKey(k.key, store, perFile, []);
          if (!r.present) { skipped.push({ key: k.key, reason: 'not set' }); continue; }
          if (r.source !== 'store' && r.source !== 'env') {
            skipped.push({ key: k.key, reason: `already provided by ${r.source}` });
            continue;
          }
          writable.set(k.key, r.value);
          for (const extra of k.alsoWrite || []) writable.set(extra, r.value);
          // Public keys get the framework's client-visible alias; secrets never
          // do — a NEXT_PUBLIC_SERVICE_ROLE_KEY ends up in the browser bundle.
          if (prefix && k.publicAlias && k.kind === 'public') writable.set(`${prefix}${k.key}`, r.value);
        }
      }

      if (writable.size === 0) {
        return {
          ok: true, wrote: 0, file: resolve(projectRoot, fileName), keys: [], skipped,
          message: 'nothing to sync — no credentials in the local store or the environment yet (use secrets_set first)',
        };
      }

      const filePath = resolve(projectRoot, fileName);
      const existed = existsSync(filePath);
      const currentText = existed ? readFileSync(filePath, 'utf-8') : '';
      const current = parseEnvFile(currentText);

      const added = [];
      const updated = [];
      const conflicts = [];
      for (const [key, value] of writable) {
        if (!current.has(key)) { added.push(key); continue; }
        if (current.get(key) === value) continue;
        if (force) updated.push(key);
        else conflicts.push(key);
      }

      if (added.length === 0 && updated.length === 0) {
        return {
          ok: true, wrote: 0, file: filePath, keys: [], skipped,
          conflicts,
          message: conflicts.length
            ? `${conflicts.length} key(s) already set to a different value in ${fileName} — pass force:true to overwrite (a timestamped backup is kept)`
            : `${fileName} already has every key`,
        };
      }

      let backup = null;
      if (existed && updated.length > 0) {
        backup = `${filePath}.bak-${stamp()}`;
        copyFileSync(filePath, backup);
      }

      // Rewrite in place: update existing lines, append the rest under a header.
      const lines = currentText.length ? currentText.split(/\r?\n/) : [];
      const toAppend = [];
      const handled = new Set();
      for (let i = 0; i < lines.length; i++) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(lines[i]);
        if (!m) continue;
        const key = m[1];
        if (!writable.has(key) || handled.has(key)) continue;
        handled.add(key);
        if (updated.includes(key)) lines[i] = envLine(key, writable.get(key));
      }
      for (const key of added) {
        if (handled.has(key)) continue;
        toAppend.push(envLine(key, writable.get(key)));
      }
      let out = lines.join('\n').replace(/\s*$/, '');
      if (toAppend.length) {
        out = `${out}${out ? '\n\n' : ''}# graphyloop: synced from the local secret store — do not commit this file\n${toAppend.join('\n')}`;
      }
      writeAtomic(filePath, `${out}\n`, 0o600);

      // Names-only example file so a teammate knows what to set without ever
      // seeing a value.
      const examplePath = resolve(projectRoot, '.env.example');
      const exampleCurrent = existsSync(examplePath) ? readFileSync(examplePath, 'utf-8') : '';
      const exampleKeys = parseEnvFile(exampleCurrent);
      const exampleMissing = [...writable.keys()].filter((k) => !exampleKeys.has(k));
      if (exampleMissing.length) {
        const block = exampleMissing.map((k) => `${k}=`).join('\n');
        writeAtomic(
          examplePath,
          `${exampleCurrent.replace(/\s*$/, '')}${exampleCurrent ? '\n\n' : ''}# graphyloop: required keys (names only — fill locally, never commit values)\n${block}\n`
        );
      }

      const guard = ensureEnvGitignore([fileName]);

      return {
        ok: true,
        file: filePath,
        wrote: added.length + updated.length,
        added, updated, conflicts, skipped,
        backup,
        example: exampleMissing.length ? examplePath : null,
        gitignore: guard,
        note: 'values were copied file-to-file and are not included in this result',
      };
    },

    /** Key names the store owns — no values. Used by preflight/deploy reporting. */
    storedKeys() {
      return Object.keys(loadStore().values).sort();
    },

    /** Resolve presence for an arbitrary key list (masked), for preflight checks. */
    presence(keys) {
      const store = loadStore();
      const perFile = envFileValues();
      return keys.map((key) => {
        const r = resolveKey(key, store, perFile, []);
        return { key, present: r.present, source: r.source, masked: r.present ? maskValue(r.value) : null };
      });
    },

    ensureStoreGuard,
    ensureEnvGitignore,
  };
}

export default { createSecrets, PROVIDERS, PROVIDER_NAMES, maskValue, parseEnvFile, SECRETS_FILE, ENV_FILES, knownKeys };
