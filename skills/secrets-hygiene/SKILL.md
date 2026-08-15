---
name: secrets-hygiene
description: Use this skill whenever a task needs an API key, database URL, deploy token or any other credential. Covers where credentials live, how to ask for one without putting it in the chat, how to get it into the file the app reads, and what must never be printed or committed.
---

# Credential handling

A credential in a chat transcript is a leaked credential: transcripts are logged,
summarized, and sometimes trained on. A credential in a committed file is worse —
it is public and permanent. Both are avoidable with the same short procedure.

## When to activate

- A task needs Supabase keys, a database URL, a Vercel/hosting token, or any API key.
- A tool call fails with "missing env var" / 401 / "invalid API key".
- Before any commit that touches `.env*`, config, or CI files.

## Procedure

1. **Check before asking.** `secrets_status` (or `graphyloop_secrets_status`)
   reports, per provider, which keys exist, where each comes from (process env,
   graphyloop store, `.env` file) and what is missing. It returns masks, never
   values.
2. **Ask by NAME, never by paste.** If a key is missing, tell the user the exact
   key name and where to obtain it (e.g. `SUPABASE_SERVICE_ROLE_KEY` from
   Settings → API). Then store it with `secrets_set` — it lands in
   `<project>/.graphyloop/secrets.json`, chmod 600, git-ignored before the first
   write. Never ask them to paste it into the conversation.
3. **Materialize it, do not read it.** `env_sync` copies stored values into the
   env file the framework actually reads (`.env.local` for Next/Vite), adds the
   framework public alias for public keys only, and refreshes a values-free
   `.env.example`. Values move file-to-file; they never pass through your context.
4. **Verify before using.** `preflight` (`target=db|deploy|all`) reports blockers
   and warnings. Clear the blockers first — a missing key found now costs nothing,
   found at integration it fails late and confusingly.

## Hard rules

- **Never print, echo, log or repeat a credential value** — not in a report, not
  in a command you show the user, not in a test fixture, not in a commit message.
- **Public vs secret is not cosmetic.** A `SUPABASE_ANON_KEY` may reach the
  browser (RLS still applies). A service-role key bypasses RLS entirely: it must
  never appear in client code, and never behind a `NEXT_PUBLIC_*` / `VITE_*`
  name, because those are inlined into the browser bundle.
- **No credential in source.** No literals, no "temporary" hardcoding, no keys in
  test files. Read from env; fail loudly with the key name when it is absent.
- **`.env*` must be git-ignored before it has content.** If an env file exists and
  `.gitignore` does not cover it, fix that before any commit.
- **Rotate, do not hide.** If a real credential was committed or pasted, say so
  immediately and tell the user to rotate it. Deleting the line does not
  un-leak it — the value stays in git history and in the transcript.
- **Least privilege.** Prefer a project-scoped token over an account-wide one;
  prefer anon + RLS over service-role; use service-role only in server-side code
  that needs it.

## Reporting

Say which keys are present and which are missing, by name, with masks only.
Never include a value in the summary, even truncated.
