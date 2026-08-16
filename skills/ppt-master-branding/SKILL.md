---
name: ppt-master-branding
description: Use when generating Lifewood-branded PDF documentation, manuals, reports, one-pagers, or presentation-style deliverables — enforces PDF-only output (no PPTX/PPT), 16:9 landscape canvas, one-topic-per-page pagination with content compression before continuation pages, hierarchical X.0/X.1 numbering, bottom-anchored minimal footer (Page X of Y + logo only), Manrope typography, Lifewood palette (Castleton Green #046241, Dark Serpent #133020, Sea Salt #F9F7F7, Saffron #FFB347, Paper #F5EEDB, Earth Yellow #FFC370). Also covers the Design Philosophy Creation workflow (manifesto .md + canvas .pdf/.png art objects, exempt from document rules).
---

# Unified Lifewood PDF Maker Engine — Layout, Pagination & Output Rules

You are a **PDF document generation engine** for creating polished, professional, presentation-style documentation.

Your output must be **PDF only**.
**Do NOT generate, export, create, or maintain PPTX/PPT/PowerPoint files.**
The final deliverable must always be a `.pdf`.

---

## 0. Governing Principle — DESIGN FIRST, PLACE CONTENT SECOND

Do **not** begin by calculating isolated x/y coordinates for every text element.

Decide, in this order:

1. Section number + page title (spec §4, §5)
2. Content hierarchy — what must be read first, second, third
3. Grid — which regions the page is divided into
4. Major visual regions — header band, content zone, footer band
5. Typography scale for this page type
6. Spacing tokens (§12)
7. Footer zone (§8–§10)
8. Branding placement (§20–§21)
9. Final balance check (§18)

*Then* place the actual content.

**Canvas doctrine:** Maximize the usable canvas — not the amount of content.

| Situation | Correct response | Wrong response |
|---|---|---|
| Little content | Increase scale, spacing, and visual weight of what exists (§7) | Add filler text, decorative shapes, stock phrases |
| Much content | Compress (§3), organize into columns, sections, tables, cards | Shrink type until unreadable |
| Awkward gap | Rebalance the composition | Drop in a random accent box |

Never add irrelevant content to occupy space. Never shrink important text to make everything fit.

---

## 1. Core Output Rule — PDF ONLY

* Generate **PDF files only**.
* Do not generate `.pptx`, `.ppt`, PowerPoint, or presentation source files.
* Do not create duplicate PPTX versions.
* The PDF must be the single authoritative output.
* Use a **16:9 landscape presentation canvas**.
* Target canvas: **1920×1080 equivalent proportions**.
* Every page must be independently printable/readable as a complete documentation page.

---

## 2. ONE TOPIC = ONE PAGE

The strongest rule:

> **Always try to fit one logical topic into ONE PAGE before creating a continuation page.**

Do NOT automatically split content simply because it is long.

Before creating a continuation page, the engine must attempt to:

1. Remove unnecessary wording.
2. Compress verbose explanations.
3. Convert paragraphs into concise bullets.
4. Combine related information.
5. Reduce excessive spacing.
6. Reduce card/panel padding.
7. Tighten vertical gaps.
8. Reduce heading/subheading spacing.
9. Reduce font size moderately if necessary.
10. Reorganize the content into a more efficient layout.
11. Use columns/cards where appropriate.
12. Only then consider a continuation page.

### Preferred behavior

If a section contains:

> Deployment
> Deployment Checklist
> Environment Variables
> Rollback
> Storage Integration

Try to fit these into a single well-structured page.

Do NOT produce:

* `8.0 Deployment`
* `8.0 Deployment (cont.)`

unless the content genuinely cannot fit after reasonable compression.

### Continuation pages — PROHIBITED in shipped documents

Continuation pages are a **last resort, not the default layout behavior** —
and shipped documents must contain **zero** of them.

* A section that cannot fit one page after compression (§3) MUST be split
  into numbered subsections (`X.0` + `X.1`, `X.2`, …) — never a `(cont.)`
  page. A subsection split reads as deliberate structure; `(cont.)` reads
  as failed layout.
* Builders MUST scan the rendered text for `(cont.)` / ` (CONT.)` after
  every build and FAIL if found (see §25 Step 0). Fix = compress the
  section's content or split it into numbered subsections, then rebuild.
* The engine's page-break safety keeps 18 mm of body band free before an
  element — elements taller than the remaining band must be split by the
  CALLER into separate `X.1`/`X.2` pages, never dumped into a continuation.

Avoid `(cont.)`, `continued`, or similar labels whenever possible.

If content can reasonably fit on one page through intelligent compression, **it MUST remain on one page**.

---

## 3. CONTENT COMPRESSION PRIORITY

When content is too large for one page, compress it in this order:

### Priority 1 — Rewrite

Make the content concise while preserving meaning.

Example:

Instead of:

> The system requires the following environment variables to be configured before deployment in order to ensure that all services can communicate correctly.

Use:

> Configure required environment variables before deployment.

### Priority 2 — Remove redundancy

Do not repeat information already communicated by:

* headings
* labels
* section titles
* captions
* surrounding context

### Priority 3 — Convert paragraphs to bullets

Prefer:

* Required environment variables
* Database configuration
* Deployment command
* Rollback procedure

over large paragraphs.

### Priority 4 — Combine related items

Use compact cards or grouped sections instead of multiple isolated blocks.

### Priority 5 — Reduce spacing

Reduce:

* card padding
* section gaps
* paragraph spacing
* heading margins
* empty space
* unnecessary separators

### Priority 6 — Moderately reduce typography

Typography may be reduced when necessary, but readability must remain the priority.

Never shrink text to an unreadable size merely to force content onto a page.

### Priority 7 — Continuation page

Only after all reasonable compression methods have been exhausted should a continuation page be created.

---

## 4. SECTION NUMBERING SYSTEM

Section numbering must be hierarchical and consistent.

### Main sections

Always place the section number **BEFORE the title**.

Correct:

**9.0 Overview**

**10.0 Deployment**

**11.0 Configuration**

Never:

**Overview — 9.0**

**Deployment (9.0)**

### Subsections

Use hierarchical numbering:

* `9.0 Overview`
* `9.1 System Overview`
* `9.2 Key Features`
* `9.3 User Flow`
* `9.4 Configuration`

For another section:

* `10.0 Deployment`
* `10.1 Prerequisites`
* `10.2 Deployment Process`
* `10.3 Verification`
* `10.4 Rollback`

### Rules

* Main topic = `X.0`
* Subtopic = `X.1`, `X.2`, `X.3`, etc.
* Never randomly mix numbering styles.
* Never use unnumbered subsections when the document uses numbered hierarchy.
* Preserve the source document's logical hierarchy.
* If a page contains multiple subtopics, each must use its proper hierarchical number.
* The examples above are the logical title format. Lifewood rendering splits them — number on the kicker line, title on the line below (§5, §21.2). Never render as a single text run like `1.0 Overview`.

---

## 5. PAGE TITLE FORMAT

The page title must follow:

**[SECTION NUMBER] [TITLE]**

Examples:

**8.0 Deployment**

**8.1 Deployment Prerequisites**

**9.0 Overview**

**9.1 System Architecture**

The section number should be visually integrated with the title while remaining clearly distinguishable.

Do not place the number underneath or after the title.

In the Lifewood chrome (§21), the number renders as the header kicker line (folio number, 10 pt SemiBold) directly above the title — the number leads, the title follows. Never an inline `1.0 Heading` single-run mix, never a bare chapter digit.

---

## 6. PAGE LAYOUT

Use a clean **16:9 landscape documentation layout**.

Recommended structure:

```text
┌──────────────────────────────────────────────┐
│ TOP BORDER                                   │
│                                              │
│ 9.0                                           │
│ Overview                                     │
│ ──────────────────────────────────────────── │
│                                              │
│ MAIN CONTENT                                 │
│                                              │
│ Cards / diagrams / bullets / screenshots     │
│                                              │
│                                              │
│                                              │
│ ──────────────────────────────────────────── │
│                         Page 14 of 16  Logo  │
└──────────────────────────────────────────────┘
```

The page should feel **balanced and intentional**, not vertically stretched.

Lifewood grid values (exact anchors in §21): left/right margins 24.0 mm, top 13.34 mm, bottom 19.05 mm, content width 290.658 mm, content height 158.11 mm, body measure capped at ~68% of content width for running text.

---

## 7. CONTENT AREA — DO NOT LEAVE EXCESSIVE EMPTY SPACE

Avoid the problem where a small amount of content sits at the top while most of the page is completely empty.

For example, do NOT produce:

```text
TITLE

Small note card



[huge empty area]



FOOTER
```

If the content is short:

* use a compact but visually balanced layout;
* vertically position content appropriately;
* use a larger, more meaningful content block where appropriate;
* combine related information into a structured card;
* avoid artificial empty space caused by fixed-height content containers.

However, **do not artificially inflate cards just to fill the page**.

Whitespace should look intentional.

---

## 8. FOOTER POSITIONING — CRITICAL

The footer must sit **very close to the bottom edge of the page**.

### Correct behavior

The footer should occupy a small, fixed bottom zone:

```text
MAIN CONTENT



────────────────────────────────────────
                footer
                    Page 14 of 16     logo
```

The divider must be positioned **close to the bottom**, with only a small controlled gap between:

1. Main content
2. Footer divider
3. Footer elements
4. Bottom page margin

### Footer rules

* Footer divider must NOT float high above the bottom.
* Do NOT create a large empty region between the divider and page bottom.
* Do NOT vertically center the footer.
* Footer should be anchored to the bottom of the page.
* Maintain a consistent footer position across every page.
* Use a small, consistent bottom margin.

The footer should feel like a **true page footer**, not another content section.

Lifewood anchors (§21): footer divider at 169.95 mm, footer band top at 171.45 mm, page bottom 190.5 mm — the divider sits ~1.5 mm above the footer band, glued tight. A large empty region between the last content element and the divider is a failure state: rebalance the content (§3, §13), never move the divider up.

---

## 9. FOOTER CONTENT

Keep the footer minimal.

The footer should contain ONLY:

### Center

Page numbering (left slot empty):

**Page 14 of 16**

### Right

**Lifewood logo**

Do NOT add unnecessary footer text.

Remove:

* quotes
* descriptions
* extra labels
* "Next"
* unnecessary icons
* decorative text
* document descriptions
* redundant branding text

The footer should be visually quiet and unobtrusive.

Lifewood specifics: left slot empty, `Page X of Y` centered (10 pt SemiBold), logo bottom-right (45.72 mm wide, 17.78 mm right clearance). No document title, no product name, no quote, no description — unless the user explicitly asks for it.

---

## 10. FOOTER LOGO

Use the official **Lifewood logo** supplied by the project.

Requirements:

* Place the logo at the bottom-right.
* Keep its proportions intact.
* Do not stretch or distort it.
* Maintain consistent size across pages.
* Align it vertically with the page-number area.
* Keep enough bottom/right margin for a clean finish.

Lifewood specifics (§20): `assets/lwlogo_lightmode.png` on light backgrounds, `assets/lwlogo_darkmode.png` on dark. Native aspect ratio ~5.5:1 (1655×300) — preserve exactly. Never recolor, redraw, crop, rotate, or distort. Right-edge clearance 17.78 mm (0.7 in). Cover carries NO bottom-right logo — exactly one logo, upper-left only.

---

## 11. DIVIDERS & BORDERS

Use dividers intentionally.

### Top divider

A thin green line may be used near the top edge.

### Title divider

A thin green divider may appear beneath the title.

### Footer divider

The footer divider must be:

* thin
* consistent
* horizontally aligned
* positioned near the bottom
* separated from the footer content by only a small controlled gap

Do NOT allow the footer divider to appear halfway up the page.

Lifewood: Castleton Green hairlines (0.5 mm), header rule at 36.00 mm with a 24 mm Saffron tick, footer divider at 169.95 mm at content width. Primary divider Castleton Green; accent divider Saffron — use to establish hierarchy, not to box in every section.

---

## 12. SPACING SYSTEM

Use a consistent spacing scale.

Avoid:

* huge gaps between title and content
* huge gaps between cards
* excessive card padding
* excessive footer whitespace
* inconsistent margins
* isolated elements floating in large empty areas

Prefer:

* compact title spacing
* controlled section spacing
* consistent card padding
* tight but readable vertical rhythm
* intentional whitespace

Whitespace is valuable, but **unused accidental whitespace is not**.

Lifewood tokens:

| Token | Value | Use |
|---|---|---|
| `s1` | 8 pt (2.82 mm) | Related elements — label to value, row padding |
| `s2` | 12 pt (4.23 mm) | Standard gap — paragraph to paragraph, list rows |
| `s3` | 20 pt (7.06 mm) | Section gap — heading block to content |
| `s4` | 32 pt (11.29 mm) | Major section gap — between top-level regions |

Use tokens, not arbitrary numbers. No unexplained gaps.

---

## 13. CONTENT-FIRST PAGINATION ALGORITHM

Before rendering every page, perform this check:

### Step 1 — Analyze

Determine:

* section number
* title
* subsections
* content length
* hierarchy
* required visual elements

### Step 2 — Build

Construct the page using the available content.

### Step 3 — Measure

Check whether the content fits within the actual usable page area.

### Step 4 — Compress

If it does not fit:

1. Shorten text.
2. Remove redundancy.
3. Convert prose to bullets.
4. Combine related blocks.
5. Reduce spacing.
6. Reduce padding.
7. Adjust layout.
8. Moderately reduce font size.

### Step 5 — Re-measure

Check again.

### Step 6 — Only then split

If the content still cannot fit while remaining readable, create another page.

---

## 14. NEVER SPLIT A PAGE PREMATURELY

Bad:

```text
9.0 Overview
[small amount of content]

Page ends

9.0 Overview (cont.)
[remaining content]
```

Preferred:

```text
9.0 Overview

9.1 Purpose
[content]

9.2 Key Components
[content]

9.3 Workflow
[content]
```

Fit the complete logical topic into one page whenever reasonably possible.

---

## 15. SUBTOPIC LAYOUT

When a page has multiple subtopics, use compact visual hierarchy.

Example:

**9.0 Overview**

**9.1 Purpose**
Short explanation.

**9.2 Key Features**

* Feature A
* Feature B
* Feature C

**9.3 Workflow**

1. Step one
2. Step two
3. Step three

This is preferable to creating separate pages for every small subsection.

---

## 16. TYPOGRAPHY

Primary typeface:

**Manrope**

Hierarchy:

* Section number: small, strong
* Page title: large, bold
* Subsection title: medium/bold
* Body: readable regular
* Labels: compact medium/bold
* Footer: small

Never sacrifice readability merely to avoid a continuation page.

Use responsive typography:

> Larger content → slightly smaller type
> Smaller content → slightly more breathing room

But maintain a defined minimum readable font size.

Lifewood scale (one scale document-wide — Manrope → Aptos → Arial → Helvetica → DejaVu Sans):

| Role | Size (pt) | Default | Weight | Colour |
|---|---|---|---|---|
| **Cover title** | 42–60 | **54** | 800 | Castleton (light bg) / Paper (dark bg) |
| **Page title (H1)** | 30–40 | **32** | 700–800 | Castleton Green |
| **Section heading (H2)** | 20–28 | **24** | 600 | Dark Serpent |
| **Subheading (H3)** | 16–20 | **18** | 600 | Dark Serpent |
| **Body text** | 11–14 | **12** | 400 | Dark Serpent |
| **Table text** | 10–13 | **11** | 400 (600 header) | Dark Serpent |
| **Caption / supporting** | 9–11 | **10** | 400 | Dark Serpent |
| **Footer folio** | 10–12 | **12** | 600 | Castleton (light) / Paper (dark) |
| **Header kicker (folio number)** | 10–12 | **12** | 600 | Same as footer folio — one folio family |

Hierarchy comes from weight, size, spacing, and alignment — not from colour alone. Never mix unrelated typefaces. Never stretch, condense, or distort text to fit.

---

## 17. VISUAL STYLE

Maintain the established Lifewood documentation style:

* clean
* professional
* minimal
* editorial
* spacious
* structured
* enterprise-ready

Use:

* white / soft neutral backgrounds
* green headings
* subtle borders
* restrained accent colors
* modular cards
* clean alignment
* consistent grid

Avoid:

* unnecessary decoration
* oversized graphics
* excessive icons
* large empty panels
* decorative filler
* visual noise

Lifewood palette:

| Role | HEX | Usage |
|---|---|---|
| **bg** | `#F9F7F7` (Sea Salt) | Preferred page background |
| **bg-alt** | `#FFFFFF` | Card/panel background only — never full-page glare |
| **paper-bg** | `#F5EEDB` (Paper) | Warm surface / text on dark |
| **primary** | `#046241` (Castleton Green) | Titles, section headings, major panels, primary rules |
| **text** | `#133020` (Dark Serpent) | Body, subheadings, tables, technical content |
| **accent** | `#FFB347` (Saffron) | Accent rules, highlights, key markers |
| **secondary-accent** | `#FFC370` (Earth Yellow) | Soft callouts, background highlights |

Saffron/Earth Yellow are accents — keep under ~20% of surface area, never body text. Dark surfaces (`#046241`, `#133020`): flip text to Paper `#F5EEDB` or White, use `lwlogo_darkmode.png`.

---

## 18. PAGE BALANCE

Every page should pass this visual test:

### Top

Title and section identification.

### Middle

The actual useful content.

### Bottom

Content should naturally end before the footer.

### Footer

Divider + page number + Lifewood logo anchored near the bottom.

The page should never feel like:

> "content at the top + huge blank area + footer."

Instead it should feel like a deliberately composed documentation page.

Within 2–3 seconds a viewer must be able to answer:

1. What is this page about?
2. What is the most important information?
3. What should I look at next?
4. What supporting information explains it?

---

## 19. FINAL QUALITY CHECK BEFORE EXPORT

Before generating the PDF, validate every page.

### Content

* [ ] One logical topic per page where possible
* [ ] Content compressed before pagination
* [ ] No unnecessary continuation pages
* [ ] No redundant wording
* [ ] Subtopics properly grouped
* [ ] Numbering is hierarchical

### Titles

* [ ] Number comes BEFORE title
* [ ] Format follows `X.0 Title`
* [ ] Subtopics follow `X.1`, `X.2`, `X.3`
* [ ] No inconsistent numbering

### Layout

* [ ] 16:9 landscape
* [ ] No accidental excessive whitespace
* [ ] Content is visually balanced
* [ ] Cards do not have excessive padding
* [ ] Typography remains readable
* [ ] No content overflow or clipping

### Footer

* [ ] Footer anchored near bottom
* [ ] Divider close to bottom
* [ ] No excessive space below divider
* [ ] Only page number and Lifewood logo
* [ ] Logo aligned consistently
* [ ] No unnecessary footer text

### Output

* [ ] PDF generated successfully
* [ ] PDF is the ONLY generated document format
* [ ] No PPTX/PPT output
* [ ] Page count is minimized without sacrificing readability
* [ ] Every page is visually consistent

---

# FINAL PRINCIPLE

**Optimize for the smallest number of well-designed PDF pages, not the largest amount of whitespace.**

The engine should intelligently **compress, restructure, and rebalance content before creating additional pages**.

A continuation page is acceptable only when necessary.

The desired result is:

> **One topic → one polished 16:9 PDF page → minimal unnecessary whitespace → consistent numbered hierarchy → bottom-anchored footer → PDF only.**

---

## 20. Lifewood Brand DNA

| Property | Value | Notes |
|---|---|---|
| **Brand Name** | Lifewood / Lifewood PH Team | Official corporate & operational branding |
| **Primary Green** | `#046241` (Castleton Green) | Page/section titles, major panels, primary rules |
| **Dark Green** | `#133020` (Dark Serpent) | Body text, secondary headings, technical content |
| **Light BG** | `#F9F7F7` (Sea Salt) | Preferred default background surface |
| **Soft Neutral** | `#F5EEDB` (Paper) | Warm background; text on dark surfaces |
| **Accent Orange** | `#FFB347` (Saffron) | Accent lines, highlights, key markers |
| **Secondary Accent** | `#FFC370` (Earth Yellow) | Soft callouts, background highlights |
| **Canvas** | **16:9 landscape — 338.658 × 190.5 mm (13.333 × 7.5 in)** | **A4 and portrait are forbidden.** 1920×1080 equivalent proportions |
| **Typography** | `Manrope` → Aptos → Arial → Helvetica → DejaVu Sans | One stack document-wide; never mix unrelated typefaces |
| **Safe area** | **7–10% outer margins** — 24.0 / 24.0 / 13.34 / 19.05 mm (§21) | Content neither jammed into the top-left nor floating in accidental voids |
| **Logo — cover** | **ONE logo, upper-left/header area. NO bottom-right logo on the cover.** | Bottom-right of the cover is brand geometry or intentional whitespace |
| **Logo — interior** | **Bottom-right footer, every interior page including Contents** | Consistent size and position; never competes with the title |
| **Footer content** | **Page numbering + logo ONLY** | Left slot empty, `Page X of Y` centered, logo right. No titles, product names, quotes, descriptions |
| **Page Numbering** | `Page X of Y`, starts on the first content page — **verified, not assumed** | Cover AND Contents unnumbered. `LifewoodPDF.verify_numbering()` checks the contract; `save()` raises rather than shipping a broken folio |
| **Hierarchy** | Numbered system: `1.0`, `1.1`, `1.1.1`, `2.0`, `2.1` | Required across all PDFs — number always BEFORE the title |
| **Body Grid** | Two columns + 12 mm gutter; running body text capped at ~68% of content width | A full-width line of body text on a 16:9 page is a failure state. Tables, diagrams, images may use full content width |

### Logo assets

| File | Variant | Surface |
|---|---|---|
| `assets/lwlogo_lightmode.png` | Green text + orange hexagon | Light backgrounds (`#F9F7F7`, `#FFFFFF`, `#F5EEDB`) |
| `assets/lwlogo_darkmode.png` | Cream text + orange hexagon | Dark backgrounds (`#046241`, `#133020`) |

* Clear space ≥ height of the logo hexagon on all sides.
* Native aspect ratio ~5.5:1 (1655×300) — preserve exactly. NEVER recolor, redraw, crop, rotate, or distort.
* Right-edge clearance: **17.78 mm (0.7 in)**. Tighter reads as clipping.
* Interior size: **45.72 mm wide**, consistent on every page.

### Voice & tone

* Formality: professional, clean, authoritative, tech-forward.
* Person: We / You (Lifewood PH Team).
* Cover metadata, fixed order: `Prepared by: Lifewood PH Team` → `Date: Month Day, Year` → `CONFIDENTIAL — FOR INTERNAL USE ONLY` (bottom-left, in the footer band). No decorative tick above the classification stamp.

---

## 21. Page Grid & Vertical Zones (Lifewood)

### 21.1 Margins (7–10% safe area)

| Edge | Value | % of dimension |
|---|---|---|
| Left / Right | **24.0 mm** (0.945 in) | 7.1% of 338.658 mm |
| Top | **13.34 mm** (0.525 in) | 7.0% of 190.5 mm |
| Bottom | **19.05 mm** (0.75 in) | 10.0% of 190.5 mm |

Derived: **content width 290.658 mm**, **content height 158.11 mm**.

Columns: gap **12 mm**, column width **139.329 mm**. Running body text capped at **~68% of content width (197.6 mm)** — roughly 70–90 characters per line.

### 21.2 Vertical zones

```
 13.34 mm  ┌──────────────────────────────────────────────┐  HEADER ZONE
           │ 1.2                     ← folio kicker, 10pt │  section number
 19.50 mm  │ Page Title              ← 32pt, one line     │  page title
 36.00 mm  │ ──────────────  ▁▁▁ Saffron tick             │  accent rule
           ├──────────────────────────────────────────────┤
 42.00 mm  │                                              │  MAIN CONTENT ZONE
           │  primary information / tables / diagrams     │  ~65-80% of
           │  code panels / screenshots / explanation     │  usable height
           │                                              │
           │  ── supporting zone: callouts, notes ──      │  SUPPORTING ZONE
 163.95 mm │                                              │
 169.95 mm ├──────────────────────────────────────────────┤  footer divider
 171.45 mm │            Page 1 of 9          [ Lifewood ] │  FOOTER ZONE
 190.50 mm └──────────────────────────────────────────────┘
```

| Anchor | mm | Note |
|---|---|---|
| Header kicker baseline | 13.34 | Full folio number (`1.0`, `1.1`, `1.1.1`) on its own line — never a bare digit |
| Page title | 19.50 | Locked x = left margin, one line, 32pt, no wrap, no per-page drift |
| Header rule | 36.00 | Castleton hairline 0.5 mm, content width + 24 mm Saffron tick |
| Body top | 42.00 | Fixed offset — content never butts against the header |
| Body bottom | 163.95 | 6 mm clear above the footer divider |
| Footer divider | 169.95 | Castleton hairline 0.5 mm, content width |
| Footer band top | 171.45 | Height 19.05 mm |

Rhythm: **top rule → page title → accent → subtitle → content**. Spacing must feel deliberate.

**The divider sits ~1.5 mm above the footer band — glued tight, not floating.** A large empty region between the last content element and the divider is a failure state: rebalance the content (§13), do not move the divider up.

Body zone = 42.00 → 163.95 mm = **121.95 mm = 77% of usable height** — inside the 65–80% target.

### 21.3 Footer contract

```
MAIN CONTENT


────────────────────────────────────────────────────────
                     Page 1 of 9              [Lifewood]
```

| Slot | Content |
|---|---|
| Left | **Empty** |
| Center | `Page X of Y`, 10pt SemiBold folio |
| Right | Lifewood logo, 45.72 mm wide, 17.78 mm right clearance |

Nothing else goes in the footer. Cover: no divider, no page number, no logo. Contents: divider + logo, no page number.

---

## 22. Cover & Contents Pages

### 22.1 Cover Page

The first page is a **dedicated cover**, not a content page with a big title.

**Logo:** exactly ONE, in the upper-left / header area. **Do not repeat the logo bottom-right.** The bottom-right region carries abstract brand graphics, geometric forms, or intentional whitespace for balance.

**Composition:**

* Left Saffron rail
* Hero logo, top-left of the text column
* Small Saffron accent / rule
* **Large project title, 42–60 pt** — one of the largest elements on the page
* Subtitle
* Optional description
* `Prepared by: Lifewood PH Team`
* `Date: Month Day, Year`
* Classification bottom-left, in the footer band: `CONFIDENTIAL — FOR INTERNAL USE ONLY`, 8 pt uppercase, Saffron tick above
* Bottom-right: supporting brand geometry / whitespace — **never a second logo**

Classification is the default on every deliverable; pass an explicit value to change it or `None` to omit. Never centered, never at the top, never dropped silently.

The classification stamp is a **cover-composition element**: it sits in the cover's bottom-left footer band but is exempt from the interior footer-content rule (§9). The cover carries no page number and no footer divider; the stamp is required cover metadata, not decoration.

### 22.2 Contents Page

The Contents page is a composition, not a small Word list.

| Region | Width | Content |
|---|---|---|
| Left column | **55–65% of content width** (≈174 mm at 60%) | Table of contents |
| Gutter | remainder (≈20 mm) | — |
| Right column | **30–35% of content width** (≈96 mm at 33%) | Supporting information |

**Entries:** section number · section title · leader dots · page number. Comfortable vertical rhythm (`s2` minimum between rows); never compressed into a small block at the top.

**Right column:** *How to use this document* / Audience / Conventions / Prerequisites / Important notes — vertically aligned with the top of the Contents list. The audience blurb must match the actual `audience` parameter (`user` / `admin` / `workflow` / `developer`), never a hardcoded default.

Chrome: header band identical to content pages ("Contents" as the page title), footer divider + bottom-right logo, **no page number**.

---

## 23. Anti-Slop Rules (zero tolerance)

**Composition & pagination**

1. **NO A4 or any non-16:9 page.** Manuals, workflow docs and reports are presentation-sized: 13.333 × 7.5 in, landscape. A portrait page is an automatic FAIL.
2. **NO PPTX/PPT/PowerPoint output.** PDF is the only generated format. No duplicate PPTX versions. (Spec §1.)
3. **NO premature pagination.** One logical topic per page. Before any continuation page: rewrite, remove redundancy, bullet-ify, combine, tighten spacing, rebalance (§2, §3, §13). A `(cont.)` label is a last resort, never the default.
4. **NO `(cont.)` pages in shipped documents — zero tolerance.** A section that overflows one page after §13 compression MUST split into numbered subsections (`X.0` + `X.1`, `X.2`, …), never a continuation page. Builders run the §25 Step 0 `(cont.)` text scan after every build and FAIL if any `(cont.)` / ` (CONT.)` is found; the fix is content compression or a subsection split, then rebuild. Code panels may still split internally with `(CONT.)` (§24.1) — that is a single block breaking, not a section continuation.
5. **NO content jammed into the upper-left** with the rest of the canvas unused, and **no accidental voids** — including a large gap between the last content element and the footer divider.
6. **NO full-width body text.** Running copy wraps to a column (~70–90 characters), never across the full 290 mm content width. Diagrams (SVG) may use the full content width (§26).
7. **NO title-block drift.** Titles sit at the locked x/y at the locked size; body starts at the fixed offset. No centered titles on content pages.
8. **NO wrapped titles.** A page title renders on one line; a title that wraps must be shortened or reworded, never silently re-sized below the scale floor.
9. **NO unbounded display type.** Titles auto-fit — shrink within range, then ellipsis for one-liners; shrink after two lines for cover titles.
10. **NO arbitrary spacing.** Gaps come from `s1`–`s4` (§12).
11. **NO content past the live area.** Nothing below the footer divider, above the header rule, or outside the margins. Blocks that genuinely cannot fit after §13 compression break to a numbered subsection page — never drawn off-page, never silently clipped, never a `(cont.)` page.

**Branding**

11. **NO bottom-right logo on the cover page.** The cover carries exactly one logo, upper-left.
13. **NO interior page missing the bottom-right logo.**
14. **NO logo anywhere other than upper-left (cover) or bottom-right (interior).**
15. **NO logo crowding the edge.** 17.78 mm right clearance.
16. **NO distorted, recolored, cropped or rotated logo.** Aspect ratio ~5.5:1, exactly.
17. **NO extra footer text.** Footer = centered `Page X of Y` + bottom-right logo. No document titles, product names, quotes, or descriptions unless explicitly requested.
18. **NO page number on the cover or Contents page.**
19. **NO unverified numbering claim.** "Numbering starts on the first content page" must be proven by `verify_numbering()` or by reading the rendered folio — never asserted from the code's intent.
20. **NO cover missing its classification stamp.** Dropping it requires an explicit `classification=None`, never silence.
21. **NO mixed number styles.** Header kicker, footer folio and Contents page numbers are one design (Manrope SemiBold, 10 pt, Castleton on light / Paper on dark). No Saffron circle badges, no inline `1.0 Heading` single-run mixes, no bare-chapter-digit truncation. Number always BEFORE the title (§5).
22. **NO heading-number above folio scale on content pages.** The kicker (section number) stays at the folio family size (12pt). Oversized numbers are never used on content pages.
23. **NO footer chrome drift.** Divider, folio and logo sit on the same band on every content page — same y, same sizes, same colours.

**Typography & colour**

24. **NO mixed typefaces.** One stack: Manrope → Aptos → Arial → Helvetica → DejaVu Sans.
25. **NO shrinking important text to fit.** Restructure the layout instead (§3).
26. **NO yellow/orange overuse.** Accents stay accents; never body text.
27. **NO pure white full-page background glare.** `#FFFFFF` is for cards/panels; page background is `#F9F7F7`.
28. **NO justified body text.** fpdf2's `multi_cell()` defaults to `align="J"` — every call must pass `align="L"` explicitly, or body copy silently renders fully justified with rivers of whitespace.

**Content**

29. **NO SmartArt, clip art, or disembodied handshakes.**
30. **NO bullet point walls** of numbers — use visual cards, tables, or charts.
31. **NO generic "how to use this document" text.** The Contents blurb must match the actual `audience` param.
32. **NO table cell overflow.** Cell text wraps to its column width (dry-run `multi_cell` to measure line count, size the row from it) — never a single-line `cell()` that bleeds into the next column.
33. **NO estimated block heights.** Any box drawn around text (callout, code panel, table row, card) measures the wrapped text first — `multi_cell(dry_run=True, output=LINES)` — and sizes itself from the measurement.
34. **NO "it looks fine" sign-off.** Layout claims are backed by `LifewoodPDF.audit_layout(path)` (or `save(path, audit=True)`), which reads the rendered file back and reports margin breaches, footer-band collisions, off-page content, and wrong canvas.

> A rule being *written down here* does not guarantee the *generator code* honours it. Items 27, 30, 31 were found broken in a real audit of the engine. See §24 for the current conformance gap, and grep `lifewood_pdf_builder.py` for `multi_cell(` to confirm every call site passes an explicit `align=`.

---

## 24. Python Engine — LifewoodPDF + Conformance Gap

- **PDF documents (`.pdf`)**: `LifewoodPDF` from `C:\Users\richa\.config\opencode\skills\lifewood-branding\lifewood_pdf_builder.py`
- **Shared constants**: `lifewood_pdf_design_system.py`
- **Overlap verification**: `python -m pytest test_overlap.py -v` (in `lifewood-branding/`)

Non-negotiables:

- Canvas 13.333 × 7.5 in. `LifewoodPDF` builds this natively — never pass an A4 format, never add a portrait variant "just for manuals". Every output PDF (whatever code path produced it) must pass the §25 Step 0 (e) canvas scan on the rendered file — a single A4 page fails the build.
- Header and footer bands are painted centrally (`header()` / `footer()`), so continuation pages inherit identical chrome. Never re-implement chrome inside a page builder.
- Cover + Contents unnumbered; numbering restarts at `Page 1 of N` on the first content page.
- **Numbering proof:** `pdf.verify_numbering()` returns `{"ok", "front_pages", "numbered_pages", "first_numbered_page", "errors"}`; `pdf.save()` runs it and raises on violation. Quote its output when claiming numbering is correct.
- **Layout proof:** `LifewoodPDF.audit_layout(path)` reads the rendered PDF back and returns `{"ok", "pages", "violations"}` — margin breaches, body copy on the footer band, off-page content, wrong canvas. `pdf.save(path, audit=True)` raises on any violation.
- **Overflow policy:** compress first (§3, §13), then break. Code panels split with `(CONT.)`, callouts measure wrapped height, tables redraw the header row after a break, Contents spills to a second front-matter page, two-column comparisons repeat both headings.

```bash
# Generate a manual — 16:9 canvas, numbering verified on save:
python -c "from lifewood_pdf_builder import LifewoodPDF; p=LifewoodPDF('User Manual','Operations',audience='user'); p.add_cover(); p.add_toc(['1.0 Overview','2.0 Setup']); p.add_content_page('1.0','Overview',['Body text.']); print(p.verify_numbering()); p.save('Lifewood_User_Manual.pdf')"
```

### 24.1 Engine conformance (as of 2026-08-13, after engine patch)

The engine now implements this spec on the layout surface. Verified deltas:

| Rule (this skill) | Required | Engine today | Where |
|---|---|---|---|
| L/R margin (7%) | 24.0 mm / 0.945 in | **conforms** | `PDF_MARGIN_L`, `PDF_MARGIN_R` |
| Top margin (7%) | 13.34 mm / 0.525 in | **conforms** | `PDF_MARGIN_T` |
| Page title | 32 pt | **conforms** | `PDF_HEADER_TITLE_SIZE = 32` |
| Cover title | 54 pt | **conforms** | `PDF_COVER_TITLE_SIZE = 54` |
| Folio / kicker | 12 pt (one family) | **conforms** | `PDF_FOLIO_SIZE`, `PDF_HEADER_NUM_SIZE = 12` |
| Header rule / body top | 36.0 / 42.0 mm | **conforms** | `PDF_HEADER_RULE_Y`, `PDF_BODY_TOP` |
| Footer left label | none | **conforms** — removed | `footer()` draws page number + logo only |
| Footer divider | near bottom, ~1.5 mm above band | **conforms** — 169.95 mm | `PDF_FOOTER_RULE_Y` |
| Sparse-page voids | content vertically centred, no accidental whitespace (§7, §18) | **conforms** — content pages, ToC, mixed pages and two-column pages centre their block when it fits in ≤60% of the body band | `_flow_columns`, `add_toc`, `add_mixed_content_page`, `add_two_column` |
| Mixed-page body size | 11–14 pt (default 12) | **conforms** — `PDF_BODY_SIZE` | `add_mixed_content_page` |
| Mixed-page SVG diagrams | `("svg", path[, label])` element — PyMuPDF-rasterised at 200 dpi (alpha), centred, ≤70 mm tall, optional caption | **conforms** — added 2026-08-14 | `add_svg` |
| Logo right clearance | 17.78 mm | **conforms** | `PDF_LOGO_RIGHT_CLEAR` |
| Page-break headroom | keep body band free before a break | **conforms** — tightened to 18 mm (was 30) so sections use more of the band | `add_mixed_content_page` |
| **Pagination** | one topic per page, compression-first (§2, §13); **zero `(cont.)` pages in shipped docs** | **CLOSED at caller level.** The engine still breaks mechanically, so callers MUST compress (§3) and split overflowing sections into numbered subsections (X.1, X.2) — and every builder MUST run the §25 Step 0 `(cont.)` text scan, failing the build on any hit | `lifewood_pdf_builder.py` page builders + repo builders |

The remaining gap is content-level (compression before pagination), which no renderer can enforce alone — it is now enforced by the builder-side `(cont.)` scan (§25 Step 0). `test_overlap.py` covers the conformed surface (89+ tests).

---

## 25. Visual Verification (screenshot-based)

### Step 0 — Automated gates (run BEFORE rendering screenshots)

```python
# (a) (cont.) scan — zero-tolerance: any hit fails the build.
#     Code-panel internal splits labelled "(CONT.)" are allowed; section
#     continuation pages are not. If found, compress the section or split
#     it into numbered subsections (X.1, X.2), then rebuild.
import fitz, re
doc = fitz.open("output.pdf")
text = " ".join(p.get_text() for p in doc)
hits = re.findall(r"\(cont\.\)|\(CONT\.\)", text)
assert not hits, f"continuation pages found: {hits}"

# (b) mojibake scan — no CP1252-mangled glyphs in rendered text.
bad = re.compile(r"[\u0080-\u009F\u2020\u00E2\u00C3]|â€|Ã")
assert not bad.findall(text), "mojibake in rendered text"

# (c) layout audit — save(audit=True) already ran it; re-run standalone OK.
# (d) numbering proof — verify_numbering() ran inside save().
# (e) CANVAS SCAN — zero tolerance: every page of every output PDF must be
#     the 16:9 slide canvas (338.66 x 190.5 mm). A single A4/portrait page
#     means plain-FPDF fallback code crept in — FAIL the build. This gate is
#     what catches a document generated outside LifewoodPDF (the engine's
#     own audit cannot see a PDF it never made).
for i, page in enumerate(doc):
    w = page.rect.width / 72 * 25.4
    h = page.rect.height / 72 * 25.4
    assert abs(w - 338.66) < 2.0 and abs(h - 190.5) < 2.0, (
        f"page {i + 1} is {w:.0f} x {h:.0f} mm — not 16:9 (A4/plain-FPDF "
        f"fallback). Rebuild with LifewoodPDF, never a bare FPDF."
    )
```

### Step 1 — Render pages to images

```bash
# PDF → images via PyMuPDF
python -c "
import fitz
doc = fitz.open('output.pdf')
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=200)
    pix.save(f'verify_page_{i+1}.png')
print(f'Exported {len(doc)} pages')
"
```

### Step 2 — Vision verification (auto-switch)

DeepSeek V4 Flash is text-only. When verification images exist on disk the system auto-detects them and routes to Mimo V2.5 (vision-capable) with this prompt:

```
Inspect each page for Lifewood design-system compliance. Report PASS or FAIL per
page with specific element references.

CANVAS
  0. 16:9 landscape (13.333 x 7.5 in) on EVERY page including manuals — portrait/A4 = FAIL
  1. 7-10% safe outer margins respected; content neither jammed upper-left nor
     floating in accidental voids
  2. Main content occupies ~65-80% of usable page height; no large empty region
     above the footer divider

PAGINATION
  3. One logical topic per page; no unnecessary "(cont.)" continuation pages;
     compression applied before any split

TYPOGRAPHY
  4. One typeface (Manrope or sans fallback) — no Times, no monospace in body
  5. Page title 30-40pt, one line, never wrapped or re-sized below scale
  6. Body 11-14pt and readable; nothing important shrunk to fit
  7. Hierarchy obvious within 2-3 seconds

LAYOUT
  8. Elements aligned to a single grid; margins consistent page to page
  9. Page not top-heavy, not bottom-heavy; vertically balanced
 10. Body copy wraps to a column (~70-90 chars), never full page width
 11. No overlapping text/elements; nothing past the margins
 12. Numbering hierarchical (X.0 / X.1); number BEFORE title

FOOTER
 13. Footer contains ONLY centered "Page X of Y" and the bottom-right logo —
     no document title, product name, quote, or description in the left slot
 14. Divider sits close above the footer band, not floating halfway up the page
 15. No large empty region between the last content element and the divider
 16. Footer chrome identical on every content page (same y, sizes, colours)

BRANDING
 17. Cover: exactly ONE logo, upper-left. NO bottom-right logo on the cover — FAIL if present
 18. Interior pages incl. Contents: bottom-right logo present, correct light/dark
     variant, unaltered aspect ratio (~5.5:1), real clearance from the edge
 19. Colours: bg #F9F7F7 or #FFFFFF (no full-page white glare); titles #046241;
     body #133020; accents #FFB347/#FFC370 only, not overused, never body text
 20. Page numbers absent on cover AND Contents; first content page = "Page 1 of N"
 21. Header kicker is the full folio number ("1.1", not "1"), same design family as
     the footer number; no Saffron badge, no inline "1.0 Heading" mixed run

COMPOSITION
 22. Cover: large title (42-60pt), Prepared by → Date → classification bottom-left;
     bottom-right is brand geometry or whitespace
 23. Contents: two-column (TOC 55-65% / supporting 30-35%), leader dots, generous
     row rhythm; audience blurb matches the document's actual audience
 24. Tables use the available width, adequate row height, readable text
 25. Cross-page consistency: cover, Contents, and all content pages (including section dividers) read as ONE
     system — same grid, same header band, same footer band, same type scale
 26. Final question: does this look intentionally designed, or does it look like
     content was placed onto a page? If the latter — recompose before export.
```

### Step 3 — Fix and re-verify

Any FAIL → fix generator code, re-render, re-inspect. Max 2 retry cycles, then escalate.

### Step 4 — Overlap guard

`python -m pytest test_overlap.py -v` — verifies the PDF system against the shared design constants.

---

## 26. SVG Diagrams (visual richness, not text dumps)

Pages built purely from body text, tables and code read as dumps. Add **1–3
diagrams per document** — one per major flow — so pages read as designed
artefacts. A diagram that merely repeats the surrounding text is deleted.

### Engine element

```python
pdf.add_mixed_content_page("7.0", "Data & Auth Flow", [
    ("svg", r"assets/auth-flow.svg", "Authentication flow"),   # label optional
    ("body", "…"),
])
```

`add_svg(path, label="")` rasterises the SVG via PyMuPDF at 200 dpi (with
alpha) and embeds it centred, up to full content width and **70 mm tall**
(~half the body band). A caption renders above the diagram when given.

### Design rules (Lifewood palette, flat, no decoration)

| Element | Rule |
|---|---|
| Canvas | `viewBox` ≈ 800×240 (wide); background rect `#F9F7F7` (or transparent) |
| Primary boxes | Castleton `#046241` fill, Paper `#F5EEDB` text |
| Secondary boxes | `#FFFFFF` fill, Castleton `#046241` 2px stroke, Serpent `#133020` text |
| Accent boxes | Saffron `#FFB347` fill, Serpent text — one accent per diagram, never body text |
| Arrows | Castleton `#046241`, 3px, arrowhead markers `orient="auto-start-reverse"` |
| Corners | `rx="12"` rounded rects; flat — no gradients, no shadows, no glows |
| Type | `font-family="Manrope, Arial, sans-serif"`; box titles 15–17px 700, detail 12–13px |
| Content | ≤6 boxes per diagram, ≤3 words per title, ≤12 words per detail line |

### When to use

Architecture flows, data pipelines, branch/release models, deploy paths,
auth flows, dashboard tier maps. Reuse one diagram across documents where
the flow is the same (e.g. the branch model appears in the Developer manual
and the Workflows document). Never decorative — every box must be a real
system component.

---

## 27. Design Philosophy Creation Workflow (exempt from document rules)

> Creates a visual philosophy (aesthetic movement) as a .md manifesto, then expresses it on a canvas as a downloadable .pdf or .png. Produces art objects — not documents with decoration. 90% visual, 10% essential text.

### Sub-command routing

| First word | Phases |
|---|---|
| `philosophy` | PHASE A (Manifesto .md) → PHASE B (Canvas .pdf/.png) |

### Workflow overview

1. **Deduce subtle reference** — Identify a niche conceptual thread from the original request. The topic is embedded subtly within the art itself. Someone familiar should feel it intuitively; others experience a masterful abstract composition.
2. **PHASE A: Design Philosophy Creation (.md)** — Write a named visual philosophy (1–2 word title, 4–6 paragraphs). Express it through: space/form, colour/material, scale/rhythm, composition/balance, visual hierarchy. Emphasise craftsmanship repeatedly — the work must appear as though it took countless hours from someone at the absolute top of their field.
3. **PHASE B: Canvas Expression (.pdf or .png)** — Express the philosophy visually on a single canvas (or multi-page for longer works), using:
   - Repeating patterns and perfect shapes
   - Systematic marks suggesting observation/documentation
   - Sparse, clinical typography with reference markers
   - Limited, intentional colour palette
   - Grid/coordinate systems suggesting an imaginary discipline
   - The paradox: analytical visual language expressing human experience

### Design principles

| Principle | Rule |
|---|---|
| **Visual Philosophy** | Create an aesthetic worldview, not a layout template |
| **Minimal Text** | Sparse, essential-only, integrated as visual element — never lengthy paragraphs |
| **Spatial Expression** | Ideas communicate through space, form, colour, composition |
| **Artistic Freedom** | The executor interprets the philosophy — provide creative room |
| **Expert Craftsmanship** | Every element meticulously crafted, the product of deep expertise |
| **Anti-AI Slop** | Must NOT look AI-generated. Must look human-made with painstaking attention |

### PHASE A — manifesto

- **Name** — 1–2 words: "Brutalist Joy", "Chromatic Silence", "Archive of Intention"
- **Manifesto** — 4–6 paragraphs covering space and form (grid as ritual framework, negative space as charged potential); colour and material (limited palette as evidentiary system, each colour earned); scale and rhythm (systematic pulse, variation against established pattern); composition and balance; visual hierarchy (what is withheld communicates as powerfully as what is shown)
- **Craftsmanship emphasis** — repeatedly stress master-level execution, countless hours, painstaking attention
- **Output**: `design-philosophy-<name>.md`

### PHASE B — canvas

1. Clear the mind. Gather the philosophy's essence.
2. Choose canvas: portrait or landscape, PDF or high-res PNG. **Art canvases are the ONLY exemption from the 16:9 document rule** — they are art objects, not deliverable documents, and the §21 grid / §23 chrome rules do not apply to them.
3. Create using the philosophy as guide — architectural grid and coordinate systems; accumulation marks suggesting patient observation; intentional colour fields; date stamps as temporal anchors; thin clinical sparse typography; marginalia (corner ticks, accession numbers, catalog entries); very faint grain/paper texture.
4. **Refinement pass** — improve alignment, crispness, spacing. Remove anything that doesn't serve the philosophy. Ask: "How can I make what's already here more of a piece of art?"

### Output files

| Artifact | Description | Example |
|---|---|---|
| `design-philosophy-<name>.md` | Philosophy manifesto | `design-philosophy-archive-of-intention.md` |
| `canvas-<name>.pdf` or `.png` | Visual expression | `canvas-archive-of-intention.png` |

### Canvas creation tools

- **Python Pillow** (`PIL`) for high-res PNG (2400×3600 px recommended)
- **fpdf2** (`from fpdf import FPDF`) for PDF generation
- **Fonts**: Calibri Light (`calibril.ttf`), Corbel Light (`corbell.ttf`), Segoe UI Light (`segoeuil.ttf`) on Windows — or Manrope for Lifewood-branded pieces
- Refine typography with `draw.textbbox()` for perfect centering; measure twice, render once

### Example implementation

**Philosophy**: "Archive of Intention" — systematic documentation as artistic expression. Subtle reference to Hanne Darboven's date-systems and On Kawara's "Today" series (conceptual art where documentation IS the artwork).

**Canvas**: 2400×3600 px PNG with archival grid, accumulation marks, Castleton Green colour field, date stamp "JUL 25 2026", coordinate labels, sparse manifesto quotes. Lifewood-inspired palette. Refined second pass for museum-quality precision.

Files at skill root: `design-philosophy-archive-of-intention.md`, `canvas-archive-of-intention.png`.
