---
name: api-contract-design
description: Use this skill when freezing the interface between a backend and its clients before parallel work starts, or when changing an endpoint other code already calls - request/response shapes, status codes, error envelope, pagination, filtering, idempotency, versioning, and the breaking-change rules. Covers writing the contract as a checkable artifact so frontend, tests, and backend cannot drift.
---

# API contract design

Parallel lanes fail at the seam: the backend returns `{data: {...}}`, the frontend
was written against `{...}`, and the tests mock a third shape. Freezing the contract
first is what makes wave-style parallel work safe (see `graphyloop-waves`) — this
skill is what "frozen" means in practice.

## When to activate

- Wave 0 / contract stage of any feature with a backend and a client.
- Adding an endpoint, or changing one that already has callers.
- A field rename, a nullable-to-required change, an error-shape change.
- "The frontend is broken but the API works" — usually a contract drift.

## The contract artifact

A contract is a file in the repo, not a paragraph in chat. One of:

- OpenAPI/JSON Schema (`openapi.yaml`) — best when clients are generated from it.
- A shared schema module (zod/valibot/pydantic) imported by both handler and client
  — the type checker becomes the enforcer.
- A typed client + a fixtures file consumed by the tests.

Whichever you pick, it must state per endpoint: **method + path · auth + required
role/scope · path/query params with types and defaults · request body schema ·
success status + response schema · every error status with its code · idempotency
and rate-limit behavior**. Anything not written down is not part of the contract and
will be implemented differently by each lane.

## Shapes and naming

- One envelope for the whole API, chosen once: either bare resources
  (`{"id": ...}`) or wrapped (`{"data": ..., "meta": ...}`). Mixing them per
  endpoint is the single most common drift.
- Consistent casing (`snake_case` or `camelCase`) across every payload — including
  nested objects and error fields. Pick one; a mapper at the boundary if the
  database disagrees.
- Timestamps: ISO 8601 UTC strings (`2026-08-16T14:03:00Z`). Money: integer minor
  units or a decimal string plus a `currency` — never a float. Ids: string in JSON
  even when numeric in the database.
- Nullable vs absent is a decision, not an accident: prefer explicit `null` for
  "known empty", omit only for "not requested" (sparse fieldsets).
- Collections always return an object, never a bare top-level array — you will need
  to add `meta` later, and an array cannot grow.
- Enums are closed and documented; clients must tolerate an unknown value without
  crashing (render a fallback).

## Status codes and errors

| Situation | Code |
|---|---|
| Read ok / update ok | `200` |
| Created (add `Location`) | `201` |
| Accepted for async work | `202` |
| Deleted, nothing to return | `204` |
| Malformed syntax / unparsable | `400` |
| Not authenticated | `401` |
| Authenticated, not allowed | `403` |
| Missing, or hidden from this caller | `404` |
| Conflict: duplicate, version mismatch | `409` |
| Valid syntax, failed validation | `422` |
| Rate limited (add `Retry-After`) | `429` |
| Server fault | `500` / `503` |

One error envelope for every failure, machine-readable first:

```json
{ "error": { "code": "validation_failed", "message": "Human readable summary",
             "details": [{ "field": "email", "code": "invalid_format" }],
             "request_id": "req_01H..." } }
```

- `code` is stable and switch-able by clients; `message` may change freely.
- Never return a 200 with `{"success": false}` — every caller then has to unwrap
  errors twice, and monitoring sees no failures.
- Never leak stack traces, SQL, or internal ids (see `api-hardening`).
- The same validation failure returns the same code from every endpoint.

## Collections: pagination, filtering, sorting

- Cursor pagination (`?limit=&cursor=`) for anything that grows or reorders;
  offset (`?page=&per_page=`) only for small stable sets. Return
  `meta: {next_cursor, has_more}` — a total count only if you can afford the query.
- `limit` has a default **and** a hard maximum, both documented.
- Filter and sort parameters are an allow-list of named fields
  (`?sort=-created_at&status=open`), never raw column names or expressions.
- Empty result is `200` with an empty list, not `404`.

## Change rules (what breaks a client)

**Safe (additive):** new optional field in a response, new optional request field
with a default, new endpoint, new enum value clients are told to tolerate, relaxed
validation.

**Breaking:** removing/renaming a field, changing a type or casing, making an
optional request field required, tightening validation, changing a status code or
error `code`, changing pagination style, changing the envelope.

For a breaking change: version it (`/v2/...` or a header), keep the old path alive
with a deprecation window (`Deprecation` / `Sunset` headers, changelog entry),
migrate callers, then remove. Grep for callers first — `rg -n "endpoint-path"` across
the client, mobile app, tests, and any other service — and list them in the plan.
Never break a contract mid-wave: if the implementation cannot honor it, stop and
re-freeze with the integrator rather than silently shipping a different shape.

## Verification

- Contract file committed **before** the parallel lanes start; every lane cites it.
- Handler validates against the same schema the client types come from (shared
  module, or generated client checked into CI).
- One test per endpoint asserting status + shape, plus one asserting the error
  envelope. Contract tests belong to the contract, not to the implementer.
- `curl` the real endpoint and diff the body against the contract for the fields
  that matter — types and casing included.
- If the API is public, the spec lints (`npx @redocly/cli lint openapi.yaml`).

## Reporting

Name the contract file and commit, list endpoints with status codes, flag every
breaking change with its affected callers, and state what the tests assert. If the
implementation deviated from the frozen contract, report the deviation explicitly —
an undocumented deviation is the failure this skill exists to prevent.
