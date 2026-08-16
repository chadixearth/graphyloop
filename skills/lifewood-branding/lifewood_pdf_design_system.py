#!/usr/bin/env python3
"""
Lifewood PDF Design System — brand constants and spec lock for fpdf2.

Provides all color/layout/logo constants and the PdfSpecLock class.
Import this module in any Lifewood PDF builder to ensure consistent
brand application.

Usage:
    from lifewood_pdf_design_system import (
        PDF_PAPER, PDF_CASTLETON_GREEN, PDF_SAFFRON, ...
        PdfSpecLock,
    )
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional

# ---------------------------------------------------------------------------
# Color palette — RGB tuples for fpdf2 (set_text_color / set_fill_color)
# ---------------------------------------------------------------------------

PDF_PAPER = (245, 238, 219)
"""Soft cream background (cover text on dark)."""

PDF_WHITE = (255, 255, 255)
"""White background / card fill."""

PDF_SEA_SALT = (249, 247, 247)
"""Preferred light background for content pages."""

PDF_CASTLETON_GREEN = (4, 98, 65)
"""Primary brand green — headings, thin header bar, dark backgrounds."""

PDF_DARK_SERPENT = (19, 48, 32)
"""Darkest green — subheadings, body text, section divider backgrounds."""

PDF_SAFFRON = (255, 179, 71)
"""Accent — logo hexagon, rules, highlights, cover accents."""

PDF_EARTH_YELLOW = (255, 195, 112)
"""Softer accent — fills, secondary highlights."""

# ---------------------------------------------------------------------------
# Page dimensions — PowerPoint 16:9 widescreen, landscape (mm)
#
# Every Lifewood deliverable (deck AND document/manual) uses the same canvas:
# 13.333 in × 7.5 in. A4 is FORBIDDEN — a manual is a slide-sized document so
# a PDF page and a PPTX slide can sit side by side without a size shift.
# ---------------------------------------------------------------------------

PDF_SLIDE_W_IN = 13.333
"""PowerPoint widescreen slide width in inches."""

PDF_SLIDE_H_IN = 7.5
"""PowerPoint widescreen slide height in inches."""

PDF_PAGE_W = round(PDF_SLIDE_W_IN * 25.4, 3)
"""Page width in mm — 338.658 mm (13.333 in)."""

PDF_PAGE_H = round(PDF_SLIDE_H_IN * 25.4, 3)
"""Page height in mm — 190.5 mm (7.5 in)."""

PDF_ASPECT = PDF_PAGE_W / PDF_PAGE_H
"""Canvas aspect ratio — 16:9 (≈1.7778)."""

# ---------------------------------------------------------------------------
# Margins — 7-10% safe outer area, mirrored by the PPTX grid
#
# Unified design system: 24.0 mm L/R is 7.1% of the 338.658 mm width, 13.34 mm
# top is 7.0% of the 190.5 mm height, 19.05 mm bottom is 10.0%. Content jammed
# into a 4.5% margin read as a document dropped onto a slide rather than a
# designed page, so the safe area was widened to the design-system band.
# ---------------------------------------------------------------------------

PDF_MARGIN_L = 24.0
"""Left margin (mm) — 24.0 mm (0.945 in), 7.1% safe area, same as the PPTX grid."""

PDF_MARGIN_R = 24.0
"""Right margin (mm) — 24.0 mm (0.945 in), 7.1% safe area, same as the PPTX grid."""

PDF_MARGIN_T = 13.34
"""Top margin (mm) — 13.34 mm (0.525 in), 7.0% safe area, same as the PPTX grid."""

PDF_MARGIN_B = round(0.75 * 25.4, 3)
"""Bottom margin (mm) — 19.05 mm (0.75 in), 10.0% safe area / footer band."""

PDF_CONTENT_W = round(PDF_PAGE_W - PDF_MARGIN_L - PDF_MARGIN_R, 3)
"""Usable content width (mm) — 290.658 mm."""

PDF_CONTENT_H = round(PDF_PAGE_H - PDF_MARGIN_T - PDF_MARGIN_B, 3)
"""Usable content height (mm) — 158.11 mm."""

# ---------------------------------------------------------------------------
# Spacing scale — every gap comes from a token, never an arbitrary number
# ---------------------------------------------------------------------------

PDF_S1 = round(8 * 25.4 / 72.0, 3)
"""Small gap (mm) — 8 pt. Related elements: label to value, cell padding."""

PDF_S2 = round(12 * 25.4 / 72.0, 3)
"""Standard gap (mm) — 12 pt. Paragraph to paragraph, list rows."""

PDF_S3 = round(20 * 25.4 / 72.0, 3)
"""Section gap (mm) — 20 pt. Heading block to its content."""

PDF_S4 = round(32 * 25.4 / 72.0, 3)
"""Major section gap (mm) — 32 pt. Between top-level page regions."""

# ---------------------------------------------------------------------------
# Header band (identical on every content page — locked, no per-page drift)
# ---------------------------------------------------------------------------

PDF_HEADER_KICKER_Y = PDF_MARGIN_T
"""Y of the folio heading-number kicker line (mm) — 13.34 mm."""

PDF_HEADER_TITLE_Y = 19.5
"""Y of the locked one-line page title (mm) — sized for the 32 pt title."""

PDF_HEADER_TITLE_H = 13.0
"""Cell height (mm) of the locked title line — clears 32 pt without touching
the header rule."""

PDF_HEADER_RULE_Y = 36.0
"""Y of the hairline rule that closes the header band (mm)."""

PDF_HEADER_RULE_H = 0.5
"""Header hairline thickness (mm) — same weight as the footer rule."""

PDF_BODY_TOP = 42.0
"""Y where page body content starts (mm) — locked on every content page."""

# ---------------------------------------------------------------------------
# Footer band (identical on every content page)
# ---------------------------------------------------------------------------

PDF_FOOTER_ZONE_H = PDF_MARGIN_B
"""Footer zone height (mm) — 19.05 mm (0.75 in), same as the PPTX zone."""

PDF_FOOTER_Y = round(PDF_PAGE_H - PDF_FOOTER_ZONE_H, 3)
"""Y-position for the footer zone top (label, page number, logo) — 171.45 mm."""

PDF_FOOTER_RULE_Y = round(PDF_FOOTER_Y - 1.5, 3)
"""Y (mm) of the hairline rule above the footer zone — ≈169.95 mm; the
divider sits ~1.5 mm above the footer band top, glued tight."""

PDF_FOOTER_RULE_H = 0.5
"""Hairline rule thickness in mm."""

# ---------------------------------------------------------------------------
# Type scale — ONE scale shared with the PPTX engine.
#
# A PDF page and a PPTX slide are the same 13.333 x 7.5 in rectangle, so the
# same role must render at the same point size in both. The old split scale
# (28 pt PPT title / 16 pt PDF title, 12 pt / 9 pt folio) made two documents
# out of one design system.
# ---------------------------------------------------------------------------

PDF_COVER_TITLE_SIZE = 54
"""Cover title size in pt (design-system range 42-60)."""

PDF_COVER_TITLE_MIN = 42
"""Cover title shrink floor in pt — never smaller, reword the title instead."""

PDF_HEADER_TITLE_SIZE = 32
"""Content-page title size in pt, range 30-40 (locked, one line, never wraps)."""

PDF_HEADER_TITLE_MIN = 30
"""Page-title shrink floor in pt — below this, ellipsis rather than shrink."""

PDF_SECTION_HEADING_SIZE = 24
"""Section heading (H2) size in pt (range 20-28)."""

PDF_SUBHEADING_SIZE = 18
"""Subheading (H3) size in pt (range 16-20)."""

PDF_BODY_SIZE = 12
"""Body text size in pt (range 11-14)."""

PDF_TABLE_SIZE = 11
"""Table text size in pt (range 10-13)."""

PDF_CAPTION_SIZE = 10
"""Caption / supporting text size in pt (range 9-11)."""

PDF_CODE_SIZE = 10
"""Code panel text size in pt — must stay readable at 100% zoom."""

PDF_FOLIO_SIZE = 12
"""Footer 'Page X of Y' folio size in pt (range 10-12)."""

PDF_HEADER_NUM_SIZE = PDF_FOLIO_SIZE
"""Folio heading-number kicker — one folio family with the footer number."""

PDF_CLASSIFICATION_SIZE = 8
"""Cover classification stamp size in pt."""

PDF_BODY_BOTTOM = round(PDF_FOOTER_RULE_Y - 6.0, 3)
"""Lowest Y body content may reach before a page break (mm)."""

PDF_BODY_H = round(PDF_BODY_BOTTOM - PDF_BODY_TOP, 3)
"""Body band height (mm) between the header rule and the footer rule."""

# ---------------------------------------------------------------------------
# Column grid — a 16:9 page is too wide for a single text measure
# ---------------------------------------------------------------------------

PDF_COL_GAP = 12.0
"""Gutter between body text columns (mm)."""

PDF_COL_W = round((PDF_CONTENT_W - PDF_COL_GAP) / 2.0, 3)
"""Two-column body text column width (mm) — 139.329 mm."""

PDF_MEASURE_W = round(PDF_CONTENT_W * 0.68, 3)
"""Max single-column text measure (mm) — keeps line length readable on 16:9.

Applies to running body copy only (~70-90 characters). Tables, diagrams and
images may use the full content width."""

# ---------------------------------------------------------------------------
# Contents-page grid — asymmetric: entries 55-65%, supporting column 30-35%
# ---------------------------------------------------------------------------

PDF_TOC_COL_W = round(PDF_CONTENT_W * 0.60, 3)
"""Contents list column width (mm) — 60% of the content width."""

PDF_TOC_SIDE_W = round(PDF_CONTENT_W * 0.33, 3)
"""Contents supporting column width (mm) — 33% of the content width."""

PDF_TOC_SIDE_X_OFFSET = round(PDF_CONTENT_W - PDF_TOC_SIDE_W, 3)
"""X offset from the left margin to the supporting column (mm) — right-anchored."""

# ---------------------------------------------------------------------------
# Logo sizing (native aspect ratio ~5.5:1, 1655×300 px)
# ---------------------------------------------------------------------------

PDF_LOGO_W = round(1.8 * 25.4, 3)
"""Logo display width in mm — 45.72 mm (1.8 in), same as the PPTX logo."""

PDF_LOGO_H = round(PDF_LOGO_W / 5.5, 3)
"""Logo display height in mm preserving 5.5:1 ratio (~8.31 mm)."""

PDF_LOGO_RIGHT_CLEAR = round(0.7 * 25.4, 3)
"""Clearance from the right page edge to the logo (mm) — 17.78 mm (0.7 in)."""

# ---------------------------------------------------------------------------
# Brand assets
# ---------------------------------------------------------------------------

SKILL_DIR = Path(__file__).resolve().parent
"""Directory containing this skill."""

ASSETS_DIR = SKILL_DIR / "assets"
"""Directory containing brand asset files (logo images, colour reference)."""

PDF_LOGO_LIGHT = str(ASSETS_DIR / "lwlogo_lightmode.png")
"""Light-background logo — green wordmark + orange hexagon. Use on Paper/White/Sea Salt
bgs."""

PDF_LOGO_DARK = str(ASSETS_DIR / "lwlogo_darkmode.png")
"""Dark-background logo — cream wordmark + orange hexagon. Use on Castleton Green /
Dark Serpent bgs."""

# ---------------------------------------------------------------------------
# Typography
# ---------------------------------------------------------------------------

PDF_FONT = "Manrope"
"""Lifewood brand font. Falls back to Helvetica when Manrope TTF is unavailable."""

PDF_FALLBACK_FONT = "Helvetica"
"""Fallback sans-serif when Manrope is not installed."""


# ---------------------------------------------------------------------------
# Design-spec lock
# ---------------------------------------------------------------------------

class PdfSpecLock:
    """Immutable specification lock enforcing Lifewood brand rules for PDFs.

    All generated PDFs MUST adhere to these design constraints. Consumers check
    values against this lock for compliance verification.

    Example
    -------
    >>> PdfSpecLock.CASTLETON_GREEN
    (4, 98, 65)
    >>> PdfSpecLock.FONT
    'Manrope'
    >>> PdfSpecLock.LOGO_W
    45.72
    """

    # Colors
    PAPER = PDF_PAPER
    WHITE = PDF_WHITE
    SEA_SALT = PDF_SEA_SALT
    CASTLETON_GREEN = PDF_CASTLETON_GREEN
    DARK_SERPENT = PDF_DARK_SERPENT
    SAFFRON = PDF_SAFFRON
    EARTH_YELLOW = PDF_EARTH_YELLOW

    # Layout
    PAGE_W = PDF_PAGE_W
    PAGE_H = PDF_PAGE_H
    ASPECT = PDF_ASPECT
    MARGIN_L = PDF_MARGIN_L
    MARGIN_R = PDF_MARGIN_R
    MARGIN_T = PDF_MARGIN_T
    MARGIN_B = PDF_MARGIN_B
    CONTENT_W = PDF_CONTENT_W
    CONTENT_H = PDF_CONTENT_H
    HEADER_KICKER_Y = PDF_HEADER_KICKER_Y
    HEADER_TITLE_Y = PDF_HEADER_TITLE_Y
    HEADER_TITLE_H = PDF_HEADER_TITLE_H
    HEADER_RULE_Y = PDF_HEADER_RULE_Y
    HEADER_RULE_H = PDF_HEADER_RULE_H
    BODY_TOP = PDF_BODY_TOP
    BODY_BOTTOM = PDF_BODY_BOTTOM
    BODY_H = PDF_BODY_H
    COL_GAP = PDF_COL_GAP
    COL_W = PDF_COL_W
    MEASURE_W = PDF_MEASURE_W
    TOC_COL_W = PDF_TOC_COL_W
    TOC_SIDE_W = PDF_TOC_SIDE_W
    FOOTER_Y = PDF_FOOTER_Y
    FOOTER_ZONE_H = PDF_FOOTER_ZONE_H
    FOOTER_RULE_Y = PDF_FOOTER_RULE_Y
    FOOTER_RULE_H = PDF_FOOTER_RULE_H

    # Spacing tokens
    S1 = PDF_S1
    S2 = PDF_S2
    S3 = PDF_S3
    S4 = PDF_S4

    # Type scale (shared with the PPTX engine — one canvas, one scale)
    COVER_TITLE_SIZE = PDF_COVER_TITLE_SIZE
    HEADER_TITLE_SIZE = PDF_HEADER_TITLE_SIZE
    SECTION_HEADING_SIZE = PDF_SECTION_HEADING_SIZE
    SUBHEADING_SIZE = PDF_SUBHEADING_SIZE
    BODY_SIZE = PDF_BODY_SIZE
    TABLE_SIZE = PDF_TABLE_SIZE
    CAPTION_SIZE = PDF_CAPTION_SIZE
    FOLIO_SIZE = PDF_FOLIO_SIZE
    HEADER_NUM_SIZE = PDF_HEADER_NUM_SIZE

    #: Footer carries page numbering + logo ONLY. The left slot stays empty —
    #: no document title, product name, quote or description.
    FOOTER_LEFT_SLOT = None

    #: The cover carries exactly ONE logo, upper-left. No bottom-right logo.
    COVER_FOOTER_LOGO = False

    # Logo
    LOGO_W = PDF_LOGO_W
    LOGO_H = PDF_LOGO_H
    LOGO_RIGHT_CLEAR = PDF_LOGO_RIGHT_CLEAR
    LOGO_LIGHT = PDF_LOGO_LIGHT
    LOGO_DARK = PDF_LOGO_DARK

    # Font
    FONT = PDF_FONT
    FALLBACK_FONT = PDF_FALLBACK_FONT

    # Color groups for validation
    LIGHT_BG_COLORS = {PAPER, WHITE, SEA_SALT}
    DARK_BG_COLORS = {CASTLETON_GREEN, DARK_SERPENT}
    ACCENT_COLORS = {SAFFRON, EARTH_YELLOW}
    ALL_COLORS = LIGHT_BG_COLORS | DARK_BG_COLORS | ACCENT_COLORS

    # ── Spec lock file I/O ──────────────────────────────────────────────

    #: Fixed cover front-matter order for every Lifewood deliverable.
    COVER_FRONT_MATTER = ("Prepared by", "Date", "Classification")

    #: Default handling classification stamped bottom-left on the cover.
    DEFAULT_CLASSIFICATION = "CONFIDENTIAL — FOR INTERNAL USE ONLY"

    @classmethod
    def write_spec_lock(cls, output_dir: str, title: str = "Untitled",
                        audience: str = "general", page_count: int = 1,
                        sections: Optional[List[str]] = None,
                        classification: Optional[str] = None) -> str:
        """Write pdf_spec_lock.md with ALL brand values + content fields.

        Parameters
        ----------
        output_dir :
            Directory to write the file into.
        title :
            Document title.
        audience :
            Target audience label (general, user, admin, workflow).
        page_count :
            Number of pages.
        sections :
            List of section heading strings (e.g. ``["1.0 Intro", "2.0 Body"]``).
        classification :
            Cover classification stamp (default:
            ``CONFIDENTIAL — FOR INTERNAL USE ONLY``).

        Returns
        -------
        Path to the written file.
        """
        if sections is None:
            sections = []
        classification = classification or cls.DEFAULT_CLASSIFICATION
        path = os.path.join(output_dir, "pdf_spec_lock.md")
        date_str = datetime.today().strftime("%B %d, %Y")

        lines = [
            "# PDF Execution Lock",
            "",
            "> Machine-readable execution contract for PDF generation.",
            "> AI MUST read this before authoring any PDF page.",
            "> Separate from PPT spec_lock — PDF keys use ``pdf_`` prefix.",
            "",
            f"- **Generated:** {date_str}",
            f"- **Audience:** {audience}",
            f"- **Page count:** {page_count}",
            "",
            "## pdf_canvas",
            f"- page_size: PowerPoint 16:9 ({cls.PAGE_W}×{cls.PAGE_H} mm / "
            f"{PDF_SLIDE_W_IN}×{PDF_SLIDE_H_IN} in)",
            "- orientation: landscape",
            f"- aspect_ratio: {cls.ASPECT:.4f}",
            "- a4: FORBIDDEN",
            f"- margin_left: {cls.MARGIN_L}",
            f"- margin_right: {cls.MARGIN_R}",
            f"- margin_top: {cls.MARGIN_T}",
            f"- margin_bottom: {cls.MARGIN_B}",
            f"- content_width: {cls.CONTENT_W}",
            f"- content_height: {cls.CONTENT_H}",
            f"- column_width: {cls.COL_W}",
            f"- column_gap: {cls.COL_GAP}",
            f"- body_measure_cap: {cls.MEASURE_W}",
            f"- toc_col_width: {cls.TOC_COL_W}",
            f"- toc_side_width: {cls.TOC_SIDE_W}",
            "- safe_area: 7-10% outer margins",
            "",
            "## pdf_spacing",
            f"- s1: {cls.S1}  # 8pt",
            f"- s2: {cls.S2}  # 12pt",
            f"- s3: {cls.S3}  # 20pt",
            f"- s4: {cls.S4}  # 32pt",
            "",
            "## pdf_colors",
            f"- background: #F9F7F7  (Sea Salt)",
            f"- secondary_bg: #FFFFFF  (White)",
            f"- primary: #046241  (Castleton Green)",
            f"- accent: #FFB347  (Saffron)",
            f"- secondary_accent: #FFC370  (Earth Yellow)",
            f"- body_text: #133020  (Dark Serpent)",
            f"- text_on_dark: #F5EEDB  (Paper)",
            "",
            "## pdf_typography",
            "# One scale shared with the PPTX engine — same rectangle, same points.",
            f"- font_family: {cls.FONT}",
            f"- fallback_font: {cls.FALLBACK_FONT}",
            f"- cover_title_size: {cls.COVER_TITLE_SIZE}   # range 42-60",
            f"- page_title_size: {cls.HEADER_TITLE_SIZE}   # range 30-40",
            f"- section_heading_size: {cls.SECTION_HEADING_SIZE}  # range 20-28",
            f"- subheading_size: {cls.SUBHEADING_SIZE}  # range 16-20",
            f"- body_size: {cls.BODY_SIZE}  # range 11-14",
            f"- table_size: {cls.TABLE_SIZE}  # range 10-13",
            f"- caption_size: {cls.CAPTION_SIZE}  # range 9-11",
            f"- folio_size: {cls.FOLIO_SIZE}  # range 8-10",
            "",
            "## pdf_layout",
            "- cover_logo_placement: upper-left (hero) ONLY",
            "- cover_footer_logo: FORBIDDEN",
            "- interior_logo_placement: bottom-right",
            f"- logo_width_mm: {cls.LOGO_W}",
            f"- logo_height_mm: {cls.LOGO_H:.2f}",
            f"- logo_right_clearance_mm: {cls.LOGO_RIGHT_CLEAR}",
            f"- header_kicker_y_mm: {cls.HEADER_KICKER_Y}",
            f"- header_title_y_mm: {cls.HEADER_TITLE_Y}",
            f"- header_rule_y_mm: {cls.HEADER_RULE_Y}",
            f"- body_top_mm: {cls.BODY_TOP}",
            f"- body_bottom_mm: {cls.BODY_BOTTOM}",
            f"- footer_y_mm: {cls.FOOTER_Y}",
            f"- footer_rule_y_mm: {cls.FOOTER_RULE_Y}",
            f"- footer_rule_h_mm: {cls.FOOTER_RULE_H}",
            "- footer_left_slot: EMPTY  # no document title, no description",
            "- footer_contents: centered 'Page X of Y' + bottom-right logo ONLY",
            f"- header_number_size: {cls.HEADER_NUM_SIZE}",
            f"- header_title_size: {cls.HEADER_TITLE_SIZE}",
            "- page_number_format: Page X of Y",
            "- page_numbering_starts_after_toc: true",
            "- cover_numbered: false",
            "- toc_numbered: false",
            f"- cover_front_matter: {' -> '.join(cls.COVER_FRONT_MATTER)}",
            f"- cover_classification: {classification}",
            "- cover_classification_placement: bottom-left (footer band, "
            "opposite the logo)",
            "- heading_system: numbered (1.0, 1.1, 1.1.1...)",
            "- bullet_points: FORBIDDEN",
            "",
            "## pdf_content",
            f"- title: {title}",
        ]
        for s in sections:
            lines.append(f"- section: {s}")

        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        return path

    @classmethod
    def read_spec_lock(cls, filepath: str) -> dict:
        """Parse a pdf_spec_lock.md back into a dictionary.

        Returns
        -------
        dict with keys like ``pdf_canvas``, ``pdf_colors``, etc.
        Each value is a dict of key-value pairs parsed from the section.
        """
        result: dict = {}
        current_section: Optional[str] = None
        section_data: dict = {}

        section_re = re.compile(r"^##\s+(.+)$")
        kv_re = re.compile(r"^-\s*(\w[\w_]*)\s*:\s*(.+)$")

        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.rstrip()
                sm = section_re.match(line)
                if sm:
                    if current_section and section_data:
                        result[current_section] = section_data
                    current_section = sm.group(1).strip()
                    section_data = {}
                    continue
                km = kv_re.match(line)
                if km and current_section:
                    key = km.group(1).strip()
                    val = km.group(2).strip()
                    section_data[key] = val
            if current_section and section_data:
                result[current_section] = section_data

        return result
