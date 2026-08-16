# Lifewood Branding — Reference

Code examples, module inventory, CLI commands, and project integrations. The skill file (`SKILL.md`) is the source of truth for brand rules and layout discipline; this file is the implementation cookbook.

## Canvas rule (both engines, non-negotiable)

Every deliverable — deck, manual, workflow doc, report, one-pager — is
**13.333 × 7.5 in (338.66 × 190.5 mm), 16:9 landscape**. A4 is forbidden.
The PDF engine mirrors the deck grid exactly: margins 0.6 / 0.6 / 0.5 / 0.75 in,
logo 1.8 in wide with 0.7 in right clearance, footer zone 0.75 in.

Body copy runs in a **two-column grid** (`PDF_COL_W` + `PDF_COL_GAP`) — one
text measure across 338 mm is unreadable. Single-column elements (paragraphs
on mixed pages, step lists) cap at `PDF_MEASURE_W`.

Page grammar, identical on every content page and enforced in `header()` /
`footer()` rather than per page builder:

```
┌ top hairline ─────────────────────────────────────────────┐
│ 1.1                       ← folio kicker (9 pt, locked y)  │
│ Page Title                ← 16 pt, one line, locked y      │
│ ──────────────────────────────────────── header hairline   │
│ body column 1        │        body column 2                │
│ ──────────────────────────────────────── footer hairline   │
│ Document title      Page X of Y                [logo]      │
└───────────────────────────────────────────────────────────┘
```

Cover, ToC and section dividers share the same footer band (logo always;
cover and ToC carry no rule, label or folio) and the same left Saffron rail
composition. Only the palette changes between the `editorial` and `swiss`
variants — never the geometry.

**Cover front matter, fixed order:** `Prepared by: Lifewood PH Team` →
`Date: Month Day, Year` → classification stamp bottom-left
(`CONFIDENTIAL — FOR INTERNAL USE ONLY`, 8 pt uppercase with a Saffron tick,
in the footer band opposite the logo). Both engines take
`classification="..."` to override and `classification=None` to omit.
`LifewoodDeck` and `LifewoodPDF` share the cover anchors
(`COVER_TEXT_X` / `COVER_TITLE_Y` / `COVER_META_Y` / `COVER_CLASS_Y`), and
`test_overlap.py` asserts they never drift apart.

## PDF pipeline (built-in)

No external pdf skill needed. Two modes:
1. **Single PDF** — `LifewoodPDF` from `lifewood_pdf_builder.py`
2. **Multi-audience** — `LifewoodPDF` per audience (user, admin, workflow), each as separate file

### Design variants

| Variant | Feel | Best for |
|---------|------|----------|
| `editorial` | Magazine-inspired, column grids, pull quotes, warm | Manuals, client docs, long-form |
| `swiss` | Swiss-grid precision, thin hairlines, dense | Architecture, workflows, technical refs |

```python
from lifewood_pdf_builder import LifewoodPDF

# Editorial
pdf = LifewoodPDF("User Manual", audience="user", design_variant="editorial")

# Swiss
pdf = LifewoodPDF("Architecture Guide", audience="developer", design_variant="swiss")
```

Defined in `lifewood_design_variants.py` — dataclass specs for cover, section divider, content page, footer. All variants share brand colors, typography, footer system.

### Pipeline code

```python
from lifewood_pdf_design_system import PdfSpecLock
from lifewood_pdf_builder import LifewoodPDF

# 1. Write spec lock (SEPARATE from PPT spec_lock)
PdfSpecLock.write_spec_lock("output_dir", "Title", "audience", page_count, sections)

# 2. Build pages
pdf = LifewoodPDF("Title", "Subtitle", audience="user")
pdf.add_cover()
pdf.add_toc(["1.0 Section", "2.0 Section"])
pdf.add_content_page("1.0", "Heading", ["Paragraph text..."], page_rhythm="normal")
pdf.add_section_divider("2.0", "Section Title")
pdf.save("output.pdf")
```

### Page types

| Method | Purpose |
|--------|---------|
| `add_cover()` | Cover — left Saffron rail, hero logo, title, then Prepared by → Date → classification (bottom-left) |
| `add_toc(items)` | Contents on the two-column grid + How-to-use block |
| `add_section_divider(num, title)` | Section divider — cover composition at section scale |
| `add_content_page(num, text, lines, rhythm)` | Standard content, two-column body flow |
| `add_two_column(num, text, left, right)` | Two-column comparison |
| `add_mixed_content_page(num, text, elements)` | Body + code + table + callout + steps |
| `verify_numbering()` | Self-check: cover/ToC unnumbered, folio restarts at 1 |

`save()` runs `verify_numbering()` and raises rather than shipping a document
whose folio does not restart at 1 after the ToC. Pass `strict=False` only to
bypass deliberately.

### Layout integrity — what the engine guarantees

Every block is measured before it is drawn, so content is never clipped,
never overlaps chrome, and never runs off the page:

| Risk | Guard |
|------|-------|
| Code block longer than a page | Panel splits across pages with a `(CONT.)` label; auto-break disabled while drawing so a long block can't spawn stray pages |
| Code line wider than the panel | `_wrap_to_width()` hard-wraps, breaking mid-token if a token is itself too wide |
| Callout text spilling out of its fill | Height measured with a dry-run `multi_cell`, never estimated from a chars-per-line guess; splits across pages when taller than the band |
| Table row crossing the footer | Row height measured; page break with the header row redrawn |
| Body text landing on the footer chrome | Auto page-break margin set to the body band, not the page margin |
| Page title too long | `_fit_text()` shrinks, then ellipsises — a title never wraps and never passes the content width |
| Cover / divider title too long | Bounded zone: wraps to two lines, then shrinks; can't grow into the metadata block |
| ToC longer than two columns | Leading tightens first, then a continuation ToC page (still front matter, still unnumbered) |
| Two-column comparison overflowing | Items clamped to the band; the rest continues on a `(cont.)` page with both headings repeated |

**Audit it, don't trust it.** `LifewoodPDF.audit_layout(path)` reads a
rendered PDF back and reports anything outside the safe area — margin
breaches, body copy on the footer band, off-page content, wrong canvas.
`save(path, audit=True)` runs it and raises on violations:

```python
pdf.save("out.pdf", audit=True)          # raises on layout damage
LifewoodPDF.audit_layout("out.pdf")      # {"ok": bool, "pages": int, "violations": [...]}
```

The deck builder has the same discipline: ToC entries and content bullets
that would cross the footer rule continue on a `(cont.)` slide, because
PowerPoint silently clips anything past the slide edge.

### Design contract

`pdf_spec_lock.md` — separate filename, `## pdf_` key prefixes. Never confused with PPT `spec_lock.md`.

### Multi-audience pattern

```python
for audience in ["user", "admin", "workflow"]:
    pdf = LifewoodPDF("Product Manual", audience=audience)
    pdf.add_cover()
    pdf.add_content_page(...)  # audience-specific content
    pdf.save(f"Manual_{audience}.pdf")
```

### Overview generator

Auto-run when skill invoked for codebase understanding:

```bash
python lifewood_overview_generator.py
```

Generates `lifewood_overview.pdf` (7 pages: cover, system overview, components, PPT pipeline, PDF pipeline, brand rules, quick reference) + `lifewood_overview.md`.

## Module inventory

| Module | Purpose | Format |
|--------|---------|--------|
| `lifewood_design_variants.py` | 2 design variants (editorial + swiss) | Design specs |
| `lifewood_deck_builder.py` | PPTX generator (python-pptx) | PPTX |
| `lifewood_pdf_design_system.py` | PDF brand constants + PdfSpecLock | Constants |
| `lifewood_pdf_builder.py` | PowerPoint-sized (16:9) PDF generator (fpdf2) | PDF |
| `lifewood_overview_generator.py` | Scans skill dir → overview PDF + MD | PDF + MD |
| `test_overlap.py` | Tests enforcing PDF≠PPT separation, the 16:9 canvas, chrome consistency, and numbering-after-ToC | pytest |

## Visual verification (auto-switch to Mimo V2.5)

DeepSeek V4 Flash is text-only. System auto-detects rendered images on disk and switches to Mimo V2.5 (vision-capable) — no manual model routing needed.

### Render to images

```bash
# PDF → PNG per page
python -c "
import fitz
doc = fitz.open('output.pdf')
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=200)
    pix.save(f'verify_page_{i+1}.png')
print(f'Exported {len(doc)} pages')
"

# PPTX → PNG per slide (via LibreOffice)
soffice --headless --convert-to png output.pptx
```

### Vision prompt for Mimo V2.5

```
Inspect each page for Lifewood brand compliance. Check:
0. Canvas: 16:9 landscape (13.333 x 7.5 in) — a portrait/A4 page is an automatic FAIL
1. Background: #F9F7F7 or #FFFFFF
2. Headings: #046241
3. Body: #133020
4. Accents: #FFB347 / #FFC370 only
5. Logo: bottom-right, correct variant, aspect ratio ~5.5:1
6. Font: Manrope or sans-serif fallback
7. Page numbers: "Page X of Y" bottom-center (not on cover or TOC; numbering starts after the ToC, first content page = Page 1 of N)
8. Density: ≥60% full (except last page)
9. No orphaned words, no justified text, no split tables
10. Code tokens in monospace chips
11. No TOC double-numbering
12. Continuous flow (no section page breaks)
13. PPTX-specific: no SmartArt, no clip art, no distorted images
14. PPTX-specific: no consecutive identical layouts
15. PPTX-specific: no bullet walls — data in tables/cards/charts
16. PPTX-specific: no overlapping text or elements beyond margins

Per page: PASS or FAIL with element references.
```

### Retry logic

Max 2 fix-re-render cycles. Escalate if still failing.

## CLI quick reference

```bash
# Generate overview PDF
cd C:\Users\richa\.config\opencode\skills\lifewood-branding
python lifewood_overview_generator.py

# Build branded PDF
python -c "from lifewood_pdf_builder import LifewoodPDF; p=LifewoodPDF('Title'); p.add_cover(); p.add_toc(['1.0 A','2.0 B']); p.add_content_page('1.0','A',['Content']); p.save('out.pdf')"

# Build branded PPTX
python -c "from lifewood_deck_builder import LifewoodDeck; d=LifewoodDeck('Title'); d.add_cover(); d.add_toc(['1.0 A','2.0 B']); d.add_content('1.0','A',['Content']); d.save('out.pptx')"

# Check for overlaps
python -m pytest test_overlap.py -v

# Write pdf_spec_lock.md
python -c "from lifewood_pdf_design_system import PdfSpecLock; PdfSpecLock.write_spec_lock('.', 'Doc', 'user', 5, ['1.0 Intro','2.0 Body'])"
```

## Project integrations

### PHLifeTerm — OJT Intern Monitoring System

| Builder | Output | Pages |
|---------|--------|-------|
| `LifewoodDeck` | `PHLifeTerm_Overview.pptx` | ~25 slides |
| `LifewoodPDF` per audience | `PHLifeTerm_Intern_Manual.pdf` | ~6 pages |
| `LifewoodPDF` per audience | `PHLifeTerm_Admin_Manual.pdf` | ~7 pages |
| `LifewoodPDF` per audience | `PHLifeTerm_System_Workflow.pdf` | ~7 pages |

Project-local skill: `.opencode/skills/ph-lifeterm-docs/SKILL.md`.
