---
name: web-accessibility
description: Use this skill when building or reviewing UI that has to be usable by keyboard and screen reader - forms, modals, menus, tabs, tables, toasts, custom controls, dark mode, or a WCAG/508 compliance request. Covers semantics before ARIA, focus management, names and errors, contrast, motion, and how to verify with axe plus a keyboard pass instead of guessing.
---

# Web accessibility (WCAG 2.2 AA, implementation-level)

Accessibility fails in a small number of predictable places: a `div` wired with
`onClick`, a modal that leaves focus behind it, an input whose label is only a
placeholder, an error announced in red and nowhere else, and an icon button with no
name. Fix those five and most of an audit disappears.

## When to activate

- Building or changing forms, dialogs, dropdowns, menus, tabs, accordions,
  carousels, data tables, toasts, or any custom control.
- Anything described as "compliance", "WCAG", "508", "screen reader", "keyboard".
- A UI review pass, or a design handoff with hover-only affordances or thin grey text.

## Rule 0: semantics before ARIA

Use the element that already has the behavior. `<button>`, `<a href>`, `<input>`,
`<select>`, `<dialog>`, `<details>`, `<table>`, `<nav>`, `<main>`, `<label>`,
`<fieldset>`. Each brings focusability, keyboard handling, and a role for free.

- `<div onClick>` is not a button: no focus, no Enter/Space, no role. If you must,
  it needs `role="button" tabindex="0"` **and** an Enter+Space handler — three ways
  to reintroduce a bug the native element never had.
- Wrong ARIA is worse than no ARIA. `role="button"` on a link, `aria-hidden` on a
  focusable node, or an `aria-label` that contradicts visible text actively misleads.
- One `<h1>` per page; heading levels never skip. Landmarks (`header`, `nav`,
  `main`, `footer`) present once each, `main` exactly once.

## Keyboard and focus

- Everything interactive is reachable with Tab in visual order and operable with
  Enter (buttons/links), Space (buttons/checkboxes), arrows (radios, tabs, menus,
  listbox), Escape (dismiss).
- Never `outline: none` without a replacement. Visible focus needs ≥ 3:1 contrast
  against the adjacent color; `:focus-visible` is the right hook.
- Dialogs and drawers: move focus in on open (first focusable or the heading), trap
  it while open, restore it to the trigger on close, close on Escape, and mark the
  rest of the page inert (`inert` attribute or `aria-hidden` on the background).
- `tabindex` is `0` or `-1`. Positive values reorder the whole page and are a bug.
- Skip link to `#main` as the first focusable element, visible on focus.
- Never trap focus in a loop the user cannot leave, and never move focus on
  keystroke while typing (that includes "helpful" autofocus on search-as-you-type).

## Names, states, errors

- Every input has a programmatic name: a `<label for>` (preferred), `aria-label`, or
  `aria-labelledby`. Placeholder is not a label — it vanishes on input and often
  fails contrast.
- Icon-only controls get an accessible name (`aria-label="Close"`), and decorative
  icons/SVGs get `aria-hidden="true"`.
- Images: meaningful → describe the meaning; decorative → `alt=""`. Never a filename.
- State goes through the platform: `aria-expanded`, `aria-selected`,
  `aria-checked`, `aria-current`, `aria-pressed`, `disabled`, `aria-invalid`.
  Colour alone is never the signal (WCAG 1.4.1).
- Errors: text next to the field, tied with `aria-describedby`, `aria-invalid="true"`
  on the control, and focus moved to the first error on submit. A summary region
  with `role="alert"` for the count.
- Async status (saving, loaded, toast) announced via a live region
  (`aria-live="polite"`, `role="status"`; `assertive` only for genuine
  interruptions). A spinner with no text announces nothing.
- Required fields marked in text or `required`, not only with a red asterisk.

## Visual, motion, zoom

- Contrast: 4.5:1 body text, 3:1 for ≥ 24px or bold ≥ 19px, 3:1 for icons,
  borders, and focus rings. Check both themes — dark mode regressions are common.
- Target size ≥ 24×24 CSS px (2.5.8), with spacing when smaller is unavoidable.
- Works at 200% zoom and at 320px width with no horizontal scroll; no fixed
  viewport that blocks zoom (`maximum-scale=1` / `user-scalable=no` are violations).
- Respect `prefers-reduced-motion`: no parallax, autoplay, or long transitions when
  set. Nothing flashes more than 3×/second. Autoplaying media has a pause control.
- Hover-only content must also appear on focus, and must be dismissible.
- `lang` on `<html>`, a unique descriptive `<title>` per route.

## Verification (run it, do not assert it)

```
npx playwright test                                # your a11y specs
npm i -D @axe-core/playwright                      # then assert zero violations
npx lighthouse http://127.0.0.1:PORT --only-categories=accessibility --quiet
```

```js
// axe in a Playwright spec — the cheapest real signal
import AxeBuilder from '@axe-core/playwright'
const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag22aa']).analyze()
expect(violations, JSON.stringify(violations.map(v => v.id))).toEqual([])
```

Automation catches roughly a third of it. Also do the manual pass:

1. Tab through the whole flow — order sane, focus always visible, nothing skipped
   or trapped.
2. Open and close every dialog/menu with keyboard only; confirm focus returns.
3. Submit a form empty — is the error reachable, named, and announced?
4. Zoom to 200% and narrow to 320px.
5. One screen-reader spot check (NVDA / VoiceOver / Narrator) on the changed flow.

## Reporting

Report `WCAG criterion · component · file:line · what a keyboard or screen-reader
user hits · fix`. Include the axe violation ids you cleared and the keyboard steps
you actually performed. If no browser was available, say the automated pass did not
run — do not present a code read as a verified result.
