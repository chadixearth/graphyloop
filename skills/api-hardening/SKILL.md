---
name: api-hardening
description: Use this skill when building or reviewing a server-side endpoint, route handler, server action, webhook, cron job, or background worker in any language. Covers per-route authorization and IDOR, input validation at the trust boundary, rate limiting, SSRF, file uploads, JWT and session handling, tenant isolation, and error or log leakage.
---

# API hardening

Most breached endpoints were authenticated. The pattern is not "no login" — it is
"logged in, and the handler never checked that this row belongs to this caller."
Authorization is per route, per object, every time. This skill is the server-side
pass that goes route by route.

## When to activate

- Any new or changed endpoint: REST route, GraphQL resolver, RPC/tRPC procedure,
  server action, webhook receiver, queue consumer, cron entry.
- Anything touching auth, sessions, roles, tenants, payments, uploads, or PII.
- A bug report shaped like "user A can see user B's data" or "it 500s with a weird message".
- Before a deploy that exposes a new surface publicly.

## Route inventory first

Enumerate what exists before judging it. Grep the router, not your memory:

```
# Node/Next
rg -n "app\.(get|post|put|patch|delete)|router\.(get|post|put|patch|delete)" src
rg -n "export async function (GET|POST|PUT|PATCH|DELETE)" app
rg -n "'use server'" -l app src
# Python / Go / PHP
rg -n "@app\.(route|get|post)|@router\.(get|post)" .
rg -n "http.HandleFunc|mux.Handle" .
rg -n "Route::(get|post|put|delete)" routes
```

Build a table: method+path · auth required? · role/scope · object-ownership check ·
input validated? · rate limited? Every empty cell is a finding.

## 1. Authentication vs authorization

- Authentication answers *who*; authorization answers *may they, on this object*.
  Middleware usually gives you the first and never the second.
- **Default deny.** Public routes are an explicit allow-list, not "everything the
  middleware matcher forgot". Verify the matcher: a regex that misses
  `/api/admin/../users` or a trailing slash is a bypass.
- **IDOR / BOLA — the top one.** Any handler taking an id from the request must
  scope the query by the caller:
  `where id = :id and owner_id = :caller` (or tenant/org id). Filtering after the
  fetch, or trusting a `userId` sent in the body/JWT payload the client can
  re-sign, is not a check.
- Return **404 for objects the caller may not see**, 403 only where existence is
  not sensitive. A 403 confirms the id exists.
- Role checks server-side only, from the session/token verified this request —
  never from a header, query param, or hidden form field.
- Multi-tenant: the tenant id comes from the session, never from the payload. In
  Postgres/Supabase, RLS is the second wall, not the only one — see `supabase-setup`.

## 2. Input validation at the boundary

- Validate at the edge with a schema (zod/valibot, pydantic, JSON Schema, DTO +
  validator) and pass typed data inward. Reject unknown keys — a permissive parser
  is how mass assignment reaches `role: "admin"`.
- Allow-list, never deny-list: types, enums, ranges, lengths, formats, array size,
  total body size. Cap pagination `limit`; unbounded `limit` is a free DoS.
- Never interpolate input into SQL, NoSQL filters, shell commands, file paths,
  template strings, or regexes. Parameterized queries or an ORM's binding API;
  `path.resolve` + a prefix check for paths; no user-built regex (ReDoS).
- Sort/filter/include params: map names to an allow-list of columns/relations, do
  not pass them through.
- Webhooks are untrusted input with a signature: verify the HMAC over the **raw**
  body before parsing (a body parser that rewrites bytes breaks the check),
  enforce a timestamp window, and make handling idempotent by event id.

## 3. Rate limiting and abuse

- Limit by identity where you have one, by IP otherwise, and always on: login,
  signup, password reset, OTP/MFA, token refresh, search, export, upload, and any
  endpoint that sends email/SMS or costs money per call.
- Store counters where every instance sees them (Redis/Upstash/DB), not in process
  memory behind a load balancer.
- Progressive cost on auth failure (delay, lockout window, CAPTCHA) plus
  constant-time credential comparison and identical failure messages, so the
  endpoint does not become a user-enumeration oracle.
- Cap payload size and request timeout at the edge before the handler runs.

## 4. SSRF, uploads, and outbound calls

- Server-side fetch of a user-supplied URL: allow-list host or scheme, resolve DNS
  and reject private/loopback/link-local ranges (`127/8`, `10/8`, `172.16/12`,
  `192.168/16`, `169.254/16`, `::1`, `fc00::/7`), disable redirect following or
  re-validate each hop, and set a timeout. Cloud metadata endpoints
  (`169.254.169.254`) are the classic target.
- Uploads: validate real content type by magic bytes, not the extension or the
  client's `Content-Type`; cap size; generate a random stored filename; store
  outside the web root or in object storage; serve with
  `Content-Disposition: attachment` and `nosniff`; never `chmod +x`. Prefer
  pre-signed direct-to-storage uploads with a short TTL.
- Any outbound HTTP: explicit timeout, bounded retries with backoff, and a circuit
  breaker for the dependency you cannot trust to stay up.

## 5. Tokens, sessions, cookies

- Sessions: server-side store or signed cookie with rotation on login and
  privilege change; invalidate on logout and password change.
- JWT: verify signature **and** `alg` (reject `none`, pin the expected algorithm),
  `iss`, `aud`, `exp`; short TTL; refresh tokens rotated and revocable. A JWT you
  cannot revoke is a password with an expiry date.
- Cookies: `httpOnly`, `secure`, `sameSite`, narrow `path`, no wildcard `domain`.
  State-changing routes need CSRF protection unless they are strictly
  `sameSite=strict|lax` + non-form content type, and you verified that.
- Never log, echo, or return a token, password hash, or full connection string.

## 6. Errors, logs, and responses

- Client gets a stable code + safe message; the stack trace, SQL, and driver error
  stay in the server log. A 500 body that names the table is reconnaissance.
- Never return more fields than the caller needs — serialize with an explicit
  allow-list (`select` the columns, or map to a response DTO). `SELECT *` into JSON
  is how password hashes and internal flags leak.
- Redact secrets/PII in logs; log the actor, action, object id, and outcome for
  security-relevant events (login, permission change, delete, export).

## Verification before reporting

- For each route you touched, show the ownership check and the validation call —
  file:line, not prose.
- Prove the control with a request: same endpoint, another user's id, expect
  404/403; malformed body, expect 422; N+1 rapid calls, expect 429.
  ```
  curl -si -X GET  host/api/orders/<other-users-id> -H "authorization: Bearer $A"   # expect 404/403
  curl -si -X POST host/api/orders -H "content-type: application/json" -d '{"role":"admin"}'  # rejected
  ```
- Unauthenticated call to every new route: expect 401, never data.
- Run the suite. A security fix without a regression test comes back.

## Reporting

`severity · route · file:line · exploit path · fix`, ordered by exploitability.
State the controls you verified with output, and separately the ones you could not
test and why. Contradicting a claim of "already handled by middleware" requires
naming the middleware and the matcher line — otherwise treat it as unverified.
