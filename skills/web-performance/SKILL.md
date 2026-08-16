---
name: web-performance
description: Use this skill when a page or app feels slow, a bundle grew, Core Web Vitals regressed, or a build/deploy needs a performance budget - LCP, INP, CLS, TTFB, hydration cost, image and font strategy, cache headers, and render-blocking work. Covers measuring before changing, the fixes ordered by payoff, and proving the win with numbers.
---

# Web performance (front of the stack)

Frontend performance work goes wrong in one way: guessing. Someone memoizes a
component while a 900 KB font and a synchronous third-party script own the
critical path. Measure, fix the biggest item, measure again — and keep the number.

## When to activate

- "It's slow", "LCP regressed", "the bundle doubled", "the list janks", low
  Lighthouse/PageSpeed score, a CI budget failing.
- Before shipping a new page, dashboard, or heavy dependency.
- After adding an animation library, chart library, map, video, or analytics tag.

## Step 1 — baseline (never skip)

Record numbers before touching code; without a baseline there is no win to claim.

```
npx lighthouse http://127.0.0.1:PORT --preset=desktop --quiet --output=json --output-path=./.perf/base.json
npx lighthouse http://127.0.0.1:PORT --quiet   # default = mobile throttling, the honest one
ANALYZE=true npm run build        # next: @next/bundle-analyzer
npx vite-bundle-visualizer        # vite
npx source-map-explorer 'dist/assets/*.js'
```

Capture: LCP, INP (replaces FID), CLS, TTFB, total JS transferred, largest chunks,
request count, and the field data if you have RUM. Note whether the run is
throttled — an unthrottled localhost number is not a result.

Targets (75th percentile, mobile) — the three Core Web Vitals plus TTFB, which is a
diagnostic for the first of them rather than a vital itself: **LCP ≤ 2.5 s ·
INP ≤ 200 ms · CLS ≤ 0.1 · TTFB ≤ 0.8 s**, and a JS budget you write down (e.g.
≤ 170 KB gzipped for the initial route).

## Step 2 — fixes, ordered by payoff

**LCP (usually an image or a slow server)**
- Find the LCP element in the Lighthouse trace before optimizing anything.
- Hero image: correct format (AVIF/WebP), correct dimensions, `priority` /
  `fetchpriority="high"`, `preload` the actual file; every other image `loading="lazy"`
  + `decoding="async"`.
- Kill render-blocking: no `@import` chains, inline critical CSS, `defer` scripts,
  `preconnect` to the font/API origin, self-host fonts with `font-display: swap`
  and subset them (`unicode-range`). One variable font beats four weights.
- Server side: cache the data the first paint needs, stream (RSC/Suspense) instead
  of awaiting everything, and check TTFB separately — a 1.5 s TTFB is a backend bug
  (query plan, N+1, cold start), not a CSS problem.

**INP / main-thread**
- Split the bundle: dynamic `import()` for routes and anything below the fold
  (editors, charts, maps, date pickers, emoji sets). Never import a whole icon or
  lodash package for one symbol.
- Client JS is a budget: keep components server-rendered where the framework allows
  it; a `"use client"` at the top of a layout ships the entire tree.
- Break up long tasks (> 50 ms): `scheduler.yield()`/`setTimeout` chunks,
  `startTransition` for non-urgent updates, debounce input handlers, move parsing
  or crypto to a Web Worker.
- Lists: virtualize past a few hundred rows, stable `key`s, avoid new object/array
  literals in props on every render. Memoize only where a profile shows the cost.
- Animate `transform`/`opacity` only; anything touching layout thrashes. Read then
  write — never `getBoundingClientRect` inside a write loop.

**CLS**
- Explicit `width`/`height` or `aspect-ratio` on every image, video, iframe, ad slot.
- Reserve space for banners, skeletons, and async content; never insert above
  existing content after paint.
- Fonts: matched fallback metrics (`size-adjust`, `ascent-override`) or `next/font`
  to remove the swap shift.

**Transfer and caching**
- Immutable hashed assets: `cache-control: public, max-age=31536000, immutable`;
  HTML `no-cache` (or a short s-maxage + `stale-while-revalidate`) at the CDN.
- Compression on (brotli) — verify with `curl -sI -H 'accept-encoding: br'`.
- Drop the dependency you added for one helper; prefer the platform (`Intl`,
  `URL`, `structuredClone`, CSS `:has`).

## Step 3 — prove it and keep it

- Re-run the exact same command as the baseline, same throttling, and report
  before → after per metric. A change with no measurement is not done.
- Land a budget so the win survives: `lighthouse-ci` assertions, a
  `performance.budget.json`, `size-limit`, or a bundle-size check in CI.
- Add RUM (`web-vitals` → your analytics endpoint) if the app has real users —
  lab numbers do not catch a slow third-party tag on a cold cache.

## Anti-patterns

- Optimizing what the profile did not blame.
- Wrapping everything in `memo`/`useMemo`/`useCallback` as policy — cost, no win,
  and it hides the real regression.
- `loading="lazy"` on the hero image (delays LCP).
- Preloading everything — preload competes with the critical request.
- Removing a feature to hit a number without saying so.

## Reporting

A table of metric · before · after · how measured, then the file-level changes that
produced it, then the budget added. Name what regressed elsewhere (e.g. bundle down
but TTFB up) rather than reporting only the improved metric. If a number could not
be measured, say which and why.
