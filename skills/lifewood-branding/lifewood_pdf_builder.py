#!/usr/bin/env python3
"""
Lifewood PDF Builder — branded multi-page PDF generator using fpdf2.

Builds PowerPoint-sized (13.333 × 7.5 in, 16:9 landscape) PDFs with strict
Lifewood brand identity. A4 is forbidden: manuals, workflows and reports use
the same slide canvas as the PowerPoint decks so a page and a slide are
interchangeable.

  - Colour palette: Paper, Sea Salt, Castleton Green, Dark Serpent, Saffron
  - Typography: Manrope (with Helvetica fallback), one type scale shared with
    the PPTX engine — same rectangle, same point sizes
  - 7-10% safe outer margins (24.0 / 24.0 / 13.34 / 19.05 mm)
  - Numbered heading hierarchy (1.0, 1.1, 1.1.1 …)
  - Cover carries exactly ONE logo (hero, upper-left) — no bottom-right logo
  - Interior pages carry the logo bottom-right (correct light/dark variant)
  - Footer holds page numbering + logo ONLY; the left slot stays empty
  - Page X of Y bottom-centre on content pages only — cover & TOC unnumbered, numbering starts after the ToC
  - One locked page grammar: header band (kicker + title + hairline) → body
    band → footer band (hairline + centred folio + logo). Continuation
    pages inherit the same chrome automatically.
  - Cover and section dividers share that grammar; only the palette flips
    between the ``editorial`` (dark) and ``swiss`` (light) variants.

Usage:
    from lifewood_pdf_builder import LifewoodPDF

    pdf = LifewoodPDF("Document Title", "Subtitle Here")
    pdf.add_cover()
    pdf.add_toc(["1.0 Introduction", "2.0 Body", "3.0 Conclusion"])
    pdf.add_content_page("1.0", "Intro", ["Paragraph one.", "Paragraph two."])
    pdf.add_section_divider("2.0", "Body")
    pdf.add_content_page("2.1", "Details", ["Detail A.", "Detail B."])
    pdf.save("output.pdf")
"""

from __future__ import annotations

import io
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from fpdf import FPDF
from fpdf.enums import MethodReturnValue

try:
    import fitz  # PyMuPDF — SVG rasterisation for diagram support
except ImportError:
    fitz = None

from lifewood_pdf_design_system import (
    PDF_PAPER,
    PDF_WHITE,
    PDF_SEA_SALT,
    PDF_CASTLETON_GREEN,
    PDF_DARK_SERPENT,
    PDF_SAFFRON,
    PDF_EARTH_YELLOW,
    PDF_PAGE_W,
    PDF_PAGE_H,
    PDF_MARGIN_L,
    PDF_MARGIN_R,
    PDF_MARGIN_T,
    PDF_MARGIN_B,
    PDF_CONTENT_W,
    PDF_CONTENT_H,
    PDF_HEADER_KICKER_Y,
    PDF_HEADER_TITLE_Y,
    PDF_HEADER_TITLE_H,
    PDF_HEADER_RULE_Y,
    PDF_HEADER_RULE_H,
    PDF_HEADER_NUM_SIZE,
    PDF_HEADER_TITLE_SIZE,
    PDF_HEADER_TITLE_MIN,
    PDF_COVER_TITLE_SIZE,
    PDF_COVER_TITLE_MIN,
    PDF_SUBHEADING_SIZE,
    PDF_BODY_SIZE,
    PDF_CAPTION_SIZE,
    PDF_CODE_SIZE,
    PDF_TABLE_SIZE,
    PDF_FOLIO_SIZE,
    PDF_CLASSIFICATION_SIZE,
    PDF_BODY_TOP,
    PDF_BODY_BOTTOM,
    PDF_BODY_H,
    PDF_COL_GAP,
    PDF_COL_W,
    PDF_MEASURE_W,
    PDF_TOC_COL_W,
    PDF_TOC_SIDE_W,
    PDF_TOC_SIDE_X_OFFSET,
    PDF_FOOTER_Y,
    PDF_FOOTER_ZONE_H,
    PDF_FOOTER_RULE_Y,
    PDF_FOOTER_RULE_H,
    PDF_LOGO_W,
    PDF_LOGO_H,
    PDF_LOGO_RIGHT_CLEAR,
    PDF_LOGO_LIGHT,
    PDF_LOGO_DARK,
    PDF_FONT,
    PDF_FALLBACK_FONT,
    PdfSpecLock,
    ASSETS_DIR,
    SKILL_DIR,
)

# ── Element type aliases for mixed-content pages ─────────────────────
# Each element is a tuple: (type, *args)
#   ("body", "paragraph text")
#   ("code", "code content", "label")
#   ("table", ["Header1", "Header2"], [["r1c1","r1c2"], ...])
#   ("callout", "Warning", "callout body text")
#   ("steps", ["Step 1 text", "Step 2 text", ...])
#   ("blank",)
#   ("spacer", height_mm)
Element = Tuple[str, ...]

from lifewood_design_variants import get_variant

__all__ = ["LifewoodPDF"]


# ---------------------------------------------------------------------------
# Font search paths
# ---------------------------------------------------------------------------

_MANROPE_CANDIDATES = [
    ASSETS_DIR / "Manrope-Regular.ttf",
    ASSETS_DIR / "manrope" / "Manrope-Regular.ttf",
    ASSETS_DIR / "fonts" / "Manrope-Regular.ttf",
    Path("C:\\Windows\\Fonts\\Manrope-Regular.ttf"),
    Path("C:\\Windows\\Fonts\\manrope", "Manrope-Regular.ttf"),
    Path("C:\\Windows\\Fonts\\Manrope", "Manrope[wght].ttf"),
]

_BOLD_CANDIDATES = [
    ASSETS_DIR / "Manrope-Bold.ttf",
    ASSETS_DIR / "manrope" / "Manrope-Bold.ttf",
    ASSETS_DIR / "fonts" / "Manrope-Bold.ttf",
    Path("C:\\Windows\\Fonts\\Manrope-Bold.ttf"),
    Path("C:\\Windows\\Fonts\\manrope", "Manrope-Bold.ttf"),
    Path("C:\\Windows\\Fonts\\Manrope", "Manrope-Bold.ttf"),
]


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


class LifewoodPDF(FPDF):
    """Branded PowerPoint-sized (16:9 landscape) PDF following the Lifewood
    design system.

    Parameters
    ----------
    title : str
        Document title (appears on cover and in metadata).
    subtitle : str or None
        Optional subtitle on the cover page.
    audience : str
        Reserved for content filtering (default ``"general"``).
    date_str : str or None
        Display date on the cover (default: today's date formatted per
        Lifewood convention: "July 23, 2026").
    classification : str or None
        Handling classification printed bottom-left on the cover. Defaults
        to ``CONFIDENTIAL — FOR INTERNAL USE ONLY``. Pass ``None`` or ``""``
        for an unclassified deliverable.
    """

    #: Default cover classification for Lifewood deliverables.
    DEFAULT_CLASSIFICATION = "CONFIDENTIAL — FOR INTERNAL USE ONLY"

    def __init__(
        self,
        title: str,
        subtitle: Optional[str] = None,
        audience: str = "general",
        date_str: Optional[str] = None,
        variant: str = "editorial",
        classification: Optional[str] = DEFAULT_CLASSIFICATION,
    ):
        # PowerPoint widescreen canvas. fpdf2's landscape mode swaps the
        # supplied (w, h), so the format is passed portrait-first.
        super().__init__(
            orientation="L", unit="mm", format=(PDF_PAGE_H, PDF_PAGE_W)
        )
        # Auto page breaks stop above the footer band — body text can never
        # land on the hairline rule, the folio, or the logo.
        self.set_auto_page_break(True, margin=PDF_PAGE_H - PDF_BODY_BOTTOM)
        self.set_margins(PDF_MARGIN_L, PDF_MARGIN_T, PDF_MARGIN_R)

        self.title = title
        self.subtitle = subtitle
        self.audience = audience
        self.date_str = date_str or datetime.today().strftime("%B %d, %Y")
        self.classification = (classification or "").strip()

        self.alias_nb_pages()
        self._front_pages = 0
        self.variant = variant
        self._vs = get_variant(variant)

        # --- Page-type tracking --------------------------------------------
        #  _page_types[pn]  →  str: 'cover', 'toc', 'section_divider',
        #                           'content', 'two_column'
        #  _page_bg[pn]     →  'light' | 'dark'
        #  _page_heads[pn]  →  (heading_num, heading_text, is_continuation)
        #
        #  A page builder declares the page it is about to open via
        #  ``_open_page()``; ``header()`` consumes that declaration and paints
        #  the whole page frame (background + header band). Pages opened by
        #  fpdf2's auto page break inherit the previous page's declaration and
        #  are flagged as continuations, so chrome never drifts.
        self._page_types: dict[int, str] = {}
        self._page_bg: dict[int, str] = {}
        self._page_heads: dict[int, Tuple[str, str, bool]] = {}
        self._pending: Optional[Tuple[str, str, str, str]] = None
        self._next_is_cover = False

        # --- Font registration ---------------------------------------------
        self._font_ok = self._register_font()
        self._font_name = PDF_FONT if self._font_ok else PDF_FALLBACK_FONT

    # ==================================================================
    #  Font helpers
    # ==================================================================

    def _register_font(self) -> bool:
        """Try to register Manrope TTF (regular + bold).  Return ``True``
        if successful."""
        regular_path: Path | None = None
        bold_path: Path | None = None

        for p in _MANROPE_CANDIDATES:
            if p.is_file():
                regular_path = p
                break

        if regular_path is None:
            return False

        try:
            self.add_font("Manrope", "", str(regular_path))
        except Exception:
            return False

        for p in _BOLD_CANDIDATES:
            if p.is_file():
                bold_path = p
                break

        if bold_path is not None:
            try:
                self.add_font("Manrope", "B", str(bold_path))
            except Exception:
                pass  # non-fatal; bold style will fall back

        # Also register ExtraBold for heavier headings
        eb_path = ASSETS_DIR / "Manrope-ExtraBold.ttf"
        if eb_path.is_file():
            try:
                self.add_font("Manrope", "EB", str(eb_path))
            except Exception:
                pass

        # Register SemiBold for subheadings
        sb_path = ASSETS_DIR / "Manrope-SemiBold.ttf"
        if sb_path.is_file():
            try:
                self.add_font("Manrope", "SB", str(sb_path))
            except Exception:
                pass

        return True

    def _pick_font(self, style: str = "", size: float = 10):
        """Set active font (Manrope or fallback) with the given *style*
        and *size* in points."""
        self.set_font(self._font_name, style, size)

    # ==================================================================
    #  Header / Footer  (fpdf2 overrides)
    # ==================================================================

    # ==================================================================
    #  Page declaration
    # ==================================================================

    def _open_page(self, ptype: str, bg: str = "light",
                   heading_num: str = "", heading_text: str = "") -> int:
        """Declare and open a page. ``header()`` picks the declaration up and
        paints background + header band; the caller then draws body content.

        Returns the 1-indexed page number.
        """
        # Display pages (cover, ToC, dividers) are single, composed pages —
        # they must never spill onto an auto-broken continuation page.
        self.set_auto_page_break(
            ptype not in ("cover", "toc", "section_divider"),
            margin=PDF_PAGE_H - PDF_BODY_BOTTOM,
        )
        self._pending = (ptype, bg, heading_num, heading_text)
        self.add_page()
        self._pending = None
        return self.page_no()

    def _resolve_page(self, pn: int) -> Tuple[str, str, str, str, bool]:
        """Return ``(ptype, bg, num, title, is_continuation)`` for page *pn*,
        consuming a pending declaration or inheriting the previous page."""
        if pn not in self._page_types:
            if self._pending is not None:
                ptype, bg, num, title = self._pending
                self._page_types[pn] = ptype
                self._page_bg[pn] = bg
                self._page_heads[pn] = (num, title, False)
            else:
                # Auto page break / element overflow — inherit and mark cont.
                prev = self._page_heads.get(pn - 1, ("", "", False))
                self._page_types[pn] = self._page_types.get(pn - 1, "content")
                if self._page_types[pn] in ("cover", "toc", "section_divider"):
                    self._page_types[pn] = "content"
                self._page_bg[pn] = "light"
                self._page_heads[pn] = (prev[0], prev[1], True)
        num, title, cont = self._page_heads.get(pn, ("", "", False))
        return (self._page_types[pn], self._page_bg[pn], num, title, cont)

    # ==================================================================
    #  Header / Footer  (fpdf2 overrides)
    # ==================================================================

    def header(self):
        """Paint the page frame: full-bleed background plus — on content
        pages — the locked header band (folio kicker, one-line title,
        hairline rule). Cover, ToC and section dividers get their background
        here and draw their own display type in the builder."""
        pn = self.page_no()
        ptype, bg, num, title, cont = self._resolve_page(pn)

        # --- Full-bleed background (every page, one place) ----------------
        if ptype == "cover":
            base = PDF_CASTLETON_GREEN if bg == "dark" else PDF_SEA_SALT
        elif ptype == "section_divider":
            base = PDF_DARK_SERPENT if bg == "dark" else PDF_SEA_SALT
        else:
            base = PDF_SEA_SALT
        self.set_fill_color(*base)
        self.rect(0, 0, PDF_PAGE_W, PDF_PAGE_H, "F")

        if ptype in ("cover", "section_divider"):
            return

        # --- Top hairline (shared by ToC and content pages) ---------------
        self.set_fill_color(*PDF_CASTLETON_GREEN)
        self.rect(0, 0, PDF_PAGE_W, 1.2, "F")

        if ptype == "toc":
            kicker, heading = "", "Contents"
        else:
            kicker = num
            heading = f"{title} (cont.)" if cont and title else title

        # --- Folio kicker — full number, never a bare digit ---------------
        if kicker:
            self.set_xy(PDF_MARGIN_L, PDF_HEADER_KICKER_Y)
            self._pick_font("B", PDF_HEADER_NUM_SIZE)
            self.set_text_color(*PDF_CASTLETON_GREEN)
            self.cell(PDF_CONTENT_W, 5, kicker, align="L")

        # --- Locked one-line title ----------------------------------------
        # Auto-fit: shrink, then ellipsis. A title never wraps and never
        # runs past the content width, whatever the caller passes in.
        if heading:
            fitted, pt = self._fit_text(
                heading, PDF_CONTENT_W - PDF_LOGO_W, PDF_HEADER_TITLE_SIZE, "B",
                min_size=PDF_HEADER_TITLE_MIN,
            )
            self.set_xy(PDF_MARGIN_L, PDF_HEADER_TITLE_Y)
            self._pick_font("B", pt)
            self.set_text_color(*PDF_CASTLETON_GREEN)
            self.cell(PDF_CONTENT_W, PDF_HEADER_TITLE_H, fitted, align="L")

        # --- Header hairline closing the band ------------------------------
        self.set_fill_color(*PDF_CASTLETON_GREEN)
        self.rect(PDF_MARGIN_L, PDF_HEADER_RULE_Y, PDF_CONTENT_W,
                  PDF_HEADER_RULE_H, "F")
        # Saffron tick — same accent on every content page, never elsewhere
        self.set_fill_color(*PDF_SAFFRON)
        self.rect(PDF_MARGIN_L, PDF_HEADER_RULE_Y, 24.0, PDF_HEADER_RULE_H, "F")

        self.set_xy(PDF_MARGIN_L, PDF_BODY_TOP)

    def footer(self):
        """Footer band — page numbering and the logo, nothing else.

        Layout is fixed: **left slot empty, ``Page X of Y`` centred,
        Lifewood logo bottom-right.** No document title, product name, quote
        or description goes in the footer; a page's identity is carried by
        its header band, not by repeating the deliverable's name 40 times.

        The hairline divider sits directly above the footer band so it reads
        as the boundary of that band rather than a rule floating in the page.

        Cover pages get none of this chrome: no divider, no folio, and **no
        bottom-right logo** — the cover carries exactly one logo, the hero
        mark drawn by :meth:`add_cover`.
        """
        if getattr(self, "_lw_final_footer_done", False):
            return  # duplicate final-page render suppressed (see output())
        pn = self.page_no()
        ptype = self._page_types.get(pn, "content")

        # --- Footer divider (content pages + Contents; never the cover) ---
        # The ToC is an interior page: it carries the divider + logo (but no
        # page number). Cover and section dividers are display pages — no
        # chrome (§21.3).
        if ptype not in ("cover", "section_divider"):
            self.set_fill_color(*PDF_CASTLETON_GREEN)
            self.rect(PDF_MARGIN_L, PDF_FOOTER_RULE_Y,
                      PDF_CONTENT_W, PDF_FOOTER_RULE_H, "F")

        # --- Page number (content pages only; cover & TOC unnumbered) ------
        if ptype not in ("cover", "toc"):
            self.set_xy(0, PDF_FOOTER_Y + 5.5)
            self._pick_font("B", PDF_FOLIO_SIZE)
            # Folio flips to Paper on dark surfaces (section dividers) so it
            # is never a dark-on-dark ghost.
            on_dark = self._page_bg.get(pn, "light") == "dark"
            self.set_text_color(*(PDF_PAPER if on_dark else PDF_CASTLETON_GREEN))
            self.cell(PDF_PAGE_W, 6,
                      f"Page {self._folio_for(pn)} of {{nb}}", align="C")

        # --- Logo (bottom-right, interior pages only) ----------------------
        # The cover is deliberately excluded: repeating the mark bottom-right
        # under the hero logo is a duplicate, not branding.
        if ptype != "cover":
            bg = self._page_bg.get(pn, "light")
            logo_path = PDF_LOGO_DARK if bg == "dark" else PDF_LOGO_LIGHT
            if Path(logo_path).is_file():
                logo_x = PDF_PAGE_W - PDF_LOGO_W - PDF_LOGO_RIGHT_CLEAR
                logo_y = PDF_FOOTER_Y + 5.5 + (6 - PDF_LOGO_H) / 2
                self.image(logo_path, logo_x, logo_y, PDF_LOGO_W, PDF_LOGO_H)

    # ==================================================================
    #  Page numbering  (starts after the ToC — single source of truth)
    # ==================================================================

    def _front_page_count(self) -> int:
        """Number of unnumbered front-matter pages (cover + ToC)."""
        return sum(
            1 for t in self._page_types.values() if t in ("cover", "toc")
        )

    def _folio_for(self, pn: int) -> int:
        """Printed folio for physical page *pn* — 1 on the first page after
        the ToC. Front matter (cover, ToC) is excluded from the count."""
        return pn - sum(
            1 for p, t in self._page_types.items()
            if p <= pn and t in ("cover", "toc")
        )

    def verify_numbering(self) -> Dict[str, Any]:
        """Self-check that page numbering obeys the Lifewood rule.

        Returns a report dict::

            {"ok": bool, "front_pages": int, "numbered_pages": int,
             "first_numbered_page": int | None, "errors": [str, ...]}

        Rules checked:
          1. Cover and ToC carry no folio.
          2. All front matter precedes every numbered page.
          3. The first page after the ToC prints ``Page 1``.
          4. The last numbered page prints ``Page N`` where N is the
             numbered-page total used by the ``{nb}`` substitution.
        """
        errors: List[str] = []
        pages = sorted(self._page_types)
        front = [p for p in pages if self._page_types[p] in ("cover", "toc")]
        numbered = [p for p in pages if self._page_types[p] not in ("cover", "toc")]

        if front and numbered and max(front) > min(numbered):
            errors.append(
                f"front matter page {max(front)} appears after numbered "
                f"page {min(numbered)} — cover/ToC must lead the document"
            )
        if numbered:
            first_folio = self._folio_for(numbered[0])
            if first_folio != 1:
                errors.append(
                    f"first content page prints 'Page {first_folio}', expected 1"
                )
            last_folio = self._folio_for(numbered[-1])
            if last_folio != len(numbered):
                errors.append(
                    f"last content page prints 'Page {last_folio}' but there "
                    f"are {len(numbered)} numbered pages"
                )
        return {
            "ok": not errors,
            "front_pages": len(front),
            "numbered_pages": len(numbered),
            "first_numbered_page": numbered[0] if numbered else None,
            "errors": errors,
        }

    # ==================================================================
    #  Drawing utilities
    # ==================================================================

    def _draw_brand_header(self):
        """Draw the thin Castleton Green bar at y=0."""
        self.set_fill_color(*PDF_CASTLETON_GREEN)
        self.rect(0, 0, PDF_PAGE_W, 1, "F")

    def _draw_saffron_rule(self, x: float, y: float, width: float, height: float = 1.5):
        """Horizontal Saffron accent line (filled rect)."""
        self.set_fill_color(*PDF_SAFFRON)
        self.rect(x, y, width, height, "F")

    def _numbered_text(self, number: str, text: str, size: float = 10):
        """Write ``number  text`` in Dark Serpent body style.

        This is the only allowed numbered-body-text idiom — never use
        bullet characters anywhere in a Lifewood document.
        """
        self._pick_font("", size)
        self.set_text_color(*PDF_DARK_SERPENT)
        self.multi_cell(0, size * 0.5, f"{number}  {text}", align="L")

    # ==================================================================
    #  Rich content element methods
    # ==================================================================

    # ==================================================================
    #  Flow guards — nothing is drawn without room for it
    # ==================================================================

    def _ensure_space(self, needed_h: float) -> None:
        """Break to a continuation page unless *needed_h* mm fit in the body
        band below the cursor. Continuation pages inherit the header/footer
        chrome, so the break is invisible to the caller."""
        if self.get_y() + needed_h > PDF_BODY_BOTTOM:
            self.add_page()
            self.set_y(PDF_BODY_TOP)

    def _band_room(self) -> float:
        """Body-band height still available below the cursor (mm)."""
        return max(PDF_BODY_BOTTOM - self.get_y(), 0.0)

    def _fit_text(self, text: str, max_w: float, size: float,
                  style: str = "", min_size: float = 0.0) -> Tuple[str, float]:
        """Fit *text* on ONE line within *max_w*.

        Shrinks up to ``min_size`` (default: 80% of *size*), then truncates
        with an ellipsis. Returns ``(text, size)``. Used for locked titles —
        they may never wrap, and they may never run past the content width.
        """
        text = (text or "").strip()
        min_size = min_size or size * 0.8
        pt = size
        while pt > min_size:
            self._pick_font(style, pt)
            if self.get_string_width(text) <= max_w:
                return text, pt
            pt -= 0.5
        self._pick_font(style, min_size)
        if self.get_string_width(text) <= max_w:
            return text, min_size
        ell = "…"
        while text and self.get_string_width(text + ell) > max_w:
            text = text[:-1]
        return text.rstrip() + ell, min_size

    def _wrap_to_width(self, line: str, max_w: float) -> List[str]:
        """Hard-wrap one code line to *max_w*, breaking mid-token when a
        token is itself too wide. Code is never allowed to run off the panel.
        """
        line = line.replace("\t", "    ")
        if not line:
            return [""]
        if self.get_string_width(line) <= max_w:
            return [line]
        out: List[str] = []
        current = ""
        for word in line.split(" "):
            candidate = f"{current} {word}" if current else word
            if self.get_string_width(candidate) <= max_w:
                current = candidate
                continue
            if current:
                out.append(current)
                current = ""
            while self.get_string_width(word) > max_w:
                cut = len(word)
                while cut > 1 and self.get_string_width(word[:cut]) > max_w:
                    cut -= 1
                out.append(word[:cut])
                word = word[cut:]
            current = word
        if current:
            out.append(current)
        return out or [""]

    def add_code_block(
        self,
        code_lines: Union[str, List[str]],
        label: str = "",
        width: Optional[float] = None,
        x: Optional[float] = None,
    ) -> float:
        """Draw a dark code panel at the current cursor position.

        Parameters
        ----------
        code_lines :
            Code content. Can be a single string (split on \\n) or a list of
            strings (one per line).
        label :
            Optional label shown above the block (e.g. ``"src/main.tsx"`` or
            ``"BASH"``).
        width :
            Panel width (default: full content width).
        x :
            Left X position (default: margin left).

        Returns
        -------
        Y position after the block.
        """
        if isinstance(code_lines, str):
            code_lines = code_lines.split("\n")
        width = max(width or PDF_CONTENT_W, 20.0)
        x = x if x is not None else self.l_margin

        line_h = 5.0      # 10pt, readable at 100% zoom
        pad_v = 3.5
        pad_h = 4.5
        text_w = width - pad_h * 2

        # ── Wrap every line to the panel — code never runs off it ──
        self._pick_font("", PDF_CODE_SIZE)
        display_lines: List[str] = []
        for raw in code_lines:
            display_lines.extend(self._wrap_to_width(str(raw), text_w))

        # Auto page-break must stay off: the panel decides its own breaks,
        # otherwise each overflowing cell() spawns a stray page.
        prev_auto = self.auto_page_break
        self.set_auto_page_break(False)
        try:
            first_chunk = True
            end_y = self.get_y()
            while display_lines:
                # Label sits above the first chunk only
                label_h = 5.0 if (label and first_chunk) else 0.0
                if self._band_room() < label_h + pad_v * 2 + line_h * 2:
                    self.add_page()
                    self.set_y(PDF_BODY_TOP)
                y_start = self.get_y()

                if label and first_chunk:
                    self._pick_font("", PDF_CAPTION_SIZE - 1)
                    self.set_text_color(*PDF_DARK_SERPENT)
                    self.set_xy(x, y_start)
                    self.cell(width, 4.5, label.upper())
                    y_start += label_h
                elif not first_chunk:
                    self._pick_font("", PDF_CAPTION_SIZE - 1)
                    self.set_text_color(*PDF_DARK_SERPENT)
                    self.set_xy(x, y_start)
                    self.cell(width, 4.5, ((label or "CODE").upper()) + " (CONT.)")
                    y_start += 5.0

                # How many lines fit in what's left of the band?
                room = PDF_BODY_BOTTOM - y_start - pad_v * 2
                capacity = max(int(room // line_h), 1)
                chunk = display_lines[:capacity]
                display_lines = display_lines[capacity:]

                block_h = len(chunk) * line_h + pad_v * 2
                self.set_fill_color(*PDF_DARK_SERPENT)
                self.rect(x, y_start, width, block_h, "F")

                self._pick_font("", PDF_CODE_SIZE)
                self.set_text_color(*PDF_PAPER)
                text_y = y_start + pad_v
                for line in chunk:
                    self.set_xy(x + pad_h, text_y)
                    self.cell(text_w, line_h, line)
                    text_y += line_h

                end_y = y_start + block_h + 2
                self.set_y(end_y)
                first_chunk = False
                if display_lines:
                    self.add_page()
                    self.set_y(PDF_BODY_TOP)
        finally:
            self.set_auto_page_break(prev_auto,
                                     margin=PDF_PAGE_H - PDF_BODY_BOTTOM)
        return end_y

    def add_callout(
        self,
        label: str,
        text: str,
        width: Optional[float] = None,
        x: Optional[float] = None,
    ) -> float:
        """Draw a callout box (Note/Warning/Prerequisite).

        #EFEAD9 fill with a 3px #FFB347 left rule. Bold label at top,
        body text below.

        Returns
        -------
        Y position after the callout.
        """
        width = max(width or PDF_CONTENT_W, 20.0)
        x = x if x is not None else self.l_margin

        body_w = width - 10  # 5mm padding each side
        label_h = 6.0
        line_h = 5.2
        pad = 4.0

        # ── Measure the real wrapped height — never estimate it ───
        # A guessed line count is how callout text ends up spilling out of
        # its own fill rect; fpdf2 can measure it exactly, so it does.
        self._pick_font("", PDF_BODY_SIZE - 1)
        wrapped = self.multi_cell(
            body_w, line_h, text,
            dry_run=True, output=MethodReturnValue.LINES, align="L",
        ) or [""]

        chunk_size = len(wrapped)
        total_h = label_h + 4 + chunk_size * line_h + pad * 2

        # Doesn't fit below the cursor? Break first. Taller than a whole
        # band? Split it across pages instead of drawing off the page.
        if total_h > self._band_room():
            if total_h <= PDF_BODY_H:
                self._ensure_space(total_h)
            else:
                per_page = max(
                    int((PDF_BODY_H - label_h - 4 - pad * 2) // line_h), 1
                )
                head = " ".join(wrapped[:per_page]).strip()
                tail = " ".join(wrapped[per_page:]).strip()
                self._ensure_space(min(total_h, PDF_BODY_H))
                self.add_callout(label, head, width=width, x=x)
                if tail:
                    self.add_page()
                    self.set_y(PDF_BODY_TOP)
                    return self.add_callout(f"{label} (cont.)", tail,
                                            width=width, x=x)
                return self.get_y()

        y_start = self.get_y()

        # ── Fill rect (#EFEAD9) ───────────────────────────────────
        self.set_fill_color(0xEF, 0xEA, 0xD9)
        self.rect(x, y_start, width, total_h, "F")

        # ── Saffron left rule (3px ≈ 0.8mm) ──────────────────────
        self.set_fill_color(*PDF_SAFFRON)
        self.rect(x, y_start, 0.8, total_h, "F")

        # ── Label (bold) ──────────────────────────────────────────
        self._pick_font("B", PDF_BODY_SIZE)
        self.set_text_color(*PDF_DARK_SERPENT)
        self.set_xy(x + 5, y_start + pad)
        self.cell(body_w, label_h, label)

        # ── Body text ─────────────────────────────────────────────
        prev_auto = self.auto_page_break
        self.set_auto_page_break(False)
        try:
            self.set_xy(x + 5, y_start + pad + label_h + 1)
            self._pick_font("", PDF_BODY_SIZE - 1)
            self.set_text_color(*PDF_DARK_SERPENT)
            self.multi_cell(body_w, line_h, text, align="L")
        finally:
            self.set_auto_page_break(prev_auto,
                                     margin=PDF_PAGE_H - PDF_BODY_BOTTOM)

        # Move cursor below
        end_y = y_start + total_h + 2
        self.set_y(end_y)
        return end_y

    def add_table(
        self,
        headers: List[str],
        rows: List[List[str]],
        col_widths: Optional[List[float]] = None,
        width: Optional[float] = None,
        x: Optional[float] = None,
    ) -> float:
        """Draw a Lifewood-branded table.

        Header row filled #EFEAD9, 600-weight #133020 text, 0.5pt
        #E8E5DF rules (horizontal only — no vertical borders).
        Body rows in 9-10pt Dark Serpent.

        Parameters
        ----------
        headers :
            Column header strings.
        rows :
            Data rows, each a list of strings matching header count.
        col_widths :
            Column widths in mm (default: evenly distributed).
        width :
            Table width (default: full content width).
        x :
            Left X position (default: margin left).

        Returns
        -------
        Y position after the table.
        """
        width = width or PDF_CONTENT_W
        x = x if x is not None else self.l_margin
        y_start = self.get_y()

        n_cols = len(headers)
        if n_cols == 0:
            return y_start

        col_widths = col_widths or [width / n_cols] * n_cols
        total_w = sum(col_widths)
        # If total doesn't match width, scale
        if abs(total_w - width) > 0.1:
            scale = width / total_w
            col_widths = [cw * scale for cw in col_widths]

        cell_h = 6.0
        line_h = 5.4
        pad = 3.0  # horizontal inset so wrapped text never touches a hairline
        row_pad = 2.5  # vertical breathing room — tables must not feel cramped
        rule_color = (0xE8, 0xE5, 0xDF)

        def _wrapped(text, cw, style=""):
            self._pick_font(style, PDF_TABLE_SIZE)
            lines = self.multi_cell(
                max(cw - pad, 5), line_h, str(text),
                dry_run=True, output=MethodReturnValue.LINES, align="L",
            )
            return lines or [""]

        def _draw_header(cy_in):
            hdr_lines = [_wrapped(h, col_widths[i], "B") for i, h in enumerate(headers)]
            n_lines = max(len(ls) for ls in hdr_lines)
            row_h = line_h * n_lines + row_pad
            cx = x
            self.set_draw_color(*rule_color)
            self.set_line_width(0.3)
            for i, hdr in enumerate(headers):
                cw = col_widths[i]
                self.set_fill_color(0xEF, 0xEA, 0xD9)
                self.rect(cx, cy_in, cw, row_h, "F")
                self.set_xy(cx + pad / 2, cy_in + row_pad / 2)
                self._pick_font("B", PDF_TABLE_SIZE)
                self.set_text_color(*PDF_DARK_SERPENT)
                self.multi_cell(cw - pad, line_h, hdr, border=0, align="L")
                cx += cw
            self.set_draw_color(*rule_color)
            self.line(x, cy_in + row_h, x + width, cy_in + row_h)
            return cy_in + row_h

        # ── Header row ────────────────────────────────────────────
        cy = _draw_header(y_start)

        # ── Body rows ─────────────────────────────────────────────
        for row_idx, row in enumerate(rows):
            row_lines = [_wrapped(val, col_widths[i]) for i, val in enumerate(row)]
            n_lines = max(len(ls) for ls in row_lines)
            row_h = line_h * n_lines + row_pad

            # Check if we need a page break before drawing this row
            if cy + row_h > PDF_BODY_BOTTOM:
                self.add_page()  # chrome (header band + footer) inherited
                cy = _draw_header(PDF_BODY_TOP)

            cx = x
            for i, val in enumerate(row):
                cw = col_widths[i]
                self.set_xy(cx + pad / 2, cy + row_pad / 2)
                self._pick_font("", PDF_TABLE_SIZE)
                self.set_text_color(*PDF_DARK_SERPENT)
                self.multi_cell(cw - pad, line_h, str(val), border=0, align="L")
                cx += cw
            self.set_draw_color(*rule_color)
            self.line(x, cy + row_h, x + width, cy + row_h)
            cy += row_h

        end_y = cy + 2
        self.set_y(end_y)
        return end_y

    def add_numbered_steps(
        self,
        steps: List[str],
        start: int = 1,
        width: Optional[float] = None,
        x: Optional[float] = None,
    ) -> float:
        """Draw a numbered step list.

        Each step on its own line with ``N.  `` prefix. Defaults to the
        readable measure (never the full 16:9 page width).
        Returns y after last step.
        """
        width = width or PDF_MEASURE_W
        x = x if x is not None else self.l_margin
        self._pick_font("", PDF_BODY_SIZE)
        self.set_text_color(*PDF_DARK_SERPENT)

        for idx, step in enumerate(steps, start=start):
            self.set_x(x)
            label = f"{idx}.  {step}"
            self.multi_cell(width, 6.2, label, align="L")
            self.set_x(x)
            self.ln(2.0)
        return self.get_y()

    def add_body_paragraph(self, text: str, size: float = PDF_BODY_SIZE,
                           width: Optional[float] = None,
                           x: Optional[float] = None) -> float:
        """Write a single body paragraph at the current position.

        Wraps to ``PDF_MEASURE_W`` by default — a paragraph set across the
        full 16:9 page width is unreadable, so the measure is capped.

        Returns y after paragraph.
        """
        width = width or PDF_MEASURE_W
        x = x if x is not None else self.l_margin
        self._pick_font("", size)
        self.set_text_color(*PDF_DARK_SERPENT)
        self.set_x(x)
        self.multi_cell(width, size * 0.55, text, align="L")
        self.set_x(x)
        self.ln(1)
        return self.get_y()

    def add_svg(self, path: str, label: str = "",
                max_w: Optional[float] = None, max_h: float = 70.0) -> float:
        """Rasterise an SVG diagram and embed it centred at the cursor.

        Diagrams make pages read as designed artefacts instead of text dumps
        (skill §26). The SVG is rasterised via PyMuPDF at 200 dpi (with
        alpha), then placed centred at up to *max_w* wide (default: full
        content width) and *max_h* tall (default 70 mm — about half the
        body band). A caption label renders above the diagram when given.

        Returns y after the diagram.
        """
        if fitz is None:
            return self.get_y()
        max_w = max_w or PDF_CONTENT_W
        svg = fitz.open(path)
        try:
            page = svg[0]
            rect = page.rect
            aspect = rect.width / rect.height
            if not (aspect > 0):
                aspect = 3.0
            w = min(max_w, max_h * aspect)
            h = w / aspect
            pix = page.get_pixmap(dpi=200, alpha=True)
            png = io.BytesIO(pix.tobytes("png"))
        finally:
            svg.close()

        x = self.l_margin + (PDF_CONTENT_W - w) / 2
        if label:
            self._pick_font("", PDF_CAPTION_SIZE - 1)
            self.set_text_color(*PDF_DARK_SERPENT)
            self.set_xy(x, self.get_y())
            self.cell(w, 4.5, label.upper())
            self.ln(5.0)
        self.image(png, x, self.get_y(), w, h)
        self.set_y(self.get_y() + h + 3)
        return self.get_y()

    # ==================================================================
    #  Mixed-content page  (heading + arbitrary element sequence)
    # ==================================================================

    def add_mixed_content_page(
        self,
        heading_num: str,
        heading_text: str,
        elements: List[Element],
        page_rhythm: str = "normal",
        design_variant: str = "swiss",
    ) -> int:
        """A content page mixing body text, code blocks, tables, callouts,
        and numbered steps — all on one continuous-flow page.

        *elements* is a list of element tuples:

        - ``("body", "text")`` — body paragraph
        - ``("code", "code\\ntext", "label")`` — code block with label
        - ``("table", ["H1","H2"], [["a","b"], ...])`` — branded table
        - ``("callout", "Warning", "text")`` — callout box
        - ``("steps", ["Step 1", "Step 2"])`` — numbered steps
        - ``("blank",)`` — blank line
        - ``("spacer", 5.0)`` — explicit vertical space in mm

        Page density is estimated from element count to choose between
        normal and dense spacing.

        Returns the 1-indexed page number.
        """
        pn = self._open_page("content", "light", heading_num, heading_text)

        # ── Measure + vertically center sparse content (skill §7) ──
        # est is a pre-measure for the centering decision ONLY. It must be
        # honest: an undercount pushes a near-full section down, then the
        # 18 mm page-break headroom guard forces a stray continuation page.
        # Per-element estimates mirror the real renderers (incl. their ln()
        # gaps and paddings); a 1.15 safety factor keeps the decision on the
        # safe side of the guard.
        est = 0.0
        self._pick_font("", PDF_BODY_SIZE)
        for elem in elements:
            if not elem:
                continue
            t = elem[0]
            if t == "body":
                est += self._para_height(str(elem[1]), PDF_MEASURE_W, 6.2) + 2
            elif t == "code":
                est += max(len(str(elem[1]).split("\n")), 1) * 5.0 + 12.0
            elif t == "callout":
                est += 34.0
            elif t == "table":
                est += (len(elem[2]) if len(elem) > 2 else 0) * 7.9 + 10.0
            elif t == "steps":
                est += len(elem[1]) * 8.2
            elif t == "svg":
                est += (float(elem[3]) if len(elem) > 3 else 70.0) + (4.0 if len(elem) > 2 and elem[2] else 0)
            elif t == "blank":
                est += 3.0
            elif t == "spacer":
                est += float(elem[1])
        est *= 1.15
        if est < PDF_BODY_H * 0.7:
            self.set_y(PDF_BODY_TOP + (PDF_BODY_H - est) / 2)
        else:
            self.set_y(PDF_BODY_TOP)

        for elem in elements:
            if not elem:
                continue
            etype = elem[0]

            # Page-break safety: keep 18 mm of body band free for the element
            # (tight — content should end close to the divider, per skill §8;
            # elements taller than that break into numbered subsections).
            if self.get_y() > PDF_BODY_BOTTOM - 18:
                self.add_page()
                self.set_y(PDF_BODY_TOP)

            if etype == "body":
                self.add_body_paragraph(str(elem[1]), size=PDF_BODY_SIZE)
                self.ln(2)

            elif etype == "code":
                code = elem[1] if len(elem) > 1 else ""
                label = str(elem[2]) if len(elem) > 2 else ""
                self.add_code_block(code, label=label)

            elif etype == "table":
                headers = list(elem[1]) if len(elem) > 1 else []
                rows = list(elem[2]) if len(elem) > 2 else []
                self.add_table(headers, rows)

            elif etype == "callout":
                lbl = str(elem[1]) if len(elem) > 1 else "Note"
                txt = str(elem[2]) if len(elem) > 2 else ""
                self.add_callout(lbl, txt)

            elif etype == "steps":
                steps = list(elem[1]) if len(elem) > 1 else []
                self.add_numbered_steps(steps)

            elif etype == "svg":
                path = str(elem[1]) if len(elem) > 1 else ""
                label = str(elem[2]) if len(elem) > 2 else ""
                max_h = float(elem[3]) if len(elem) > 3 else 70.0
                if path:
                    self.add_svg(path, label=label, max_h=max_h)

            elif etype == "blank":
                self.ln(3)

            elif etype == "spacer":
                mm = float(elem[1]) if len(elem) > 1 else 5
                self.ln(mm)

        return pn

    # ==================================================================
    #  Page builders
    # ==================================================================

    # Cover / divider composition anchors — locked, identical in both
    # variants so only the palette changes between editorial and swiss.
    COVER_RAIL_W = 6.0
    COVER_TEXT_X = PDF_MARGIN_L + 12.0
    COVER_LOGO_Y = 20.0
    COVER_LOGO_W = 55.0
    COVER_RULE_Y = 66.0
    COVER_TITLE_Y = 74.0
    COVER_META_Y = 150.0
    #: Classification baseline — bottom-left of the footer band.
    COVER_CLASS_Y = PDF_FOOTER_Y + 6.0

    def add_cover(self) -> int:
        """Cover page — one composition, two palettes.

        Left Saffron rail, hero logo top-left, Saffron rule, left-aligned
        title / subtitle, a prepared-by / date block anchored above the
        bottom edge, and the handling classification bottom-left.
        ``editorial`` renders it on Castleton Green, ``swiss`` on Sea Salt;
        the geometry is identical so covers never drift between documents.

        Front-matter order is fixed: **Prepared by → Date → Classification**.

        The cover carries **exactly one logo** — the hero mark, upper-left.
        ``footer()`` deliberately skips the bottom-right logo here, so the
        bottom-right of the cover stays available for brand geometry and
        intentional whitespace. The cover carries no page number.

        Returns the 1-indexed page number.
        """
        dark = self._vs.cover.bg_dark
        pn = self._open_page("cover", "dark" if dark else "light")

        title_color = PDF_PAPER if dark else PDF_CASTLETON_GREEN
        sub_color = PDF_SAFFRON if dark else PDF_DARK_SERPENT
        meta_color = PDF_PAPER if dark else PDF_DARK_SERPENT
        logo_asset = PDF_LOGO_DARK if dark else PDF_LOGO_LIGHT

        # ---- Left Saffron rail (full height) --------------------------
        self.set_fill_color(*PDF_SAFFRON)
        self.rect(0, 0, self.COVER_RAIL_W, PDF_PAGE_H, "F")

        # ---- Hero logo, top-left of the text column -------------------
        if Path(logo_asset).is_file():
            self.image(logo_asset, self.COVER_TEXT_X, self.COVER_LOGO_Y,
                       self.COVER_LOGO_W, self.COVER_LOGO_W / 5.5)

        # ---- Saffron rule above the title -----------------------------
        self._draw_saffron_rule(self.COVER_TEXT_X, self.COVER_RULE_Y, 70.0, 2.2)

        # ---- Title (locked y, left-aligned, 54 pt, max 2 lines) -------
        # The project title is one of the largest elements on the page and
        # must occupy a meaningful part of the canvas. The zone is bounded:
        # it may wrap to two lines, then it shrinks — never below 42 pt, and
        # never down into the metadata block.
        text_w = PDF_CONTENT_W * 0.72
        title_pt = float(PDF_COVER_TITLE_SIZE)
        title_lh = title_pt * 0.44
        title_zone_h = self.COVER_META_Y - self.COVER_TITLE_Y - 22.0
        while title_pt > float(PDF_COVER_TITLE_MIN):
            self._pick_font("B", title_pt)
            lines = self.multi_cell(
                text_w, title_lh, self.title,
                dry_run=True, output=MethodReturnValue.LINES, align="L",
            ) or [""]
            if len(lines) * title_lh <= title_zone_h and len(lines) <= 2:
                break
            title_pt -= 1.0
            title_lh = title_pt * 0.44
        self.set_xy(self.COVER_TEXT_X, self.COVER_TITLE_Y)
        self._pick_font("B", title_pt)
        self.set_text_color(*title_color)
        self.multi_cell(text_w, title_lh, self.title, align="L")

        # ---- Subtitle (one line, auto-fit, clamped above metadata) ----
        if self.subtitle:
            sub_y = min(self.get_y() + 4, self.COVER_META_Y - 14.0)
            fitted, pt = self._fit_text(
                self.subtitle, text_w, float(PDF_SUBHEADING_SIZE), "", 14.0
            )
            self.set_xy(self.COVER_TEXT_X, sub_y)
            self._pick_font("", pt)
            self.set_text_color(*sub_color)
            self.cell(text_w, 9, fitted, align="L")

        # ---- Prepared by / Date (anchored, never floating) ------------
        self.set_xy(self.COVER_TEXT_X, self.COVER_META_Y)
        self._pick_font("", PDF_CAPTION_SIZE)
        self.set_text_color(*meta_color)
        self.multi_cell(text_w, 6, "Prepared by: Lifewood PH Team", align="L")
        self.set_x(self.COVER_TEXT_X)
        self.multi_cell(text_w, 6, f"Date: {self.date_str}", align="L")

        # ---- Classification, bottom-left ------------------------------
        # Sits in the footer band on the cover's own text axis.
        if self.classification:
            self.set_xy(self.COVER_TEXT_X, self.COVER_CLASS_Y)
            self._pick_font("B", PDF_CLASSIFICATION_SIZE)
            self.set_text_color(*(PDF_PAPER if dark else PDF_DARK_SERPENT))
            self.cell(text_w, 5, self.classification.upper(), align="L")

        # ---- Bottom-right brand mark ----------------------------------
        # Three stepped bars echoing the left rail — geometry for balance.
        self._draw_cover_mark(dark)

        return pn

    #: Bottom-right cover mark — (y_mm, width_mm) per bar, right-anchored.
    COVER_MARK_BARS = ((146.0, 78.0), (154.0, 52.0), (162.0, 26.0))
    COVER_MARK_H = 2.4

    def _draw_cover_mark(self, dark: bool) -> None:
        """Abstract brand geometry in the cover's bottom-right corner.

        The cover carries exactly one logo (the hero mark, upper-left), so
        this corner holds a geometric composition instead of a repeated
        wordmark. Right-anchored to the content margin, sitting clear of the
        metadata column and above the footer band.
        """
        tail = PDF_PAPER if dark else PDF_CASTLETON_GREEN
        colors = (PDF_SAFFRON, PDF_EARTH_YELLOW, tail)
        right_edge = PDF_PAGE_W - PDF_MARGIN_R
        for (y, w), color in zip(self.COVER_MARK_BARS, colors):
            self.set_fill_color(*color)
            self.rect(right_edge - w, y, w, self.COVER_MARK_H, "F")

    def add_toc(self, items: List[str], page_map: Optional[Dict[str, int]] = None) -> int:
        """Table of contents page with dot leaders + right-aligned page numbers.

        *items* should be strings like ``"1.0  Title"``, ``"2.0  Title"``.
        When *page_map* is provided (dict mapping section number to page), each
        entry shows the target page with dot leaders.

        Sub-entries (e.g. ``1.1``, ``1.2``) are indented one level.

        The Contents page uses the asymmetric grid from the design system:
        entries own the left 60% of the content width, the *How to use this
        document* block the right 33%, top-aligned with the list. Entries
        never spill into the supporting column — a list that outgrows its
        column continues on a second (still unnumbered) front-matter page.

        Returns the 1-indexed page number.
        """
        pn = self._open_page("toc", "light")

        # Header band ("Contents" + hairline) is painted by header() — the
        # ToC uses exactly the same band as every content page.
        # Asymmetric Contents grid: entries own the left 60% of the content
        # width, the supporting block the right 33%. Entries never spill into
        # the supporting column — a Contents page that outgrows its column
        # continues on a second front-matter page instead.
        # --- Compression loop: shrink until items fit or we hit floor ----
        # Multiple levels of tightening. Font shrinks at tightest levels.
        # If two-column still overflows, drop to single-column (full width)
        # as the final fallback — the ToC MUST fit on one page.
        row_h, row_gap = 7.0, 1.5
        row_pt = 12.0
        col_w = PDF_TOC_COL_W
        single_col = False
        rows_per_col = max(
            1, int((PDF_BODY_BOTTOM - PDF_BODY_TOP) / (row_h + row_gap))
        )

        overflow: List[str] = []
        if len(items) > rows_per_col:
            row_h, row_gap = 5.6, 1.2
            rows_per_col = max(
                1, int((PDF_BODY_BOTTOM - PDF_BODY_TOP) / (row_h + row_gap))
            )
        if len(items) > rows_per_col:
            row_h, row_gap = 4.8, 0.8
            row_pt = 10.0
            rows_per_col = max(
                1, int((PDF_BODY_BOTTOM - PDF_BODY_TOP) / (row_h + row_gap))
            )
        if len(items) > rows_per_col:
            row_h, row_gap = 4.0, 0.5
            row_pt = 9.0
            rows_per_col = max(
                1, int((PDF_BODY_BOTTOM - PDF_BODY_TOP) / (row_h + row_gap))
            )
        if len(items) > rows_per_col:
            # Drop howto column, use full width for entries.
            single_col = True
            col_w = PDF_CONTENT_W
            row_h, row_gap = 3.5, 0.3
            row_pt = 8.0
            rows_per_col = max(
                1, int((PDF_BODY_BOTTOM - PDF_BODY_TOP) / (row_h + row_gap))
            )
        if len(items) > rows_per_col:
            overflow = list(items[rows_per_col:])
            items = list(items[:rows_per_col])

        # Sparse ToC: center the composition vertically instead of leaving
        # a void above the footer divider (skill §7/§18).
        used_h = len(items) * (row_h + row_gap)
        col_top = PDF_BODY_TOP
        if used_h < PDF_BODY_H * 0.7:
            col_top = PDF_BODY_TOP + (PDF_BODY_H - used_h) / 2

        col_x = PDF_MARGIN_L
        self.set_text_color(*PDF_DARK_SERPENT)
        self.set_xy(col_x, col_top)

        for item in items:
            # Detect sub-entries: "1.1", "2.3" etc.
            is_sub = False
            parts = item.strip().split(None, 1)
            if parts:
                num_part = parts[0]
                # Check if it has a second decimal (X.Y)
                if num_part.count(".") >= 1 and len(num_part.split(".")) >= 2:
                    try:
                        sub_num = int(num_part.split(".")[1])
                        if sub_num > 0:
                            is_sub = True
                    except ValueError:
                        pass

            indent = 6 if is_sub else 0
            label_width = col_w - indent

            # Extract section number (e.g., "1.0") for page lookup
            section_key = parts[0] if parts else ""
            page_str = ""
            if page_map and section_key in page_map:
                page_str = str(page_map[section_key])

            y = self.get_y()
            self.set_xy(col_x + indent, y)
            # Top-level entries carry the folio weight; sub-entries stay light
            self._pick_font("B" if not is_sub else "",
                            row_pt if not is_sub else row_pt - 1)
            self.set_text_color(*(PDF_CASTLETON_GREEN if not is_sub
                                  else PDF_DARK_SERPENT))

            if page_str:
                title_text = item.strip()
                text_w = self.get_string_width(title_text)
                dots_w = label_width - text_w - self.get_string_width(page_str) - 2
                if dots_w > 5:
                    dots = "." * max(int(dots_w / self.get_string_width(".")), 1)
                    full_line = f"{title_text} {dots} {page_str}"
                else:
                    full_line = f"{title_text}  {page_str}"
                self.cell(label_width, row_h, full_line)
            else:
                self.cell(label_width, row_h, item.strip())
            self.set_xy(col_x, y + row_h + row_gap)

        # ---- How to use this document (supporting column) ---------------
        # Skipped in single-column mode (ultra-dense ToC) where full width
        # is needed for entries.
        if not single_col:
            howto_x = PDF_MARGIN_L + PDF_TOC_SIDE_X_OFFSET
            howto_w = PDF_TOC_SIDE_W
            howto_y = col_top
            if howto_y < PDF_BODY_BOTTOM - 30:
                self._draw_saffron_rule(howto_x, howto_y, 40, 1)
                self.set_xy(howto_x, howto_y + 4)
                self._pick_font("B", PDF_SUBHEADING_SIZE - 2)
                self.set_text_color(*PDF_CASTLETON_GREEN)
                self.cell(howto_w, 8, "How to use this document")
                self.set_xy(howto_x, howto_y + 15)
                self._pick_font("", PDF_BODY_SIZE - 1)
                self.set_text_color(*PDF_DARK_SERPENT)
                howto_by_audience = {
                    "user": (
                        "Audience: End users of this platform — team members and "
                        "stakeholders who view dashboards day to day. No coding or "
                        "database knowledge required."
                    ),
                    "admin": (
                        "Audience: Administrators managing accounts, configuration, "
                        "and environment settings for this platform."
                    ),
                    "workflow": (
                        "Audience: Developers and contributors who build, extend, or "
                        "deploy this platform. Assumes working knowledge of the "
                        "listed technologies but no prior familiarity with this "
                        "specific codebase."
                    ),
                    "developer": (
                        "Audience: Developers joining the team who need to ship a "
                        "change in their first week. Assumes working knowledge of "
                        "the listed technologies but no familiarity with this "
                        "specific codebase."
                    ),
                }
                howto = howto_by_audience.get(self.audience, (
                    "Audience: Readers of this document who need practical, "
                    "step-by-step guidance rather than background theory."
                ))
                self.multi_cell(howto_w, 5.4, howto, align="L")
                self.ln(3)
                self.set_x(howto_x)
                conventions = (
                    "Conventions: monospace text = literal commands or code you type; "
                    "\u2039angle brackets\u203a = replace with your value; "
                    "callout boxes highlight warnings or prerequisites."
                )
                self.multi_cell(howto_w, 5.4, conventions, align="L")

        if overflow:
            # Continuation ToC page — still front matter, still unnumbered.
            self.add_toc(overflow, page_map=page_map)

        return pn

    def add_section_divider(self, section_num: str, section_title: str) -> int:
        """Section divider — renders as a normal content page.

        The section number appears as the header kicker and the title as the
        page title, using the same chrome as every content page. No dark
        background, no oversized display type, no Saffron rail.

        Returns the 1-indexed page number.
        """
        return self.add_content_page(
            section_num, section_title,
            body_lines=[],
            page_rhythm="normal",
            fill_page=False,
        )

    def _calc_body_layout(self, body_lines: List[str], content_w: float,
                           available_h: float, base_h: float,
                           rhythm: str) -> Tuple[float, float]:
        """Measure wrapped line counts and compute (line_h, paragraph_gap)
        to distribute body content across the available band without
        breaking readable leading. Line height stays fixed at ``base_h`` —
        only the gap between paragraphs grows to fill available space. Short
        content gets generous paragraph spacing; long content stays tight and
        readable rather than acquiring oversized internal line leading.
        """
        line_h = base_h
        n_paras = len(body_lines)
        if n_paras == 0:
            return line_h, 0.0

        total_lines = 0
        for text in body_lines:
            wrapped = self.multi_cell(
                content_w, line_h, text,
                dry_run=True, output=MethodReturnValue.LINES, align="L",
            )
            total_lines += max(len(wrapped or []), 1)

        gap_bounds = {"dense": (0.5, 4.0), "normal": (1.5, 9.0),
                      "breathing": (2.5, 14.0)}.get(rhythm, (1.5, 9.0))
        min_gap, max_gap = gap_bounds

        if n_paras <= 1:
            return line_h, 0.0

        remaining = available_h - (total_lines * line_h)
        gap = remaining / (n_paras - 1)
        gap = max(min_gap, min(max_gap, gap))
        return line_h, gap

    def _para_height(self, text: str, col_w: float, line_h: float) -> float:
        """Measured height (mm) of *text* wrapped to *col_w*."""
        wrapped = self.multi_cell(
            col_w, line_h, text,
            dry_run=True, output=MethodReturnValue.LINES, align="L",
        )
        return max(len(wrapped or []), 1) * line_h

    def _flow_columns(self, body_lines: List[str], line_h: float, gap: float,
                      body_font_pt: float, cols: int = 2) -> None:
        """Render *body_lines* down a two-column grid inside the body band.

        A 16:9 page is far too wide for one text measure, so body copy runs
        in columns of ``PDF_COL_W``. When the content fits on one page the
        columns are balanced; when it overflows, paragraphs greedily fill
        column 1, then column 2, then a continuation page (which inherits
        the header/footer chrome automatically).
        """
        if not body_lines:
            return

        self._pick_font("", body_font_pt)
        self.set_text_color(*PDF_DARK_SERPENT)

        heights = [self._para_height(t, PDF_COL_W, line_h) for t in body_lines]
        total = sum(heights) + gap * max(len(heights) - 1, 0)

        # --- Compress to fit: shrink line_h and gap until content fits in
        #     2 columns — no continuation pages (skill §14).
        min_line_h = 4.0
        while total > PDF_BODY_H * cols and line_h > min_line_h:
            line_h = max(line_h - 0.3, min_line_h)
            gap = max(gap * 0.8, 0.3)
            heights = [
                max(
                    len(
                        self.multi_cell(
                            PDF_COL_W, line_h, t,
                            dry_run=True, output=MethodReturnValue.LINES,
                            align="L",
                        )
                        or [""]
                    ),
                    1,
                )
                * line_h
                for t in body_lines
            ]
            total = sum(heights) + gap * max(len(heights) - 1, 0)

        # Sparse content: vertically center one readable column instead of
        # leaving a void above the footer divider (skill §7/§18).
        if total <= PDF_BODY_H * 0.7:
            cx = PDF_MARGIN_L + (PDF_CONTENT_W - PDF_MEASURE_W) / 2
            cy = PDF_BODY_TOP + (PDF_BODY_H - total) / 2
            self.set_xy(cx, cy)
            self._pick_font("", body_font_pt)
            self.set_text_color(*PDF_DARK_SERPENT)
            for text in body_lines:
                self.set_x(cx)
                self.multi_cell(PDF_MEASURE_W, line_h, text, align="L")
                self.set_xy(cx, self.get_y() + gap)
            return

        # Balanced split when everything fits on this page.
        balance_at = None
        if total <= PDF_BODY_H * cols:
            half, run = total / cols, 0.0
            for i, h in enumerate(heights):
                run += h + gap
                if run >= half:
                    balance_at = min(i + 1, len(heights) - 1) or 1
                    break

        col = 0
        x = PDF_MARGIN_L
        self.set_xy(x, PDF_BODY_TOP)

        for i, text in enumerate(body_lines):
            need = heights[i]
            wrap = (balance_at is not None and i == balance_at) or (
                balance_at is None and self.get_y() + need > PDF_BODY_BOTTOM
            )
            if wrap and i > 0:
                col += 1
                if col >= cols:
                    # No continuation pages (skill §14). Content that does
                    # not fit after compression is the caller's responsibility
                    # — split into multiple topics in the build script.
                    break
                x = PDF_MARGIN_L + col * (PDF_COL_W + PDF_COL_GAP)
                self.set_xy(x, PDF_BODY_TOP)
                self._pick_font("", body_font_pt)
                self.set_text_color(*PDF_DARK_SERPENT)

            self.set_x(x)
            self.multi_cell(PDF_COL_W, line_h, text, align="L")
            self.set_xy(x, self.get_y() + gap)

    def add_content_page(
        self,
        heading_num: str,
        heading_text: str,
        body_lines: List[str],
        page_rhythm: str = "normal",
        fill_page: bool = True,
    ) -> int:
        """Standard content page with heading block and body paragraphs.

        Parameters
        ----------
        heading_num :
            Section number, e.g. ``"1.0"``, ``"2.1"``.
        heading_text :
            Heading label, e.g. ``"Introduction"``.
        body_lines :
            Paragraph strings (never bullet points — use numbered
            hierarchy or plain text only).
        page_rhythm :
            ``"normal"`` (default), ``"dense"`` (tighter spacing), or
            ``"breathing"`` (more whitespace).
        fill_page :
            If True (default), auto-calculate paragraph spacing so the body
            fills the two-column band instead of stacking at the top.

        Returns the 1-indexed page number.
        """
        pn = self._open_page("content", "light", heading_num, heading_text)

        body_font_pt = self._vs.content.body_font_size_pt or PDF_BODY_SIZE
        base_line_h = {"dense": 5.4, "breathing": 7.4, "normal": 6.2}.get(
            page_rhythm, 6.2
        )
        self._pick_font("", body_font_pt)
        self.set_text_color(*PDF_DARK_SERPENT)

        if fill_page and body_lines:
            # Two columns of the body band are available before overflow.
            line_h, gap = self._calc_body_layout(
                body_lines, PDF_COL_W, PDF_BODY_H * 2, base_line_h, page_rhythm
            )
        else:
            line_h = base_line_h
            gap = {"dense": 0.5, "breathing": 2.5, "normal": 1.2}.get(
                page_rhythm, 1.2
            )

        self._flow_columns(body_lines, line_h, gap, body_font_pt)
        return pn

    def add_two_column(
        self,
        heading_num: str,
        heading_text: str,
        left_heading: str,
        left_items: List[str],
        right_heading: str,
        right_items: List[str],
    ) -> int:
        """Two-column comparison layout.

        Each column has its own sub-heading followed by a list of items.
        A thin vertical rule separates the columns.

        Returns the 1-indexed page number.
        """
        pn = self._open_page("two_column", "light", heading_num, heading_text)

        # Header band + background come from header(); the comparison sits
        # on the same two-column grid as ordinary body copy.
        x_left = PDF_MARGIN_L
        x_right = PDF_MARGIN_L + PDF_COL_W + PDF_COL_GAP
        col_top = PDF_BODY_TOP
        body_pt = self._vs.content.body_font_size_pt or PDF_BODY_SIZE

        def _column(x: float, col_heading: str, items: List[str]) -> Tuple[float, List[str]]:
            """Draw a column, clamped to the body band. Returns the end y and
            any items that did not fit (for the continuation page)."""
            self.set_xy(x, col_top)
            self.set_text_color(*PDF_CASTLETON_GREEN)
            fitted, pt = self._fit_text(
                col_heading, PDF_COL_W, float(PDF_SUBHEADING_SIZE), "B", 16.0
            )
            self._pick_font("B", pt)
            self.cell(PDF_COL_W, 9, fitted)
            self._draw_saffron_rule(x, col_top + 10.5, 20.0, 0.8)
            self.set_xy(x, col_top + 15)
            self._pick_font("", body_pt)
            self.set_text_color(*PDF_DARK_SERPENT)
            overflow: List[str] = []
            for i, item in enumerate(items):
                need = self._para_height(item, PDF_COL_W, 5.5)
                if self.get_y() + need > PDF_BODY_BOTTOM:
                    overflow = list(items[i:])
                    break
                self.set_x(x)
                self.multi_cell(PDF_COL_W, 5.5, item, align="L")
                self.set_x(x)
                self.ln(1.0)
            return self.get_y(), overflow

        # Auto-break stays off: an overlong column spills to an explicit
        # continuation page with both headings repeated, never to a stray
        # half-drawn page mid-comparison.
        prev_auto = self.auto_page_break
        self.set_auto_page_break(False)
        try:
            y_left_end, left_rest = _column(x_left, left_heading, left_items)
            y_right_end, right_rest = _column(x_right, right_heading, right_items)

            # ---- Vertical hairline between columns ---------------------
            rule_x = PDF_MARGIN_L + PDF_COL_W + PDF_COL_GAP / 2
            rule_y_bottom = min(max(y_left_end, y_right_end), PDF_BODY_BOTTOM)
            self.set_draw_color(*PDF_DARK_SERPENT)
            self.set_line_width(0.3)
            self.line(rule_x, col_top, rule_x, rule_y_bottom)
        finally:
            self.set_auto_page_break(prev_auto,
                                     margin=PDF_PAGE_H - PDF_BODY_BOTTOM)

        if left_rest or right_rest:
            self.add_two_column(
                heading_num, heading_text,
                left_heading, left_rest, right_heading, right_rest,
            )

        return pn

    # ==================================================================
    #  Layout audit (post-render, reads the actual PDF)
    # ==================================================================

    @staticmethod
    def audit_layout(path: str, tolerance_mm: float = 1.5) -> Dict[str, Any]:
        """Read a rendered PDF back and report anything outside the safe area.

        Catches the failure modes a builder cannot see from the inside:
        text past the right/left margin, body copy sitting on the footer
        chrome, content above the header rule, and pages that are not the
        16:9 slide canvas.

        Requires PyMuPDF. Returns::

            {"ok": bool, "pages": int, "violations": [
                {"page": int, "kind": str, "text": str, ...}, ...]}

        Front-matter pages (cover, ToC) are audited for margins only — they
        legitimately place display type outside the content band.
        """
        try:
            import fitz  # PyMuPDF
        except ImportError as exc:  # pragma: no cover - environment guard
            raise RuntimeError(
                "audit_layout() needs PyMuPDF (pip install pymupdf)"
            ) from exc

        mm = 72.0 / 25.4
        violations: List[Dict[str, Any]] = []
        doc = fitz.open(path)
        try:
            for i, page in enumerate(doc, start=1):
                w_mm = page.rect.width / mm
                h_mm = page.rect.height / mm
                if (abs(w_mm - PDF_PAGE_W) > 0.5
                        or abs(h_mm - PDF_PAGE_H) > 0.5):
                    violations.append({
                        "page": i, "kind": "page_size",
                        "text": f"{w_mm:.1f}x{h_mm:.1f} mm",
                    })

                text = page.get_text()
                is_front = "Page " not in text  # cover / ToC carry no folio

                for block in page.get_text("blocks"):
                    x0, y0, x1, y1, raw = block[:5]
                    label = (raw or "").strip().replace("\n", " ")[:60]
                    if not label:
                        continue
                    x0, y0, x1, y1 = (v / mm for v in (x0, y0, x1, y1))

                    if x1 > PDF_PAGE_W - PDF_MARGIN_R + tolerance_mm:
                        violations.append({"page": i, "kind": "right_margin",
                                           "text": label, "x1_mm": round(x1, 1)})
                    if x0 < PDF_MARGIN_L - tolerance_mm:
                        violations.append({"page": i, "kind": "left_margin",
                                           "text": label, "x0_mm": round(x0, 1)})
                    if is_front:
                        continue
                    if y1 > PDF_FOOTER_RULE_Y + tolerance_mm and not (
                        label.startswith("Page ")
                        or y0 > PDF_FOOTER_RULE_Y
                    ):
                        violations.append({"page": i, "kind": "footer_band",
                                           "text": label, "y1_mm": round(y1, 1)})
                    if y1 > PDF_PAGE_H - 2:
                        violations.append({"page": i, "kind": "off_page",
                                           "text": label, "y1_mm": round(y1, 1)})
            pages = len(doc)
        finally:
            doc.close()
        return {"ok": not violations, "pages": pages, "violations": violations}

    # ==================================================================
    #  Output
    # ==================================================================

    def save(self, path: str, strict: bool = True,
             audit: bool = False) -> str:
        """Write the PDF to *path* and return it.

        With ``strict=True`` (default) the numbering contract is verified
        before the file is written — a document whose folio does not restart
        at 1 after the ToC raises instead of shipping.

        With ``audit=True`` the written file is read back and checked for
        layout damage (text past a margin, body copy on the footer chrome,
        content off the page, wrong canvas). Violations raise. Silently
        skipped when PyMuPDF is not installed.
        """
        if strict:
            report = self.verify_numbering()
            if not report["ok"]:
                raise ValueError(
                    "Lifewood page-numbering contract violated: "
                    + "; ".join(report["errors"])
                )
        self.output(path)
        if audit:
            try:
                result = self.audit_layout(path)
            except RuntimeError:
                return path  # PyMuPDF absent — nothing to audit with
            if not result["ok"]:
                detail = "; ".join(
                    f"p{v['page']} {v['kind']}: {v.get('text', '')}"
                    for v in result["violations"][:6]
                )
                raise ValueError(
                    f"Lifewood layout audit failed "
                    f"({len(result['violations'])} violations): {detail}"
                )
        return path

    def output(self, name="", *args, **kwargs):
        """Build the PDF; the {nb} alias resolves to the numbered-page
        total (pages after cover + ToC), not the physical page count."""
        self._front_pages = self._front_page_count()
        if not self.buffer and self.page > 0 and hasattr(self, "_render_footer"):
            # The final page's footer is normally rendered inside fpdf2's
            # output(); render it now so its {nb} fragment exists before
            # our substitution below, then suppress the duplicate render.
            # (Private fpdf2 API — guarded so a future rename degrades to
            # "footer drawn once by fpdf2" instead of an exception.)
            self._render_footer()
            self._lw_final_footer_done = True
        try:
            total = max(len(self.pages) - getattr(self, "_front_pages", 0), 1)
            for page in self.pages.values():
                for sub in page.get_text_substitutions():
                    page.contents = page.contents.replace(
                        sub.get_placeholder_string().encode("latin-1"),
                        sub.render_text_substitution(str(total)).encode("latin-1"),
                    )
            return super().output(name=name, *args, **kwargs)
        finally:
            self._lw_final_footer_done = False
