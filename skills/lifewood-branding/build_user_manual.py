#!/usr/bin/env python3
"""Build LifeData User Manual PDF with Lifewood branding — editorial style.

Content verified against docs/usage.md, docs/installation.md, and
docs/troubleshooting.md (commit 42cf556) plus the current source tree —
no invented features (no Excel export, no dark-mode toggle: neither
exists in the shipped app).
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.config\opencode\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\LW-Dev\LifeData\docs\generated"
TITLE = "LifeData Analytics Hub"
SUBTITLE = "User Manual"
DATE = "July 30, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    sections = [
        "1.0  Getting Started",
        "2.0  Signing In & Out",
        "3.0  Navigating the Sidebar",
        "4.0  Home & Overview Pages",
        "5.0  Working with Data Tables",
        "6.0  Understanding Your Data",
        "7.0  Troubleshooting",
    ]
    page_map = {"1.0": 3, "2.0": 4, "3.0": 5, "4.0": 6, "5.0": 8, "6.0": 11, "7.0": 12}

    PdfSpecLock.write_spec_lock(
        OUTPUT_DIR, title=f"{TITLE} - {SUBTITLE}",
        audience="user", page_count=13, sections=sections,
    )

    pdf = LifewoodPDF(TITLE, subtitle=SUBTITLE, audience="user",
                      date_str=DATE, variant="editorial")
    pdf.add_cover()
    pdf.add_toc(sections, page_map=page_map)

    # 1.0 Getting Started
    pdf.add_mixed_content_page("1.0", "Getting Started", [
        ("body", "LifeData is the analytics hub for the Lifewood PH project "
         "ecosystem. It brings together participant data from BYU country "
         "programs and Crowdsource Philippines / International affiliations "
         "into one live dashboard, so anyone on the team can see current "
         "participant counts and demographics without exporting spreadsheets."),
        ("body", "The application runs in any modern browser. No install is "
         "required — open the production URL below:"),
        ("code", "https://lifedata-lifewoodph.vercel.app/", "Production URL"),
        ("table", ["What you can do", "Where"],
         [["See total participants at a glance", "Home page"],
          ["Compare countries or affiliations", "Overview pages"],
          ["Search, filter, and inspect one record", "Table dashboards"],
          ["Track sign-up trends over time", "Monthly join chart"]]),
        ("callout", "Note",
         "All pages except Sign In require an authenticated Supabase "
         "account. Accounts are created by an administrator — there is "
         "no public self-registration."),
    ])

    # 2.0 Signing In & Out
    pdf.add_mixed_content_page("2.0", "Signing In & Out", [
        ("body", "LifeData uses Supabase email/password authentication. "
         "Every route except the sign-in page is protected — visiting "
         "any dashboard URL while signed out redirects you back here."),
        ("steps", [
            "Open the application URL.",
            "Enter the email and password given to you by an administrator.",
            "Click Sign In.",
            "On success you land on the Home dashboard.",
            "On failure, a red error banner explains why (wrong "
            "credentials, or a network/Supabase connection problem).",
        ]),
        ("body", "To sign out, click Sign out at the bottom of the sidebar. "
         "This ends your Supabase session and returns you to the sign-in "
         "page."),
        ("callout", "Note",
         "Forgotten passwords are reset in the Supabase Authentication "
         "dashboard by an administrator — there is no self-service "
         "\"forgot password\" link in the app."),
    ])

    # 3.0 Navigating the Sidebar
    pdf.add_mixed_content_page("3.0", "Navigating the Sidebar", [
        ("body", "The left sidebar organizes every dashboard into three "
         "expandable folders. All folders are collapsed by default when "
         "you first sign in."),
        ("table", ["Folder", "Contains"],
         [["BYU", "Overview + country dashboards: DRC, Fiji, Ghana, Kenya, "
           "Madagascar, Malawi, Nigeria, Philippines, Rep. of Congo, "
           "South Africa, Tonga, Uganda"],
          ["Crowdsource Philippines", "Overview + affiliation directories "
           "(CBIT Park, CB Talisay Hub, LG Team, and others)"],
          ["Crowdsource International", "Overview + international "
           "affiliation directories (BYU country programs)"]]),
        ("body", "Click a folder header to expand or collapse it. Click "
         "any item inside to load that dashboard."),
        ("callout", "Tip",
         "When you're inside a sub-dashboard, a breadcrumb trail appears "
         "above the page title. Click any segment to jump back up a "
         "level without reopening the sidebar."),
    ])

    # 4.0 Home & Overview Pages
    pdf.add_mixed_content_page("4.0", "Home & Overview Pages", [
        ("body", "The Home page is your landing screen after signing in. "
         "It shows a hero banner with quick-nav buttons to each folder's "
         "overview, three stat cards (Total Participants, Active Datasets, "
         "Regions), and a short Getting Started guide."),
        ("body", "Each folder also has its own Overview page, reached via "
         "the quick-nav buttons or the folder's first sidebar item:"),
        ("table", ["Element", "Shows"],
         [["Stat cards", "Total participants, country/affiliation count, "
           "largest country/affiliation, average per country/affiliation"],
          ["Bar chart", "Participants by country or affiliation, sorted "
           "by count, with count and percentage share per row"]]),
        ("callout", "Tip",
         "Click any row in the overview bar chart to jump straight into "
         "that country's or affiliation's full table dashboard."),
        ("callout", "Note",
         "The Little Boss affiliation is left out of overview totals so "
         "it doesn't skew affiliation-level averages, but it still "
         "appears in the sidebar (marked with a star icon)."),
    ])

    # 5.0 Working with Data Tables
    pdf.add_mixed_content_page("5.0", "Working with Data Tables", [
        ("body", "Every country and affiliation dashboard uses the same "
         "table layout. What appears depends on which columns exist for "
         "that dataset."),
        ("table", ["Section", "Shown when"],
         [["Summary stat cards", "Always — Total Participants plus "
           "Nationalities / Avg. Age / Top Affiliation where the columns exist"],
          ["Monthly join trend", "The table has a join-date column"],
          ["Top Nationalities / Users by Affiliation chart", "Depending on "
           "whether the table has a country column"],
          ["Gender Distribution chart", "Always — shows a Low data "
           "warning below 50% populated"],
          ["Top Languages chart", "The table has a language field"],
          ["Age Demographics donut", "The table has an age column"]]),
        ("steps", [
            "Search — type in the search box to filter by name, email, "
            "affiliation, language, or country as you type.",
            "Sort — click a column header to sort ascending, click again "
            "to reverse.",
            "Filter — click Filters to reveal name order, gender, "
            "affiliation, age group, nationality, join-date range, and "
            "has-email/has-phone options.",
            "Paginate — choose 15, 25, or 50 rows per page.",
            "Inspect — click any row to open a detail drawer with the "
            "participant's full profile.",
        ]),
        ("callout", "Tip",
         "Active filters show as removable chips above the table. Click "
         "the red Clear button to reset everything at once, or remove "
         "one chip's × to drop just that filter."),
    ])

    pdf.add_mixed_content_page("5.1", "Loading & Data States", [
        ("body", "Large datasets load in batches of 1,000 rows. The first "
         "batch renders immediately; a green \"Loading more "
         "participants...\" bar shows above the pagination controls while "
         "later batches arrive in the background."),
        ("body", "A floating back-to-top button appears at the bottom "
         "right once you've scrolled 400px or more down the table."),
        ("table", ["Situation", "What you'll see"],
         [["Filters return zero rows", "An empty-state message with a "
           "Clear all filters button"],
          ["Data fails to load", "An error panel with a Try again button "
           "that re-fetches the dataset"],
          ["Data is still loading", "A skeleton placeholder UI, including "
           "in the sidebar while affiliations load"]]),
    ])

    # 6.0 Understanding Your Data
    pdf.add_mixed_content_page("6.0", "Understanding Your Data", [
        ("body", "LifeData applies a few automatic cleanup rules so data "
         "from different international partners reads consistently:"),
        ("table", ["Rule", "Effect"],
         [["Affiliation normalization", "\"Student Number\" and \"Student "
           "ID\" both display as Student; \"Member\" displays as "
           "Church Member"],
          ["Null / empty handling", "Null, empty, or \"N/A\" values show "
           "as \u2014 in the table and are left out of charts"],
          ["Country flag detection", "Affiliation names are matched "
           "against a keyword list to show the right flag icon "
           "(e.g. CBIT Park \u2192 Philippines flag)"],
          ["Little Boss icon", "Shows a star instead of a flag, since it "
           "isn't tied to one country"]]),
        ("callout", "Note",
         "There is currently no export/download button in the UI. If "
         "you need data outside the app, ask an administrator for a "
         "Supabase export."),
    ])

    # 7.0 Troubleshooting
    pdf.add_mixed_content_page("7.0", "Troubleshooting", [
        ("table", ["Symptom", "Likely cause", "What to do"],
         [["Sign-in fails: \"Invalid login credentials\"",
           "Wrong email or password",
           "Double-check for typos; ask an admin to reset your password"],
          ["Sign-in fails with a network error",
           "Supabase unreachable or blocked",
           "Check your connection; if it persists, contact support"],
          ["\"Failed to load data\" on a dashboard",
           "Table missing, permissions issue, or transient network fault",
           "Click Try again; if it keeps failing, contact support"],
          ["No sidebar items under a folder",
           "That folder has nothing configured yet, or is still loading",
           "Wait a moment; contact support if the folder stays empty"],
          ["Country flag not showing",
           "The affiliation name isn't recognized",
           "Report the affiliation name to an administrator"],
          ["\"No participants found\" on a dashboard",
           "Filters or search are too narrow",
           "Click Clear all filters, or loosen your search term"],
          ["Page is blank or stuck on a spinner",
           "Your session hasn't resolved, or a browser error occurred",
           "Refresh the page; open DevTools (F12) console if it repeats"]]),
        ("callout", "Warning",
         "If a problem persists after trying the steps above, contact "
         "the Lifewood PH support team with your browser name/version "
         "and any error message shown in the console."),
    ])

    output_path = os.path.join(OUTPUT_DIR, "LifeData_User_Manual.pdf")
    pdf.save(output_path)
    print(f"[OK] User manual: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    return output_path

if __name__ == "__main__":
    build()
