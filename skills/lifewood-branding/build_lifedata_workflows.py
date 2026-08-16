#!/usr/bin/env python3
"""
LifeData Analytics Hub — Workflows (16:9 Lifewood-branded PDF).

Rebuild of the former A4-portrait LifeData_Workflows.pdf (a plain-FPDF
fallback that broke the 16:9 canvas rule). Content preserved from the
original text layer; compressed so every topic fits ONE page.

Usage: python build_lifedata_workflows.py [output_path]
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fitz
from lifewood_pdf_builder import LifewoodPDF

TITLE = "LifeData Analytics Hub"
SUBTITLE = "Workflows"

SECTIONS = [
    ("1.0", "Development Workflow"),
    ("2.0", "Build & Deploy Pipeline"),
    ("3.0", "Adding a New Dashboard"),
    ("4.0", "Adding a New Affiliation"),
    ("5.0", "Code Quality & Linting"),
    ("6.0", "Troubleshooting Workflows"),
]


def _page_1_content() -> list:
    return [
        ("body", "The LifeData project follows a trunk-based development "
                 "workflow with feature branches and pull requests."),
        ("steps", [
            "Create a branch from main: git checkout -b feat/my-feature; "
            "use descriptive names like fix/login-error or "
            "feat/byu-ethiopia.",
            "Make small, focused commits in present tense, e.g. 'Add BYU "
            "Ethiopia dashboard config'.",
            "Push the branch, open a PR against main, and ensure "
            "npm run lint && npm run build pass first.",
        ]),
        ("code", "git checkout -b feat/new-dashboard\n"
                 "git commit -m \"Add new dashboard\"\n"
                 "git push origin feat/new-dashboard", "GIT WORKFLOW"),
        ("body", "No test command currently exists — a test framework "
                 "(Vitest) should be added before writing tests."),
    ]


def _page_2_content() -> list:
    return [
        ("body", "LifeData uses Vercel for continuous deployment — every "
                 "push to main triggers an automatic deployment."),
        ("steps", [
            "Run npm run lint and npm run build — fix ESLint errors and "
            "TypeScript failures.",
            "Verify the build output in the dist/ directory.",
            "Commit and push to the main branch.",
            "Monitor the Vercel deployment and check the production URL.",
        ]),
        ("table", ["Step", "Command", "Duration", "Tool"],
         [["Lint", "npm run lint", "~10s", "ESLint 9"],
          ["Type check", "npm run build (includes tsc)", "~30s",
           "TypeScript 6"],
          ["Build", "npm run build", "~20s", "Vite 7"],
          ["Deploy", "git push", "~60s", "Vercel CI"],
          ["Verify", "Manual", "~30s", "Browser"]]),
        ("body", "The build pipeline produces optimized static assets in "
                 "dist/ — bundling, code splitting, and fingerprinting by "
                 "Vite. No Dockerfile: Vercel serves the static build "
                 "directly."),
    ]


def _page_3_content() -> list:
    return [
        ("body", "Adding a new country or project dashboard requires zero "
                 "component code changes — the GenericTableDashboard "
                 "auto-renders from configuration."),
        ("steps", [
            "Create the Supabase table from your CSV or XLSX data.",
            "Enable Row-Level Security and add a SELECT policy for anon or "
            "authenticated users.",
            "Add a TableDashboardConfig entry in "
            "src/config/tableDashboards.ts.",
            "Push to main — deployment is automatic.",
            "Verify the new dashboard appears in the sidebar.",
        ]),
        ("code", "{\n"
                 "  tabId: 'byu-ethiopia',\n"
                 "  tableId: 'BYUEthiopia',\n"
                 "  label: 'Ethiopia',\n"
                 "  sidebarFolder: 'byu',\n"
                 "  flagCode: 'ET',\n"
                 "  title: 'BYU Ethiopia',\n"
                 "  subtitle: 'Ethiopia project participants',\n"
                 "  columns: [...],\n"
                 "}", "EXAMPLE CONFIG"),
    ]


def _page_4_content() -> list:
    return [
        ("body", "Affiliations map participant organizations and are defined "
                 "in crowdsourceAffiliations.ts. Adding a new affiliation is "
                 "a config-only change."),
        ("steps", [
            "Open src/config/crowdsourceAffiliations.ts.",
            "Add the new affiliation name to the appropriate list "
            "(PH_AFFILIATION_NAMES or INTL_AFFILIATION_NAMES).",
            "Optionally add a flag mapping in affilFlags.ts.",
            "Verify the affiliation appears in filter dropdowns, then push "
            "to main for deployment.",
        ]),
        ("code", "export const PH_AFFILIATION_NAMES = new Set([\n"
                 "  'University of Santo Tomas',\n"
                 "  'De La Salle University',\n"
                 "  'New Affiliation Here',  // Add new entry\n"
                 "]);", "AFFILIATION CONFIG"),
        ("callout", "Note",
         "Affiliations use case-insensitive matching. The system auto-merges "
         "variations like 'Student ID' and 'Student Number' through built-in "
         "data normalization."),
    ]


def _page_5_content() -> list:
    return [
        ("body", "ESLint 9 with the flat config (eslint.config.js) enforces "
                 "code quality. Run checks before every commit."),
        ("table", ["Rule Set", "Purpose"],
         [["eslint:recommended", "Standard JS error prevention"],
          ["react-hooks + react-refresh + no-unused-vars",
           "Hooks rules, Vite HMR compatibility, unused variable "
           "detection"]]),
        ("code", "# Run lint\nnpm run lint\n"
                 "npm run build  # includes TypeScript check",
         "QUALITY COMMANDS"),
        ("steps", [
            "TypeScript strict mode (strict: true in tsconfig.json).",
            "React functional components with hooks — no class components.",
            "Tailwind CSS for styling, no inline styles; no semicolons, "
            "single quotes, 2-space indentation.",
        ]),
    ]


def _page_6_content() -> list:
    return [
        ("table", ["Issue", "Cause", "Fix"],
         [["npm run build fails with TS errors",
           "Type mismatch or missing imports",
           "Run tsc --noEmit for the full error list, then fix types."],
          ["npm run lint fails with react-hooks errors",
           "Hook dependency array issue",
           "Add missing deps to useEffect dependency arrays."],
          ["Vercel deploy fails", "Build step failed",
           "Check Vercel dashboard build logs; reproduce locally."],
          ["New dashboard not appearing after deploy",
           "Config syntax error or missing Supabase table",
           "Verify the tableDashboards.ts entry; check the table exists."],
          ["Git push rejected",
           "Branch behind main or permission denied",
           "git pull --rebase origin main, resolve conflicts."],
          ["Build succeeds but blank page on prod",
           "Missing or incorrect env variables on Vercel",
           "Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."]]),
    ]


PAGES = {
    "1.0": _page_1_content,
    "2.0": _page_2_content,
    "3.0": _page_3_content,
    "4.0": _page_4_content,
    "5.0": _page_5_content,
    "6.0": _page_6_content,
}


def _find_section_pages(path: str) -> dict:
    """Map section number -> 1-indexed physical page of its heading.

    Matches the bare kicker line (\"2.0\" on its own line) so the ToC page —
    whose lines read \"2.0  Title...\" — is never picked.
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
    pdf = LifewoodPDF(TITLE, SUBTITLE, audience="workflow", variant="swiss")
    pdf.add_cover()
    pdf.add_toc([f"{n}  {t}" for n, t in SECTIONS])
    for num, _title in SECTIONS:
        pdf.add_mixed_content_page(num, _title, PAGES[num]())
    pdf.save(output_path, audit=True)
    print("pass 1:", pdf.verify_numbering())

    page_map = _find_section_pages(output_path)
    pdf2 = LifewoodPDF(TITLE, SUBTITLE, audience="workflow", variant="swiss")
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
        "LifeData_Workflows.pdf")
    build(out)
    print("built:", out)
