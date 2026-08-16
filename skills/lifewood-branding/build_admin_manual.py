#!/usr/bin/env python3
"""Build LifeData Analytics Hub Admin Manual PDF with Lifewood branding.

DENSE edition — no wasteful section dividers, continuous content flow,
code blocks, tables, and callouts. Targets 60-80% page density.
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.config\opencode\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = r"C:\Users\richa\.config\opencode\skills\lifewood-branding\output"
TITLE = "LifeData Analytics Hub"
SUBTITLE = "Admin Manual"
DATE = "July 25, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    sections = [
        "1.0  System Overview",
        "2.0  Supabase Configuration",
        "3.0  Adding New Dashboards",
        "4.0  Environment Variables",
        "5.0  Deployment",
        "6.0  Security",
    ]

    # ── Page map for TOC dot leaders ──────────────────────────────
    # Cover=1, TOC=2, content starts at 3
    page_map = {"1.0": 3, "2.0": 5, "3.0": 7, "4.0": 10, "5.0": 12, "6.0": 13}

    # 1. Write pdf_spec_lock.md
    PdfSpecLock.write_spec_lock(
        OUTPUT_DIR,
        title=f"{TITLE} - {SUBTITLE}",
        audience="admin",
        page_count=14,
        sections=sections,
    )

    # 2. Build PDF — use SWISS variant for dense, reference-grade look
    pdf = LifewoodPDF(TITLE, subtitle=SUBTITLE, audience="admin",
                      date_str=DATE, variant="swiss")

    # ── Cover (page 1) ────────────────────────────────────────────
    pdf.add_cover()

    # ── TOC (page 2) with dot leaders ─────────────────────────────
    pdf.add_toc(sections, page_map=page_map)

    # ═══════════════════════════════════════════════════════════════
    # SECTION 1.0 — System Overview
    # Continuous flow, no divider page. Dense body + table.
    # ═══════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("1.0", "System Overview", [
        ("body", "LifeData is a React 19 SPA with Vite 7 build tooling, "
         "deployed to Vercel. Backend: Supabase (PostgreSQL) with "
         "Row-Level Security for data access control. Authentication "
         "uses Supabase Auth with email/password login."),
        ("body", "The application uses a config-driven dashboard system — "
         "new dashboards can be added without writing component code. "
         "This manual covers configuration, deployment, and security "
         "for administrators maintaining the platform."),
        ("table", ["Component", "Technology", "Purpose"],
         [["Frontend", "React 19 + TypeScript", "SPA with config-driven dashboards"],
          ["Build", "Vite 7", "Fast dev server + optimized production builds"],
          ["Database", "Supabase / PostgreSQL", "Data storage with RLS"],
          ["Auth", "Supabase Auth", "Email/password login"],
          ["Hosting", "Vercel", "Continuous deployment from GitHub"],
          ["Config", "tableDashboards.ts", "Declarative dashboard definitions"]]),
    ])

    # ═══════════════════════════════════════════════════════════════
    # SECTION 2.0 — Supabase Configuration
    # Mixed: body + code block + table
    # ═══════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("2.0", "Supabase Configuration", [
        ("body", "Create a Supabase project at supabase.com and note your "
         "project URL and anon key. These go into your .env file (see "
         "Section 4.0)."),
        ("body", "Tables must match the expected column schema. The standard "
         "schema includes: firstName, lastName, gender, affiliation, "
         "email, phone, joinedDate, age."),
        ("callout", "Prerequisite",
         "Enable Row-Level Security on EVERY table. Without RLS, "
         "all data is publicly readable via the anon key."),
        ("code", 'CREATE POLICY "Allow anon read" ON "TableName" '
         'FOR SELECT TO anon USING (true);',
         "SQL — Anon read policy"),
        ("code", 'CREATE POLICY "Allow all for authenticated" ON "TableName" '
         'FOR ALL TO authenticated USING (true);',
         "SQL — Auth user full access policy"),
        ("body", "Apply these two policies per table. The first allows "
         "anonymous read access (needed for public dashboards). The "
         "second lets authenticated users insert/update/delete."),
    ])

    # ═══════════════════════════════════════════════════════════════
    # SECTION 3.0 — Adding New Dashboards
    # Steps + table + code block
    # ═══════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("3.0", "Adding New Dashboards", [
        ("body", "Adding a new dashboard requires zero component code. "
         "The GenericTableDashboard auto-renders from configuration."),
        ("steps", [
            "Create the Supabase table and upload your CSV/XLSX data.",
            "Run the two RLS policies from Section 2.0 on the new table.",
            "Add a TableDashboardConfig entry in "
            "src/config/tableDashboards.ts.",
            "No component code changes needed — GenericTableDashboard "
            "auto-renders the new dashboard.",
            "Optional: add preFilter for row-level filtering by a "
            "specific column/value.",
        ]),
        ("body", "Each config entry requires these fields:"),
        ("table", ["Field", "Type", "Required", "Description"],
         [["tabId", "string", "Yes", "Unique tab identifier"],
          ["tableId", "string", "Yes", "Supabase table name"],
          ["label", "string", "Yes", "Display name in sidebar"],
          ["sidebarFolder", "string", "No", "Folder grouping in nav"],
          ["flagCode", "string", "No", "Country/region filter code"],
          ["title", "string", "Yes", "Dashboard heading"],
          ["subtitle", "string", "No", "Subtitle below heading"],
          ["columns", "ColumnConfig[]", "Yes", "Column definitions"],
          ["preFilter", "object", "No", "Row-level filter: {column, value}"]]),
    ])

    # ═══════════════════════════════════════════════════════════════
    # SECTION 4.0 — Environment Variables
    # Table + code + callout
    # ═══════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("4.0", "Environment Variables", [
        ("table", ["Variable", "Description", "Source"],
         [["VITE_SUPABASE_URL", "Supabase project URL",
           "Supabase dashboard > Settings > API"],
          ["VITE_SUPABASE_ANON_KEY", "Public anon key",
           "Supabase dashboard > Settings > API"]]),
        ("callout", "Warning",
         "Never commit .env files to version control. "
         "Never expose the service_role key client-side. "
         "The anon key is safe for browser use — it is gated by RLS."),
        ("body", "For local development, copy .env.example to .env and "
         "fill in the values. For Vercel deployment, set these in the "
         "Vercel dashboard under Project Settings > Environment Variables."),
        ("code", 'VITE_SUPABASE_URL="https://your-project.supabase.co"\n'
         'VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ..."',
         ".env template"),
    ])

    # ═══════════════════════════════════════════════════════════════
    # SECTION 5.0 — Deployment
    # Body + steps + code
    # ═══════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("5.0", "Deployment", [
        ("body", "The application is continuously deployed to Vercel from "
         "the GitHub repository. Every push to the main branch triggers "
         "an automatic deployment."),
        ("steps", [
            "Run npm run lint to verify code quality (fix any errors).",
            "Run npm run build to produce a production build. "
            "Output goes to dist/.",
            "Commit and push to main. Vercel auto-deploys.",
            "Verify the deployment in Vercel dashboard.",
        ]),
        ("code", 'npm run lint\nnpm run build\n'
         'npm run preview   # serve production build locally',
         "Commands"),
        ("body", "The build pipeline runs TypeScript type checking as part "
         "of the build step. There is no Dockerfile or separate CI/CD "
         "pipeline — Vercel handles all build and deployment."),
    ])

    # ═══════════════════════════════════════════════════════════════
    # SECTION 6.0 — Security
    # Table + body + callout
    # ═══════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("6.0", "Security", [
        ("table", ["Measure", "Implementation", "Criticality"],
         [["Row-Level Security", "Per-table SELECT/ALL policies", "Critical"],
          ["Auth", "Supabase Auth, email/password", "Required"],
          ["Secrets", ".env never committed, Vercel env vars", "Required"],
          ["Key separation", "anon key = public, service_role = server", "Critical"],
          ["HTTPS", "Vercel edge network (default)", "Automatic"],
          ["Etag caching", "Vercel edge (default)", "Automatic"]]),
        ("callout", "Warning",
         "The service_role key bypasses RLS entirely. "
         "It must NEVER be exposed in client-side code or "
         "committed to version control."),
        ("body", "Before going live with a new table, verify that "
         "appropriate SELECT policies exist. Test by loading the "
         "dashboard page while logged out — if data appears without "
         "auth, the anon SELECT policy is working correctly. If "
         "sensitive data should NOT be public, omit the anon policy."),
        ("body", "ETag-based caching and HTTPS are handled automatically "
         "by Vercel's edge network. No additional configuration is needed."),
    ])

    # Save
    output_path = os.path.join(OUTPUT_DIR, "LifeData_Admin_Manual.pdf")
    pdf.save(output_path)
    print(f"[OK] Admin manual: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    return output_path


if __name__ == "__main__":
    build()
