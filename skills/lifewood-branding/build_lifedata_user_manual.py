#!/usr/bin/env python3
"""
LifeData Analytics Hub — User Manual (16:9 Lifewood-branded PDF).

Rebuild of the former A4-portrait LifeData_User_Manual.pdf (a plain-FPDF
fallback that broke the 16:9 canvas rule). Content preserved from the
original text layer; compressed so every topic fits ONE page.

Usage: python build_lifedata_user_manual.py [output_path]
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fitz
from lifewood_pdf_builder import LifewoodPDF

TITLE = "LifeData Analytics Hub"
SUBTITLE = "User Manual"

SECTIONS = [
    ("1.0", "Getting Started"),
    ("2.0", "Login & Authentication"),
    ("3.0", "Dashboard Navigation"),
    ("4.0", "Working with Tables"),
    ("5.0", "Charts & Visualizations"),
    ("6.0", "Dark Mode & Preferences"),
    ("7.0", "Troubleshooting"),
]


def _page_1_content() -> list:
    return [
        ("body", "LifeData is the unified analytics platform for the Lifewood "
                 "PH project ecosystem — real-time monitoring across PH, KE, "
                 "MW, DRC, and GH."),
        ("body", "Accessible from any modern web browser at:"),
        ("code", "https://lifedata-lifewoodph.vercel.app/", "PRODUCTION URL"),
        ("body", "LifeData is built for stakeholders who need instant "
                 "visibility into project metrics — participant counts, "
                 "demographic breakdowns, month-over-month trends, and "
                 "country-specific data tables."),
        ("table", ["Feature", "Description"],
         [["Real-time data", "Supabase-backed live updates"],
          ["Multi-region", "PH, KE, MW, DRC, GH dashboards"],
          ["Dark mode", "Full theme support"],
          ["Export", "Download tables as Excel spreadsheets"],
          ["Responsive", "Works on desktop and tablet"]]),
    ]


def _page_2_content() -> list:
    return [
        ("body", "Access to LifeData is protected by email/password "
                 "authentication through Supabase Auth. New accounts must be "
                 "created by a system administrator."),
        ("steps", [
            "Open the application URL in your browser.",
            "Enter your email address and password.",
            "Click Sign In.",
            "You will be redirected to the main dashboard.",
            "If you forget your password, contact your administrator.",
        ]),
        ("callout", "Note",
         "The login page features a video background with an overlay. If the "
         "video does not load, the page remains fully functional."),
        ("code", "Email: your-email@example.com\nPassword: ********",
         "CREDENTIALS FORMAT"),
    ]


def _page_3_content() -> list:
    return [
        ("body", "After logging in, the main dashboard displays. The "
                 "interface consists of three key areas:"),
        ("table", ["Area", "Location", "Function"],
         [["Sidebar", "Left panel", "Navigation menu with folder groups"],
          ["Header", "Top bar", "Project title, dark mode toggle, user menu"],
          ["Content", "Center", "Main dashboard content area"]]),
        ("steps", [
            "Home — landing page with welcome message and quick links.",
            "BYU — Brigham Young University project dashboards by country.",
            "Crowdsource PH — Philippines crowdsource participant data.",
            "Crowdsource Int'l — International crowdsource participants.",
        ]),
        ("body", "Click a folder to expand it; the active tab is "
                 "highlighted with a green indicator."),
    ]


def _page_4_content() -> list:
    return [
        ("body", "Each dashboard displays its data in an interactive table. "
                 "The GenericTableDashboard component provides:"),
        ("steps", [
            "Search — filter rows by any column value.",
            "Sort — click column headers to sort ascending or descending.",
            "Pagination — navigate pages with prev/next controls.",
            "Row count toggle — switch between count view and data table.",
            "Excel export — download visible rows as .xlsx.",
            "Column visibility — show or hide specific columns.",
        ]),
        ("body", "Tables display metric cards at the top — total count, "
                 "active records, category breakdowns — each with a colored "
                 "left border indicating its metric type."),
    ]


def _page_5_content() -> list:
    return [
        ("body", "Overview dashboards feature Recharts-based area charts "
                 "showing month-over-month trends — participant growth and "
                 "project activity over time."),
        ("table", ["Chart Type", "Location", "Data Shown"],
         [["Area chart", "BYU Overview page", "MoM participant growth"],
          ["Summary cards", "All overview pages", "Total, active, affiliates"],
          ["Metric cards", "Table dashboards", "Record counts by category"]]),
        ("body", "Use the country filter dropdown on overview pages to "
                 "filter data by specific regions. The charts update "
                 "automatically when a filter is applied."),
        ("callout", "Note",
         "Charts are interactive — hover over data points for exact values. "
         "Area charts use custom gradient fills matching the platform's "
         "color theme."),
    ]


def _page_6_content() -> list:
    return [
        ("body", "LifeData includes full dark mode support. Toggle dark mode "
                 "using the sun/moon icon in the top header bar. Dark mode "
                 "transforms all interface elements:"),
        ("table", ["Element", "Light Mode", "Dark Mode"],
         [["Background", "Slate-50", "Slate-900"],
          ["Cards", "White", "Dark slate-800"],
          ["Sidebar", "White", "Dark navy"],
          ["Text", "Dark gray", "Light gray"],
          ["Borders", "Gray-200", "Slate-700"],
          ["Badges", "Green/red bg", "Muted green/red"]]),
        ("body", "Your dark mode preference persists for the session but is "
                 "not saved between visits."),
    ]


def _page_7_content() -> list:
    return [
        ("table", ["Issue", "Cause", "Solution"],
         [["Blank page on load", "Missing or expired session",
           "Log out and log back in"],
          ["No data in tables", "Supabase connection issue",
           "Check your internet connection, refresh the page"],
          ["Login fails", "Wrong email or password",
           "Reset your password or contact admin"],
          ["Charts not showing", "Filter returned no data",
           "Try a different filter selection"],
          ["Slow page load", "Large dataset loading",
           "Use search to narrow results, or wait for full load"],
          ["Dark mode not working", "Session cache issue",
           "Refresh the page and try the toggle again"]]),
        ("callout", "Warning",
         "If problems persist, contact the Lifewood PH support team. Include "
         "your browser name, version, and any error messages shown in the "
         "browser console (F12 → Console tab)."),
    ]


PAGES = {
    "1.0": _page_1_content,
    "2.0": _page_2_content,
    "3.0": _page_3_content,
    "4.0": _page_4_content,
    "5.0": _page_5_content,
    "6.0": _page_6_content,
    "7.0": _page_7_content,
}


def _find_section_pages(path: str) -> dict:
    """Map section number -> 1-indexed physical page of its heading.

    Matches the bare kicker line (\"3.0\" on its own line) so the ToC page —
    whose lines read \"3.0  Title...\" — is never picked.
    """
    doc = fitz.open(path)
    mapping = {}
    try:
        for pno, page in enumerate(doc, 1):
            text = page.get_text()
            if "cont." in text.lower():
                continue
            for line in text.splitlines():
                line = line.strip()
                if line in [n for n, _t in SECTIONS] and line not in mapping:
                    mapping[line] = pno
    finally:
        doc.close()
    return mapping


def build(output_path: str) -> LifewoodPDF:
    pdf = LifewoodPDF(TITLE, SUBTITLE, audience="user", variant="swiss")
    pdf.add_cover()

    # Pass 1: ToC without page numbers (need physical pages first).
    pdf.add_toc([f"{n}  {t}" for n, t in SECTIONS])
    for num, _title in SECTIONS:
        pdf.add_mixed_content_page(num, _title, PAGES[num]())
    pdf.save(output_path, audit=True)
    print("pass 1:", pdf.verify_numbering())

    # Pass 2: rebuild with dot leaders + real page numbers.
    page_map = _find_section_pages(output_path)
    pdf2 = LifewoodPDF(TITLE, SUBTITLE, audience="user", variant="swiss")
    pdf2.add_cover()
    pdf2.add_toc([f"{n}  {t}" for n, t in SECTIONS], page_map=page_map)
    for num, _title in SECTIONS:
        pdf2.add_mixed_content_page(num, _title, PAGES[num]())
    pdf2.save(output_path, audit=True)
    print("pass 2:", pdf2.verify_numbering())
    print("page_map:", page_map)
    return pdf2


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "output",
        "LifeData_User_Manual.pdf")
    build(out)
    print("built:", out)
