---
name: supabase-setup
description: Use this skill when setting up or changing a Supabase database - schema, migrations, row-level security, seeds, typed clients, or connecting an app to a hosted project. Covers the safe order of operations and the checks that prevent a public table or an unreviewable schema change.
---

# Supabase setup and schema changes

Two failures dominate Supabase work: a table shipped with row-level security off
(every row readable by anyone holding the anon key), and a schema change made in
the dashboard so it exists in production and nowhere in the repo. The order below
prevents both.

## When to activate

- Adding or changing tables, columns, constraints, indexes, policies.
- Wiring an app to Supabase for the first time.
- "the query returns nothing" / "permission denied for table" symptoms.

## Order of operations

1. **Credentials first.** `secrets_status` → store what is missing with
   `secrets_set` → `env_sync`. Never paste a key into the chat (see `secrets-hygiene`).
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` — client-side, public.
   - `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS.
   - `SUPABASE_PROJECT_REF` / `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_URL` — CLI + migrations.
2. **`preflight target=db`.** Clear every blocker before touching the database.
3. **Schema as migration files, never dashboard edits.** `supabase migration new
   <name>`, or `supabase db diff --file <name>` to capture drift that already
   happened. A dashboard-only change cannot be reviewed, replayed on a teammate's
   machine, or rolled back.
4. **Table and its policies in the SAME migration.** A table without a policy is
   either fully closed or fully open — never leave that to a follow-up.
5. **Dry-run, then apply.** `supabase db push --dry-run` and read the SQL. Apply to
   a hosted database only with explicit user approval and a rollback note.
6. **Regenerate types.** `supabase gen types typescript --linked` so the
   backend/frontend contract stays type-checked.
7. **Seed realistic data.** Idempotent seed script (upsert), a few rows per table,
   so tests and manual checks have something to read.

## Schema rules

- Primary key on every table (`id uuid primary key default gen_random_uuid()` is a
  fine default). `created_at` / `updated_at` as `timestamptz`.
- Foreign keys with an explicit `on delete` choice — cascade / restrict / set null
  is a product decision, not a default.
- Index every column you filter, join or sort on. The referencing side of a foreign
  key is NOT indexed automatically.
- `numeric` for money, never `float`. `check` constraints or a real enum type for
  fixed sets. Prefer `not null` with a default over a nullable column every reader
  must handle.

## Row-level security checklist (every new table)

- `alter table X enable row level security;` present in the migration.
- One policy per operation you intend to allow (`select`, `insert`, `update`,
  `delete`), each naming the actor: `auth.uid() = user_id`, a tenant column, or a
  role check.
- No policy resolving to `true` for anon unless the data is genuinely public.
- **Verify with the anon key, not service-role.** Testing with service-role proves
  nothing — it bypasses every policy. Query as anon and confirm you see exactly
  what you should.
- Server-only paths (admin actions, webhooks, cron) may use service-role, and must
  live in server code only.

## Client wiring

- One module creates the client; nothing else calls `createClient`.
- Server and browser clients are separate (`@supabase/ssr` for Next.js) — cookie
  handling differs, and mixing them silently breaks auth.
- `supabase-js` returns `{ data, error }`: check `error` on every call. Swallowing
  it is how "returns nothing" bugs ship.

## Reporting

Name the migration files, the policies added per table, the dry-run output, and the
anon-key verification result. If migrations reached a hosted database, include the
rollback path.
