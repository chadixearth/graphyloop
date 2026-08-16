---
name: lifewood-branding
description: Apply Lifewood's official brand identity (colors, Manrope typography, and the Lifewood logo) to any deliverable. Use this skill WHENEVER you are creating something for Lifewood or the Lifewood PH Team — one-pagers, single slides, Word documents, PowerPoint decks, PDFs, reports, memos, letters, technical or developer documentation, API docs, runbooks, generated or AI images, posters, or video shorts and reels. Trigger it even when the user only says make this on-brand, Lifewood style, use our branding, or names the company; do not wait for them to list the hex codes. If a Lifewood logo, the green or cream or orange palette, or Manrope should appear on the output, this skill applies.
---

# Lifewood Branding

This skill governs *how Lifewood deliverables look and compose*. Document-building mechanics (python-pptx, fpdf2, docx) live in the `pptx`, `pdf`, or `docx` skills. This skill owns brand compliance and layout discipline.

## 1. Brand assets

Logo files in `assets/`. **Never recolor, redraw, crop, distort, rotate, or re-typeset.** Place the file as-is.

| File | Use on |
|------|--------|
| `assets/lwlogo_lightmode.png` | Light backgrounds (Paper, White, Sea Salt) |
| `assets/lwlogo_darkmode.png` | Dark backgrounds (Dark Serpent, Castleton Green) |
| `assets/LW_Color.jpg` | Internal reference only — never in output |

Logo native ratio: ~5.5:1 (1655×300). Preserve exactly when sizing. Both have transparent backgrounds.

## 2. Color palette

| Name | Hex | Role |
|------|-----|------|
| Paper | `#F5EEDB` | Soft background / dark-bg text |
| White | `#FFFFFF` | Background |
| Sea Salt | `#F9F7F7` | Background (preferred default) |
| Castleton Green | `#046241` | Headings |
| Dark Serpent | `#133020` | Subheadings + body text |
| Saffron | `#FFB347` | Accent — rules, callout fills, chart highlights, hexagon |
| Earth Yellow | `#FFC370` | Accent — softer highlight, fills |

Derived tints (surfaces only, never text):
- `#EFEAD9` — inline-code chips, table header fills
- `#E8E5DF` — hairline rules and dividers (0.5–1pt)

**Assignment rules (one place, no repetition):**
- Backgrounds: `#F9F7F7` (preferred) or `#FFFFFF`.
- Headings (H1/H2): `#046241`.
- Subheadings + body: `#133020`.
- Accents: `#FFB347` / `#FFC370` only. Never for body text.
- Dark green backgrounds: text flips to `#F5EEDB` / `#FFFFFF`; use dark-mode logo.

## 3. Typography

- **Font:** Manrope. Fallback chain: Inter → Helvetica Neue → Arial → sans-serif.
- **Monospace:** JetBrains Mono → SF Mono → Consolas → Menlo → Courier New.
- **H1 (doc title):** weight 800, 26–32pt, `#046241`.
- **H2 (`X.0` section):** weight 700, 17–20pt, `#046241`. Small Saffron section number above it.
- **H3 (`X.1` sub-section):** weight 600, 12–13pt, `#133020`.
- **Body:** 10.5–12pt, weight 400, `#133020`, line height 1.4–1.5×.
- **Caption / table body:** 9–10pt.

## 4. Numbered heading system

Hierarchy: `1.0`, `1.1`, `1.1.1`, `2.0`, `2.1` … Content starts at `1.0`. Applies to one-pagers, documents, decks. TOC entries must match section titles exactly.

## 5. Logo placement

| Context | Position |
|---------|----------|
| Documents, one-pagers, slides, AI images, PPTX, PDF | **Bottom-right — EVERY page (cover, TOC, content)** |
| Video shorts / reels | **Top-right** |
| Vertical reel/story frame | **Top-right** |

Clear space: at least the hexagon height on all sides. Never touch edges or busy areas — pick the contrasting light/dark variant instead. No page or slide may lack the bottom-right logo — cover and TOC included. Cover hero logos (top-center/top-left) are cover-only design; the bottom-right footer logo is added on the cover IN ADDITION.

## 6. Layout mechanics

**Canvas — PowerPoint size, always.** Every Lifewood deliverable is **13.333 × 7.5 in (338.66 × 190.5 mm), 16:9 landscape** — decks, manuals, workflow docs, reports, one-pagers alike. **A4 is forbidden**, including for manuals. A page and a slide are the same rectangle, so a PDF page dropped next to a slide shows no size shift.

**Page grammar — one shape, every page.** Header band (folio kicker → one-line title → hairline) → body band → footer band (hairline → document-title label → `Page X of Y` → bottom-right logo). Same y positions, same sizes, same colors on every content page, including continuation pages. Cover, TOC and section dividers share the same footer band (logo always; no rule/label/folio on cover and TOC) and the same left Saffron rail composition. Design variants (`editorial` / `swiss`) change palette only — never geometry.

**Columns.** A 16:9 page is too wide for one text measure: body copy runs in **two columns** with a 12 mm gutter. Single-column elements (mixed-page paragraphs, step lists) cap at ~68% of content width. Tables, code blocks and callouts may span the full content width.

**Alignment.** Body text: left-aligned, ragged right. Never justified. Headings: left-aligned. Numeric table columns: right-aligned.

**Spacing.**
- Line height: 1.4–1.5× font size. Wrapped lines within one paragraph use that leading only — never apply paragraph spacing between wrapped lines of the same paragraph.
- Space between paragraphs: 0.5–0.8× line height (~6–9pt). Not a full blank line.
- Space above `X.0` heading: ~24pt. Below: ~10pt.
- Widow/orphan control on. Never split a heading from the first line under it.

**Continuous flow.** The body is one text stream. Page breaks from overflow only.

1. A section never gets its own page. `1.0` ends, `2.0` begins on the next line of the same page. `X.1`, `X.2`, `X.3` always flow inline — never break.
2. **Fill test:** after any block, if ≥5 body lines of vertical space remain, the next block goes on the same page. A heading + lead + two paragraphs + six-row table ≈ one-third of a page; three such sections share one page.
3. Legal breaks only: (a) next block genuinely doesn't fit, (b) heading lands within 5 lines of page foot (push the heading, not the section), (c) atomic block (table ≤12 rows, code block, diagram, callout) would split. No fourth reason.
4. Every page except the last: ≥60% full. If sparse, a manual break was emitted — delete it. Don't add filler.
5. Last page: if under 40%, rebalance (tighten spacing, merge thin sections, widen measure). Never ship a stub final page.
6. Line length: 70–90 characters **per column**. On the 16:9 canvas that means columns, not wider margins — a full-width line of body text is a failure state.

## 7. Code & technical typography

**Inline tokens.** Filenames, paths, commands, env vars, types, props, class names, table names → monospace at 0.9em, color `#133020`, on `#EFEAD9` chip with ~2px radius and 2px horizontal padding. Examples: `src/main.tsx`, `npm run dev`, `VITE_SUPABASE_URL`, `TableDashboardConfig`.

**Code blocks.** Full-measure panels, never inline prose.
- Surface `#133020` with text `#F5EEDB`, OR light surface `#F1EFEA` with 3px `#FFB347` left rule. Pick one per document.
- Monospace 9.5–10.5pt, line height 1.45, left-aligned, no hyphenation.
- Label every block with language or file path in 8pt uppercase above it.

**Diagrams.** Never render flows as arrow text (`A -> B -> C`). Draw as boxes joined by arrows: Dark Serpent boxes, Paper text, Saffron arrowheads, on a Sea Salt band. Use `→` (not `->`) in prose.

## 8. Content composition

- Every `X.0` section opens with a **one-sentence lead** stating what it covers. Never heading → bare bullet list.
- Containers by content shape:
  - Shared shape (name + description + type) → **table**
  - Ordered actions → **numbered steps**
  - Literal code/config → **code block**
  - Sequences/states/hierarchies → **diagram**
  - Unordered short points → **bullets** (max ~6 in a row)
- A page of one-sentence bullets is a failure state. Add depth: why, when, example, failure mode.
- Callouts for real warnings only: `#EFEAD9` fill, 3px `#FFB347` left rule, bold label (`Note`, `Warning`, `Prerequisite`).
- Never state a rule without its consequence. Not "test thoroughly" — say what to test and what breaks.

## 9. Table of contents

- Single numbering system: `1.0 Project Setup` — never `1. 1.0 Project Setup`.
- Include sub-entries (`1.1`, `1.2`) when present, indented one level.
- Right-aligned page numbers with dot leaders — leaders stop at the column edge, never run the full 16:9 width.
- Entries take the left column of the two-column grid; the **How to use this document** block (audience, prerequisites, conventions legend) takes the right column. Long lists flow left → right, and the block drops below them.
- The TOC page itself carries NO page number — numbering starts on the first content page after the ToC.
- **Verify the restart, don't assume it.** The first page after the ToC must read `Page 1 of N`, with N counting only pages after cover + ToC. `LifewoodPDF.verify_numbering()` checks this and `save()` refuses to write a document that fails it.

---

## Output playbooks

Apply brand rules above. For build mechanics, read the matching skill (`pptx`, `docx`, `pdf`) first.

### A. One-pager / single slide

**Header:** Logo, Title (H1), `Prepared by: Lifewood PH Team`, `Date: Month Day, Year`.
**Body:** Numbered headings, concise text. Dense data → tables, charts, diagrams. Logo bottom-right.

### B. Word document / multi-page PDF

Read `docx` or `pdf` skill for build mechanics.

**Cover (page 1):** Logo, Title (H1), Subtitle *(if clarifying)*, then front matter in this exact order — `Prepared by: Lifewood PH Team` → `Date: Month Day, Year` → classification stamp **bottom-left** (`CONFIDENTIAL — FOR INTERNAL USE ONLY`, 8pt uppercase, in the footer band opposite the logo). No page number.
**TOC (page 2):** Numbered hierarchy with page numbers and dot leaders.
**Content (page 3+):** Numbered headings starting `1.0`, continuous flow per §6 rules.
**Footer:** `Page X of Y` bottom-center on content pages only — cover AND TOC unnumbered; first content page after the ToC shows `Page 1 of N` (N = pages after cover+ToC). Logo bottom-right on every page, cover included.

### C. PowerPoint

Read `pptx` skill for build mechanics.

**Cover (slide 1):** Same composition and anchors as the PDF cover — Logo, Title (H1), Subtitle *(if clarifying)*, then `Prepared by: Lifewood PH Team` → `Date: Month Day, Year` → classification stamp **bottom-left**. No page number.
**TOC (slide 2):** Numbered hierarchy. TOC entries match slide titles exactly.
**Content (slide 3+):** Numbered headings starting `1.0`.
**Footer:** `Page X of Y` bottom-center on content slides only — cover AND TOC unnumbered; first content slide after the ToC shows `Page 1 of N`. Logo bottom-right on every slide, cover included. Dark-mode logo on dark-green slides.

### D. Generated / AI images

- Build palette into prompt: backgrounds Sea Salt/White/Paper or deep greens; accents Castleton Green, Dark Serpent, Saffron, Earth Yellow.
- In-image text: Manrope (or clean geometric sans).
- **Composite the real logo onto the final image** — bottom-right (top-right for vertical frames). Place the asset file; never ask the model to draw it.

### E. Video shorts / reels

- Logo top-right, static overlay, asset file at correct aspect ratio, clear space.
- Variant (light/dark) matching footage. Subtle shadow only if needed for legibility — never recolor.
- Lower-thirds, captions, titles: Manrope, brand colors.

### F. Technical documentation

Build on playbook **B**, then add:

**Required front matter.** Cover per B, plus version/commit line: `Version 1.2 · main @ a1b2c3d`. Page 2: TOC + **How to use this document** (audience, assumed knowledge, conventions legend).

**Required sections** (in order):
1. **Overview & Architecture** — what the system does, stack table, architecture diagram. Never open with setup.
2. **Prerequisites** — table: tool / required version / verification command.
3. **Project Setup** — numbered steps. Each: exact command in code block + what it does + how to confirm.
4. **Code Architecture** — directory tree in code block, path → responsibility table, data-flow diagram.
5. **Component Reference** — one `X.1`/`X.2` sub-section per component. Each: purpose, props table (name / type / required / default / description), usage snippet, gotchas.
6. **Configuration Reference** — table: name / type / required / example / effect. Followed by complete annotated example in code block.
7. **Data & Auth Flow** — real diagrams, not arrow text.
8. **Extending the Platform** — recipe format: Goal → Steps → Files touched → Verify.
9. **Commands & Workflow** — table: command / what it does / when to run. Then branch/commit/PR conventions.
10. **Troubleshooting** — table: symptom / likely cause / fix. Include day-one failures (missing `.env`, wrong Node version, port conflicts, auth denials).
11. **Glossary** — only if project-specific jargon exists.

**Depth rules:**
- Every command as literal copyable text, with expected result or failure mode.
- Every config field gets a real example value, not a description.
- Anything typed/pasted goes in a code block — never paraphrased in a sentence.

## Do-not list

- ❌ Section per page — heading + two paragraphs + table, then 65% empty, then break. `2.0` follows `1.0` on the same page.
- ❌ Page under 60% full (except last), or stub final page.
- ❌ Justified body text.
- ❌ Orphaned wrapped words floating below their sentence.
- ❌ Filenames, commands, env vars in body font (must be monospace-chipped).
- ❌ `A -> B -> C` as text where a diagram belongs.
- ❌ `1. 1.0 Section Name` in TOC.
- ❌ `Page 3/9` instead of `Page 3 of 9`.
- ❌ Table cell text overflowing past its column or off the page edge — wrap to column width, size row height from wrapped line count.
- ❌ A generic/hardcoded "how to use this document" audience blurb that doesn't match the document's actual audience (user manual ≠ developer manual ≠ admin guide).
- ❌ Logo crowding the page/slide edge — keep it clearly clear of the corner, not just technically non-overlapping.
- ❌ Page number on the cover or TOC (numbering starts only after the ToC)
- ❌ Any page/slide missing the bottom-right logo (cover and TOC included)

**Engine note:** `lifewood_pdf_builder.py`'s `multi_cell()` calls must always pass `align="L"` explicitly — fpdf2's own default is `align="J"` (justify), so any call that omits it silently violates the "never justify" rule above even though the rule is written down here. When touching this file, grep for `multi_cell(` and confirm every call site still has an explicit `align=`.

## Verification (mandatory before delivery)

### Step 1: Render to images

```bash
# PDF → images (one per page)
python -c "
import fitz  # PyMuPDF
doc = fitz.open('output.pdf')
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=200)
    pix.save(f'verify_page_{i+1}.png')
print(f'Exported {len(doc)} pages')
"

# PPTX → images (one per slide)
python -c "
from pptx import Presentation
from pptx.util import Emu
import subprocess, os
prs = Presentation('output.pptx')
# Use LibreOffice or pdf2image pipeline if available
# Fallback: export via python-pptx + conversion
"
```

### Step 2: Vision verification (auto-switch to Mimo V2.5)

DeepSeek V4 Flash is text-only. When verification images exist on disk, the system **auto-detects** them and switches to Mimo V2.5 (vision-capable) — no manual dispatch needed. The vision subagent receives all page images with this prompt:

```
Inspect each page image for Lifewood brand compliance. Check:
1. Background color: #F9F7F7 or #FFFFFF (not pure white glare on full pages)
2. Heading color: #046241 (Castleton Green)
3. Body text color: #133020 (Dark Serpent)
4. Accent colors: #FFB347 / #FFC370 only — no yellow body text
5. Logo: bottom-right on every page incl. cover/TOC for docs and decks (reels stay top-right), correct light/dark variant, unaltered aspect ratio
6. Typography: Manrope or fallback sans-serif (not Times, not monospace in body)
7. Page numbers: "Page X of Y" bottom-center, absent on cover AND TOC; first content page = "Page 1 of N"
8. Layout density: each page ≥60% full (except last)
9. No orphaned words floating below paragraphs
10. No justified text (rivers visible)
11. No split tables across pages
12. Code tokens in monospace chips, not body font
13. TOC double-numbering: no "1. 1.0" pattern
14. Section flow: no page breaks between sections (continuous flow)
15. PPTX-specific: no SmartArt, no clip art, no distorted images
16. PPTX-specific: no consecutive identical layouts (layout rotation rule)
17. PPTX-specific: no bullet walls — data in tables/cards/charts
18. PPTX-specific: no overlapping text or elements extending beyond margins

Report per page: PASS or FAIL with specific line/element references.
```

### Step 3: Fix and re-verify

Any FAIL → fix the generator, re-render, re-inspect. Maximum 2 retry cycles. If still failing after 2 cycles, escalate with specific findings.

### Step 4: Report

Final output: page count, sparsest page fill %, all PASS/FAIL results, any TBD items.

## Quick checklist

| # | Check |
|---|-------|
| 1 | Background `#F9F7F7` or `#FFFFFF` (or approved deep green) |
| 2 | Headings `#046241`; subheadings & body `#133020`; accents `#FFB347`/`#FFC370` only |
| 3 | Font Manrope (or approved fallback); code JetBrains Mono (or fallback) |
| 4 | Numbered headings `1.0`, `1.1` …; content starts `1.0`; TOC matches titles, no double numbering |
| 5 | `Prepared by: Lifewood PH Team` + `Date: Month Day, Year` where required |
| 6 | `Page X of Y` bottom-center on content pages only — cover & TOC unnumbered, starts at `Page 1 of N` after ToC |
| 7 | Actual logo asset bottom-right on EVERY page/slide incl. cover & TOC — correct variant, aspect ratio, clear space, unaltered |
| 8 | Body left-aligned, never justified |
| 9 | No orphan words; paragraph spacing < one full line |
| 10 | No section starts on fresh page because it's new; sub-sections never break; pages ≥60% full (except last) |
| 11 | Every section opens with lead sentence, not bare bullets |
| 12 | Code tokens monospace-chipped |
| 13 | Rendered file inspected page by page before delivery |

---

## Council gate (mandatory for multi-page docs and decks)

Before authoring content outline for any 2+ page document, dispatch `chadi-council` (Architect, Skeptic, Pragmatist, Critic) to decide:
1. Content structure — what goes in each numbered section, reading flow
2. Format routing — PPTX (`lifewood_deck_builder.py` / ppt-master) or PDF (`lifewood_pdf_builder.py`)? Never both from same spec_lock.
3. Audience segmentation — single doc or separate user/admin/workflow PDFs?

Council output → `pdf_spec_lock.md` (PDF) or `spec_lock.md` (PPT). Decisions bind downstream.

**Auto-switch:** Verification step auto-detects rendered images and routes to Mimo V2.5 (vision). DeepSeek V4 Flash never sees images.

## Overlap guard (PDF vs PPT)

PDF and PPT share brand colors/fonts/logo, separate everything else. 49 tests in `test_overlap.py` enforce separation. Run `python -m pytest test_overlap.py -v` after any change to either system.

---

## Reference material

See `REFERENCE.md` in this skill directory for: built-in modules table, CLI quick reference, PDF pipeline code examples, design variants API, multi-audience patterns, and project integration examples.
