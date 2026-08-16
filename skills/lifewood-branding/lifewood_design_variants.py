#!/usr/bin/env python3
"""
Lifewood Design Variants — 2 visual approaches for PDF/PPT generation.

Each variant defines layout parameters that override the base design system.
All variants share: same footer system (logo bottom-right, page X of Y bottom-center),
same color palette, same typography (Manrope), same numbered heading hierarchy.

Usage:
    from lifewood_design_variants import DESIGN_VARIANTS, DesignVariant
    
    variant = DESIGN_VARIANTS["editorial"]
    # variant.header_style, variant.section_divider_style, etc.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class CoverSpec:
    """Cover page layout parameters."""
    bg_dark: bool          # Dark background (Castleton Green) or light (Sea Salt)
    title_position: str    # "center", "left", "right"
    show_accent_bar: bool
    accent_bar_side: str   # "left", "right", "top", "bottom"
    show_decorative_element: bool  # geometric shape, hexagon, etc.
    decorative_type: str   # "hexagon", "line", "dot-grid", "none"


@dataclass
class SectionDividerSpec:
    """Section divider page layout."""
    bg_dark: bool
    number_style: str  # "large-centered", "top-left", "sidebar"
    accent_position: str  # "left-bar", "top-stripe", "bottom-accent"
    show_quote: bool


@dataclass
class ContentPageSpec:
    """Content page layout."""
    header_bar: bool            # Thin colored bar at top
    header_bar_style: str       # "full", "partial", "none"
    card_style: str             # "rounded", "sharp", "none"
    card_shadow: bool
    layout_variant: str         # "single-column", "two-column", "grid"
    show_section_badge: bool    # Show section number as badge
    body_font_size_pt: int


@dataclass
class FooterSpec:
    """Footer specifications (shared across variants)."""
    logo_position: str = "bottom-right"
    page_number_position: str = "bottom-center"
    show_document_type: bool = True
    show_date: bool = True


@dataclass
class DesignVariant:
    """Complete design variant definition."""
    name: str
    description: str
    cover: CoverSpec
    section_divider: SectionDividerSpec
    content: ContentPageSpec
    footer: FooterSpec = field(default_factory=FooterSpec)
    tags: list = field(default_factory=list)


# =========================================================================
# VARIANT A — Editorial / Data-Journalism
# =========================================================================
# Magazine-inspired. Serif/sans interplay, column grids, pull quotes,
# warm feel. Best for: user manuals, long-form docs, client deliverables.
# =========================================================================

VARIANT_EDITORIAL = DesignVariant(
    name="editorial",
    description="Editorial / Data-Journalism — magazine-inspired layouts with column grids, pull quotes, "
                "warm whitespace. Serif/sans interplay for visual hierarchy. "
                "Best for: user manuals, long-form documentation, client presentations.",
    cover=CoverSpec(
        bg_dark=True,
        title_position="left",
        show_accent_bar=True,
        accent_bar_side="left",
        show_decorative_element=True,
        decorative_type="hexagon",
    ),
    section_divider=SectionDividerSpec(
        bg_dark=True,
        number_style="large-centered",
        accent_position="left-bar",
        show_quote=True,
    ),
    content=ContentPageSpec(
        header_bar=True,
        header_bar_style="partial",  # 60% width accent bar under title
        card_style="sharp",
        card_shadow=False,
        layout_variant="two-column",
        show_section_badge=True,
        body_font_size_pt=12,  # design-system body default (range 11-14)
    ),
    tags=["editorial", "magazine", "warm", "long-form", "client-facing"],
)


# =========================================================================
# VARIANT B — Swiss Minimal / Blueprint
# =========================================================================
# Precision layout. Swiss-grid discipline, sharp geometry, thin rules.
# Engineering schematics feel. Best for: architecture docs, workflows,
# technical references, internal documentation.
# =========================================================================

VARIANT_SWISS = DesignVariant(
    name="swiss",
    description="Swiss Minimal / Blueprint — Swiss-grid precision, sharp orthogonal geometry, "
                "thin hairlines, near-zero decoration. Information-dense but clean. "
                "Best for: architecture docs, workflow diagrams, technical references.",
    cover=CoverSpec(
        bg_dark=False,  # Light, clean cover
        title_position="left",
        show_accent_bar=True,
        accent_bar_side="top",  # Thin top stripe
        show_decorative_element=False,
        decorative_type="none",
    ),
    section_divider=SectionDividerSpec(
        bg_dark=False,
        number_style="sidebar",  # Number on left, title on right
        accent_position="top-stripe",
        show_quote=False,
    ),
    content=ContentPageSpec(
        header_bar=True,
        header_bar_style="full",  # Full-width thin hairline
        card_style="sharp",
        card_shadow=False,
        layout_variant="grid",  # Grid-based, high information density
        show_section_badge=True,
        body_font_size_pt=11,  # density floor of the design-system range
    ),
    tags=["swiss", "minimal", "technical", "engineering", "precise", "blueprint"],
)


# =========================================================================
# Registry
# =========================================================================

DESIGN_VARIANTS: Dict[str, DesignVariant] = {
    "editorial": VARIANT_EDITORIAL,
    "swiss": VARIANT_SWISS,
}


def get_variant(name: str) -> DesignVariant:
    """Get a design variant by name. Falls back to swiss."""
    return DESIGN_VARIANTS.get(name, VARIANT_SWISS)


def list_variants() -> list:
    """Return list of available variant names."""
    return list(DESIGN_VARIANTS.keys())
