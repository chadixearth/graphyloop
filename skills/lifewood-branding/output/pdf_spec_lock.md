# PDF Execution Lock

> Machine-readable execution contract for PDF generation.
> AI MUST read this before authoring any PDF page.
> Separate from PPT spec_lock — PDF keys use ``pdf_`` prefix.

- **Generated:** August 14, 2026
- **Audience:** developer
- **Page count:** 22

## pdf_canvas
- page_size: PowerPoint 16:9 (338.658×190.5 mm / 13.333×7.5 in)
- orientation: landscape
- aspect_ratio: 1.7777
- a4: FORBIDDEN
- margin_left: 24.0
- margin_right: 24.0
- margin_top: 13.34
- margin_bottom: 19.05
- content_width: 290.658
- content_height: 158.11
- column_width: 139.329
- column_gap: 12.0
- body_measure_cap: 197.647
- toc_col_width: 174.395
- toc_side_width: 95.917
- safe_area: 7-10% outer margins

## pdf_spacing
- s1: 2.822  # 8pt
- s2: 4.233  # 12pt
- s3: 7.056  # 20pt
- s4: 11.289  # 32pt

## pdf_colors
- background: #F9F7F7  (Sea Salt)
- secondary_bg: #FFFFFF  (White)
- primary: #046241  (Castleton Green)
- accent: #FFB347  (Saffron)
- secondary_accent: #FFC370  (Earth Yellow)
- body_text: #133020  (Dark Serpent)
- text_on_dark: #F5EEDB  (Paper)

## pdf_typography
# One scale shared with the PPTX engine — same rectangle, same points.
- font_family: Manrope
- fallback_font: Helvetica
- cover_title_size: 54   # range 42-60
- page_title_size: 32   # range 30-40
- section_heading_size: 24  # range 20-28
- subheading_size: 18  # range 16-20
- body_size: 12  # range 11-14
- table_size: 11  # range 10-13
- caption_size: 10  # range 9-11
- folio_size: 12  # range 8-10

## pdf_layout
- cover_logo_placement: upper-left (hero) ONLY
- cover_footer_logo: FORBIDDEN
- interior_logo_placement: bottom-right
- logo_width_mm: 45.72
- logo_height_mm: 8.31
- logo_right_clearance_mm: 17.78
- header_kicker_y_mm: 13.34
- header_title_y_mm: 19.5
- header_rule_y_mm: 36.0
- body_top_mm: 42.0
- body_bottom_mm: 163.95
- footer_y_mm: 171.45
- footer_rule_y_mm: 169.95
- footer_rule_h_mm: 0.5
- footer_left_slot: EMPTY  # no document title, no description
- footer_contents: centered 'Page X of Y' + bottom-right logo ONLY
- header_number_size: 12
- header_title_size: 32
- page_number_format: Page X of Y
- page_numbering_starts_after_toc: true
- cover_numbered: false
- toc_numbered: false
- cover_front_matter: Prepared by -> Date -> Classification
- cover_classification: CONFIDENTIAL — FOR INTERNAL USE ONLY
- cover_classification_placement: bottom-left (footer band, opposite the logo)
- heading_system: numbered (1.0, 1.1, 1.1.1...)
- bullet_points: FORBIDDEN

## pdf_content
- title: lifewood-branding — Developer Manual
- section: 1.0  Overview & Architecture
- section: 2.0  Prerequisites
- section: 3.0  Project Setup
- section: 4.0  Code Architecture
- section: 5.0  Component Reference
- section: 6.0  Configuration Reference
- section: 7.0  Data & Auth Flow
- section: 8.0  Extending the Platform
- section: 8.1  Modifying Components & Verification
- section: 9.0  Commands & Workflow
- section: 10.0 Troubleshooting
- section: 11.0 Glossary
