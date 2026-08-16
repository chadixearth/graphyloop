#!/usr/bin/env python3
"""Build the LifeData Analytics Hub overview deck ("what is this project,
what's its purpose") with Lifewood branding — editorial style — then
export it to PDF.

Content verified against README.md, docs/architecture.md, and the
current source tree / package.json — no invented metrics.
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.config\opencode\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_deck_builder import LifewoodDeck

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\Lifewood-Development\LifeData\LifeData\deliverables"
TITLE = "LifeData Analytics Hub"
SUBTITLE = "Platform Overview"
DATE = "July 27, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    deck = LifewoodDeck(TITLE, subtitle=SUBTITLE, date_str=DATE, variant="editorial")

    deck.add_cover()
    deck.add_toc([
        "1.0  What Is LifeData",
        "2.0  The Problem It Solves",
        "3.0  Platform at a Glance",
        "4.0  Key Capabilities",
        "5.0  Design Philosophy",
        "6.0  Tech Stack",
        "7.0  Access & Deployment",
    ])

    # 1.0 What Is LifeData
    deck.add_content("1.0", "What Is LifeData", [
        "A unified analytics hub for the Lifewood PH project ecosystem",
        "Consolidates participant data from BYU country programs and "
        "Crowdsource PH/International affiliations into one dashboard",
        "Client-side app (React 19 + Vite 7) reading live from Supabase "
        "— no manual exports, no stale spreadsheets",
        "Gives stakeholders participant counts, demographics, and "
        "trends at a glance, without needing database access",
    ])

    # 2.0 The Problem It Solves
    deck.add_two_column("2.0", "The Problem It Solves",
        "Before LifeData",
        [
            "Data scattered across per-country spreadsheets",
            "No single view across BYU + Crowdsource programs",
            "Manual work to spot enrollment trends",
            "Inconsistent affiliation naming across partners",
        ],
        "With LifeData",
        [
            "One dashboard for every country and affiliation",
            "Real-time Supabase sync — always current",
            "Built-in monthly trend charts",
            "Automatic affiliation normalization",
        ],
    )

    # 3.0 Platform at a Glance
    deck.add_stats("3.0", "Platform at a Glance", [
        ("12", "BYU Countries", "DRC, Fiji, Ghana, Kenya, Madagascar, "
         "Malawi and more"),
        ("3", "Data Hubs", "BYU, Crowdsource PH, Crowdsource International"),
        ("100%", "Live Sync", "Direct real-time Supabase connection"),
        ("0", "Install Required", "Runs in any modern browser"),
    ])

    # 4.0 Key Capabilities
    deck.add_card_grid("4.0", "Key Capabilities", [
        ("Multi-Project Intelligence",
         ["Dynamic schema mapping across regions",
          "One dashboard component adapts to every table"]),
        ("Automated Data Normalization",
         ["Merges Student ID / Student Number / Member variants",
          "Consistent naming across international partners"]),
        ("Real-Time Synchronicity",
         ["Direct Supabase integration",
          "Sub-second data updates, live monitoring"]),
        ("Trend Projection",
         ["Month-over-month growth charts",
          "Custom-themed area charts per dataset"]),
    ], grid="2x2")

    # 5.0 Design Philosophy
    deck.add_content("5.0", "Design Philosophy — \u201cFlat Card\u201d", [
        "Clean white cards with subtle borders and shadows — "
        "prioritizes readability and performance over decoration",
        "Left-border accent colors (emerald, sky, violet, amber, rose, "
        "teal) visually differentiate metric types",
        "Staggered fade-in-up entrance animations for a polished feel",
        "Dark-mode styling is implemented site-wide via the html.dark "
        "class, ready for a future toggle",
    ])

    # 6.0 Tech Stack
    deck.add_table("6.0", "Tech Stack",
        ["Layer", "Technology"],
        [["Engine", "React 19 + Vite 7"],
         ["Backend", "Supabase (PostgreSQL)"],
         ["Styling", "Tailwind CSS 4 + custom design tokens"],
         ["Charts", "Recharts 3"],
         ["Icons", "Lucide React"]],
    )

    # 7.0 Access & Deployment
    deck.add_callout("7.0", "Access & Deployment",
        "lifedata-lifewoodph.vercel.app",
        "Continuously deployed to Vercel — every push to main ships "
        "automatically. Open the URL in any modern browser to sign in.")

    deck.add_closing("Thank You", "Lifewood PH Team")

    pptx_path = os.path.join(OUTPUT_DIR, "LifeData_Overview.pptx")
    deck.save(pptx_path)
    print(f"[OK] Deck: {pptx_path}")

    pdf_path = deck.export_pdf(pptx_path)
    if pdf_path:
        print(f"[OK] PDF: {pdf_path}")
    else:
        print("[WARN] PDF export failed — pptx saved, convert manually")
    return pptx_path, pdf_path

if __name__ == "__main__":
    build()
