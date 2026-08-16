---
name: frontend-security
description: Use this skill when writing or reviewing client-side code that renders user data, stores tokens, calls an API, or embeds third-party scripts - React/Next/Vue/Svelte or plain DOM. Covers XSS sinks, token storage, environment-variable leakage, CSP and security headers, iframe and postMessage trust, and the checks that catch a public key that is actually a private one.
---

# Frontend security

Server-side review misses the frontend because the frontend "has no secrets" — and
then a service-role key ships in a `NEXT_PUBLIC_*` var, a markdown renderer writes
raw HTML into the DOM, and an access token sits in `localStorage` where any
injected script can read it. This skill is the client-side pass: the sinks, the
storage, the headers, and what to verify before calling it done.

## When to activate

- Rendering anything a user or an API supplied (HTML, markdown, SVG, URLs, filenames).
- Auth in the browser: login, logout, token refresh, "remember me", role-based UI.
- Adding an env var, an analytics/chat/payment script, an iframe, or a `postMessage` channel.
- Reviewing a PR that touches any of the above, or a "make it work in the browser" fix.

## The five checks, in order

1. **Secrets** — no key that grants privilege may reach the bundle.
2. **Sinks** — every place a string becomes markup, a URL, or code.
3. **Token storage** — where credentials live between requests.
4. **Headers** — CSP and friends, set where the app is actually served from.
5. **Third-party** — scripts, iframes, and messages you did not write.

## 1. Secrets in the bundle

- A var is public the moment its name is prefixed (`NEXT_PUBLIC_`, `VITE_`,
  `PUBLIC_`, `REACT_APP_`, `EXPO_PUBLIC_`) or referenced from a client component.
  Prefixing a server key does not make it safe — it publishes it.
- Never prefix: service-role keys, admin/API secrets, webhook signing secrets,
  SMTP or DB credentials, private OAuth client secrets. See `secrets-hygiene`.
- Grep before shipping: `NEXT_PUBLIC_.*(SERVICE|SECRET|PRIVATE|ADMIN|TOKEN|PASSWORD)`,
  and search the built output (`.next/static`, `dist/assets`) for the last 8
  characters of any server key you hold. A hit in the build is a leak, not a warning.
- Anything the browser can call, an attacker can call with the same key. If a
  key must stay secret, the call belongs in a route handler / server action /
  edge function, and the client calls that.

## 2. XSS sinks

| Sink | Rule |
|---|---|
| `dangerouslySetInnerHTML`, `v-html`, `{@html}`, `.innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` | Only with output from a maintained sanitizer (DOMPurify or equivalent), allow-listed tags/attrs, sanitized where it is rendered — not where it was fetched |
| `href` / `src` / `action` / `formaction` from data | Parse and allow-list the scheme; reject `javascript:`, `data:`, `vbscript:`. Relative or `https:` only |
| `<a target="_blank">` | `rel="noopener noreferrer"` |
| `style` / CSS custom properties from data | Never interpolate raw user values into `style` strings |
| `eval`, `new Function`, `setTimeout("string")`, dynamic `import(userInput)` | Not with user input. Ever |
| Inline SVG upload/preview | Sanitize as HTML — SVG carries `<script>` and event handlers |
| `JSON.parse(localStorage)` then render | Treat as untrusted: another script may have written it |
| Server-rendered JSON in a `<script>` tag | Escape `<`, `>`, `&`, `\u2028/\u2029` or use `application/json` + `textContent` |

Framework escaping covers interpolation only. JSX escapes `{value}`; it does not
escape `dangerouslySetInnerHTML`, attribute-injected URLs, or SSR'd script bodies.

Markdown is HTML. `marked`/`markdown-it` output must be sanitized unless the
renderer is configured to disallow raw HTML.

## 3. Token and session storage

- Preferred: `httpOnly; secure; sameSite=lax|strict` cookie set by the server. JS
  cannot read it, so an injected script cannot steal it.
- `localStorage`/`sessionStorage` are readable by every script on the origin,
  including a compromised dependency. Use only for non-credential UI state.
- In-memory (module/context) plus a refresh call is acceptable for SPAs — it dies
  with the tab, which is the point.
- Never put a token in a URL/query string (logs, referrers, history) or in a
  client-side cookie without `secure`.
- Log out means: server invalidates, client clears store **and** in-memory state.
  A "logout" that only navigates leaves the session alive.
- Client-side role checks are UX, not authorization. Hiding an admin button while
  the API still answers `role=admin` calls from anyone is an open door — the server
  must enforce it (see `api-hardening`).

## 4. Headers and CSP

Set headers where the app is served (`next.config` headers, middleware, hosting
config, reverse proxy) and verify with a real request, not by reading the config:

```
curl -sI https://host/ | grep -iE 'content-security-policy|x-frame|x-content-type|referrer|strict-transport|permissions-policy'
```

- **CSP** is the one that actually stops XSS escalation. Aim for
  `default-src 'self'`, no `unsafe-inline`/`unsafe-eval` in scripts (nonce or hash
  for the framework's inline bootstrap), explicit `connect-src`, `img-src`,
  `frame-ancestors 'none'` unless embedding is a feature. Ship in
  `Content-Security-Policy-Report-Only` first, read the reports, then enforce.
- `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin`
  · `Strict-Transport-Security` on HTTPS · `Permissions-Policy` denying camera /
  microphone / geolocation you do not use.
- CORS is not a frontend fix. Widening `Access-Control-Allow-Origin` to `*` with
  credentials to "make fetch work" removes a control instead of fixing the bug.

## 5. Third-party and cross-origin

- Every external `<script>`: pin the version, prefer `defer`, add `integrity` +
  `crossorigin` when the CDN supports SRI, and add its origin to CSP explicitly.
  A tag-manager container is arbitrary code execution by design — treat it as such.
- `postMessage`: always send with an explicit target origin (never `'*'`), and on
  receive verify `event.origin` against an allow-list **before** reading
  `event.data`. Validate the payload shape too.
- Iframes you embed: `sandbox` with the minimum tokens, `allow` list for
  permissions, `referrerpolicy`. Untrusted embeds never get
  `allow-scripts allow-same-origin` together — that combination lets the frame
  escape the sandbox.
- File inputs: validate type and size client-side for UX, and never trust the
  result. Preview images via `URL.createObjectURL`, never by injecting markup.

## Verification before reporting

- Build the app, then grep the output for server key fragments and for the
  prefixed-secret pattern above. Zero hits.
- `curl -sI` the running app and paste the security headers you actually got.
- For each sink you touched: the sanitizer call site, or the reason it is safe.
- A rendering test with a payload, not a claim:
  `<img src=x onerror=alert(1)>`, `javascript:alert(1)` in a link field,
  `"><script>alert(1)</script>` in a search box. Assert escaped text in the DOM.

## Reporting

List findings as `severity · file:line · what an attacker does · fix`. Separate
"fixed here" from "needs a server change" (those belong to `api-hardening` /
`chadi-backend`). If a check could not run — no build, no running server — say
which one and why instead of implying it passed.
