#!/usr/bin/env python3
"""Build LifeData System & Extension Workflows PDF with Lifewood branding —
swiss (technical/dense) style.

Content verified against docs/architecture.md and CONTRIBUTING.md
(commit 42cf556) plus the current source tree. No invented CI timing
numbers — Vercel/Actions durations aren't recorded anywhere in the repo,
so they're omitted rather than guessed.
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.config\opencode\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\LW-Dev\LifeData\docs\generated"
TITLE = "LifeData Analytics Hub"
SUBTITLE = "System & Extension Workflows"
DATE = "July 30, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    sections = [
        "1.0  System Architecture",
        "2.0  Data Flow",
        "3.0  Development Workflow",
        "4.0  Adding a New Dashboard",
        "5.0  Adding a New Affiliation",
        "6.0  Code Quality & Deployment",
        "7.0  Known Issues",
    ]
    page_map = {"1.0": 3, "2.0": 4, "3.0": 5, "4.0": 6, "5.0": 8, "6.0": 9, "7.0": 10}

    PdfSpecLock.write_spec_lock(
        OUTPUT_DIR, title=f"{TITLE} - {SUBTITLE}",
        audience="workflow", page_count=11, sections=sections,
    )

    pdf = LifewoodPDF(TITLE, subtitle=SUBTITLE, audience="workflow",
                      date_str=DATE, variant="swiss")
    pdf.add_cover()
    pdf.add_toc(sections, page_map=page_map)

    # 1.0 System Architecture
    pdf.add_mixed_content_page("1.0", "System Architecture", [
        ("body", "LifeData is a client-side single-page app (React 19 + "
         "Vite 7). There is no application server: the browser renders "
         "everything and talks to Supabase (PostgreSQL + REST + Auth) "
         "directly. Supabase Row-Level Security policies gate every "
         "table read."),
        ("table", ["Layer", "Technology"],
         [["UI framework", "React 19 + React Router 7"],
          ["Build tool", "Vite 7"],
          ["Styling", "Tailwind CSS 4"],
          ["Backend", "Supabase (PostgreSQL, Auth, REST)"],
          ["Charts", "Recharts 3"],
          ["Icons", "Lucide React"]]),
        ("code", "src/\n"
         "|-- lib/          supabase.ts, affilFlags.ts\n"
         "|-- config/       tableDashboards.ts, crowdsourceAffiliations.ts\n"
         "|-- pages/        Login.tsx, Dashboard.tsx\n"
         "`-- components/\n"
         "    |-- layout/       AppLayout, Sidebar, Header\n"
         "    `-- dashboard/    HomeContent, OverviewContent,\n"
         "                   GenericTableDashboard (~1053 lines)",
         "Directory tree (src/)"),
        ("callout", "Note",
         "GenericTableDashboard.tsx is the universal renderer for every "
         "country and affiliation table — it is column-agnostic and "
         "reads its shape entirely from the TableDashboardConfig passed "
         "to it."),
    ])

    # 2.0 Data Flow
    pdf.add_mixed_content_page("2.0", "Data Flow", [
        ("body", "A typical request — a user opening the Kenya dashboard "
         "under BYU — flows through the app like this:"),
        ("steps", [
            "Sidebar.tsx handleNavClick() calls onTabChange('byu-ke'), "
            "setting activeTab state in Dashboard.tsx.",
            "Dashboard.tsx matches the tab to its TableDashboardConfig "
            "and renders <GenericTableDashboard config={...} />.",
            "GenericTableDashboard builds a column-select string from "
            "config.columns and queries Supabase: "
            "supabase.from(tableId).select(...).range(from, from+999).",
            "Rows are fetched in pages of 1,000 and accumulated in local "
            "state; the first page renders immediately, later pages "
            "stream in behind a loading indicator.",
            "Stats, chart data, and filter options are derived from the "
            "fetched rows with useMemo.",
            "Sorting, searching, filtering, and pagination all happen "
            "client-side against the already-fetched rows.",
        ]),
        ("callout", "Note",
         "Because all matching rows are pulled up front, very large "
         "tables load slowly on first open even though later "
         "interaction (search/sort/filter) is instant."),
    ])

    # 3.0 Development Workflow
    pdf.add_mixed_content_page("3.0", "Development Workflow", [
        ("body", "The project follows a trunk-based workflow: short-lived "
         "feature branches merged into main via pull request."),
        ("steps", [
            "Branch from main with a descriptive name: "
            "fix/login-error, feat/byu-ethiopia, refactor/table-filters.",
            "Make small, focused commits in present tense, e.g. "
            "\"Add BYU Ethiopia dashboard config\".",
            "Run npm run lint and npm run build locally before opening "
            "a PR — both must pass.",
            "Open the PR against main with a short description of what "
            "and why.",
        ]),
        ("code", "git checkout -b feat/new-dashboard\n"
         "npm run lint && npm run build\n"
         "git add <files>\n"
         "git commit -m \"Add new dashboard\"\n"
         "git push origin feat/new-dashboard",
         "Typical branch workflow"),
        ("callout", "Note",
         "No test command or framework exists yet (see CONTRIBUTING.md). "
         "Add one, e.g. Vitest, before writing automated tests."),
    ])

    # 4.0 Adding a New Dashboard
    pdf.add_mixed_content_page("4.0", "Adding a New Dashboard", [
        ("body", "Adding a country or project dashboard is a config-only "
         "change — no component code needs to change."),
        ("steps", [
            "Create the table in Supabase and load the data.",
            "Add the two Row-Level Security policies shown below so the "
            "app can read the table.",
            "Add one entry to the TABLE_DASHBOARDS array in "
            "src/config/tableDashboards.ts.",
            "Merge to main — the sidebar item and dashboard render "
            "automatically on the next load, with zero other changes.",
        ]),
        ("code", 'CREATE POLICY "Allow anon read" ON "Your Table"\n'
         "  FOR SELECT TO anon USING (true);\n"
         'CREATE POLICY "Allow all for authenticated" ON "Your Table"\n'
         "  FOR ALL TO authenticated USING (true);",
         "Required Supabase RLS policies"),
    ])

    pdf.add_mixed_content_page("4.1", "Example Dashboard Config", [
        ("code", "{\n"
         "  tabId: 'byu-et',\n"
         "  tableId: 'BYU ET',        // exact Supabase table name\n"
         "  label: 'Ethiopia',\n"
         "  sidebarFolder: 'byu',\n"
         "  flagCode: 'et',\n"
         "  title: 'BYU Ethiopia',\n"
         "  subtitle: 'Ethiopia project participants',\n"
         "  columns: {\n"
         "    firstName: 'FIRST NAME',\n"
         "    lastName: 'LAST NAME',\n"
         "    gender: 'GENDER',\n"
         "    affiliation: 'AFFILIATION',\n"
         "  },\n"
         "}",
         "New TableDashboardConfig entry"),
        ("callout", "Tip",
         "If the table has a country column, the dashboard automatically "
         "shows a Nationalities chart instead of an Affiliation chart — "
         "GenericTableDashboard picks this up from your columns object, "
         "nothing to configure."),
    ])

    # 5.0 Adding a New Affiliation
    pdf.add_mixed_content_page("5.0", "Adding a New Affiliation", [
        ("body", "Crowdsource PH/International affiliations are plain "
         "name sets in src/config/crowdsourceAffiliations.ts — adding "
         "one is also a config-only change."),
        ("steps", [
            "Add the affiliation name to PH_AFFILIATION_NAMES (Philippines) "
            "or INTL_AFFILIATION_NAMES (international) in "
            "crowdsourceAffiliations.ts.",
            "Optional: add a flag mapping in src/lib/affilFlags.ts — an "
            "exact override in AFFIL_FLAG_OVERRIDES, or a keyword in "
            "COUNTRY_KEYWORDS for substring matching.",
            "Optional: add a custom icon override in "
            "AFFIL_ICON_OVERRIDES for affiliations with no country "
            "(the pattern used for Little Boss \u2192 Star).",
            "Merge to main — the overview pages and sidebar pick up the "
            "new affiliation on next load.",
        ]),
        ("code", "export const PH_AFFILIATION_NAMES = new Set([\n"
         "  'CB Talisay Hub',\n"
         "  'CBIT Park',\n"
         "  'New Affiliation Here',  // added\n"
         "]);",
         "src/config/crowdsourceAffiliations.ts"),
        ("callout", "Note",
         "Little Boss is deliberately excluded from overview count "
         "queries (OverviewContent.tsx) so it doesn't skew "
         "affiliation-level averages, even though it still appears in "
         "the sidebar."),
    ])

    # 6.0 Code Quality & Deployment
    pdf.add_mixed_content_page("6.0", "Code Quality & Deployment", [
        ("body", "ESLint 9's flat config (eslint.config.js) enforces "
         "eslint:recommended plus the react-hooks and react-refresh "
         "plugins. Run it before every commit."),
        ("code", "npm run lint     # ESLint across all source files\n"
         "npm run build    # tsc type-check + production build to dist/\n"
         "npm run preview  # serve the production build locally",
         "Quality & build commands"),
        ("table", ["Convention", "Rule"],
         [["Language", "TypeScript, strict mode on"],
          ["Components", "Functional components + hooks only"],
          ["Styling", "Tailwind CSS; avoid inline styles"],
          ["Modules", "ES modules (\"type\": \"module\")"],
          ["Formatting", "No semicolons, single quotes, 2-space indent"]]),
        ("body", "Deployment is continuous via Vercel: every push to "
         "main triggers a new build and deploy from dist/. There is no "
         "Dockerfile — Vercel serves the static build directly."),
    ])

    # 7.0 Known Issues
    pdf.add_mixed_content_page("7.0", "Known Issues", [
        ("table", ["Issue", "Detail"],
         [["index.html loads main.jsx", "The actual file is main.tsx. "
           "Vite resolves this transparently in dev and build — no "
           "functional impact, but worth fixing for clarity."],
          ["Unused xlsx dependency", "xlsx v0.18.5 is listed in "
           "package.json but never imported anywhere — no export "
           "feature currently exists in the UI."],
          ["Hardcoded Supabase credentials", "src/lib/supabase.ts has "
           "fallback URL/anon-key values so the app runs without a "
           ".env file. Always override both in production."],
          ["lastUpdated always null", "Header accepts a lastUpdated "
           "prop for a timestamp badge, but Dashboard.tsx always passes "
           "null — the badge never renders."],
          ["No test suite", "No test framework is configured yet. Add "
           "one (e.g. Vitest) before writing tests."]]),
        ("callout", "Warning",
         "Never commit a real .env file or a Supabase service_role key. "
         "The anon key is safe for client-side use; the service_role "
         "key is not."),
    ])

    output_path = os.path.join(OUTPUT_DIR, "LifeData_Workflows.pdf")
    pdf.save(output_path)
    print(f"[OK] Workflows: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    return output_path

if __name__ == "__main__":
    build()
