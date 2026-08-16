#!/usr/bin/env python3
"""
Lifewood Developer Manual Generator — 13-section dense PDF.

Follows the Lifewood Developer Manual Master Prompt spec:
  - Continuous flow (no wasteful section dividers)
  - Code blocks with labels, branded tables, callouts, numbered steps
  - Targets 60-80% page density
  - SWISS variant for clean reference-grade look
  - TOC with dot leaders + page numbers

Usage:
    python build_developer_manual.py <repo_root>
    # Scans repo, generates pdf_spec_lock.md + Developer_Manual.pdf
"""

import sys
import os
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

SKILL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SKILL_DIR))

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = SKILL_DIR / "output"
DATE = datetime.today().strftime("%B %d, %Y")


# ═══════════════════════════════════════════════════════════════════════
#  Repo scanning helpers
# ═══════════════════════════════════════════════════════════════════════


class RepoScanner:
    """Minimal repo scanner — extracts package.json, dir tree, key files."""

    def __init__(self, repo_root: str):
        self.root = Path(repo_root).resolve()
        self.pkg: Dict = {}
        self.dir_tree: List[str] = []
        self.file_count = 0
        self.languages: List[str] = []
        self.scripts: Dict[str, str] = {}
        self.env_keys: List[str] = []
        self.ci_workflows: List[str] = []
        self.config_files: List[str] = []

    def scan(self) -> "RepoScanner":
        """Run all scans."""
        self._scan_package_json()
        self._scan_dir_tree()
        self._scan_env()
        self._scan_ci()
        self._scan_config()
        self._detect_languages()
        return self

    def _scan_package_json(self):
        pkg_path = self.root / "package.json"
        if pkg_path.is_file():
            try:
                data = json.loads(pkg_path.read_text(encoding="utf-8"))
                self.pkg = data
                self.scripts = data.get("scripts", {})
            except (json.JSONDecodeError, OSError):
                pass

    def _scan_dir_tree(self):
        """List top-level dirs + key subdirs up to 2 levels."""
        lines = []
        for entry in sorted(self.root.iterdir()):
            if entry.name.startswith(".") or entry.name == "node_modules":
                continue
            if entry.is_dir():
                lines.append(f"{entry.name}/")
                # One level deeper
                sub_entries = sorted(entry.iterdir())
                sub_dirs = [e for e in sub_entries if e.is_dir()
                           and not e.name.startswith(".")]
                for sd in sub_dirs[:8]:  # max 8 per dir
                    lines.append(f"  {sd.name}/")
                # Also list key files in the dir
                sub_files = [e for e in sub_entries if e.is_file()
                            and e.suffix in (".ts", ".tsx", ".py", ".js",
                                             ".jsx", ".json", ".yml", ".yaml",
                                             ".toml", ".go", ".rs")]
                for sf in sub_files[:5]:
                    lines.append(f"  {sf.name}")
            elif entry.is_file():
                lines.append(entry.name)
                self.file_count += 1
        self.dir_tree = lines

    def _scan_env(self):
        """Look for .env.example, .env.sample, or env vars in README."""
        for pattern in (".env*", "*.env.example"):
            for f in self.root.glob(pattern):
                if f.is_file():
                    content = f.read_text(encoding="utf-8", errors="ignore")
                    for line in content.split("\n"):
                        line = line.strip()
                        if line and "=" in line and not line.startswith("#"):
                            key = line.split("=")[0].strip()
                            if key:
                                self.env_keys.append(key)

    def _scan_ci(self):
        """Look for CI/CD workflow files."""
        for pattern in (".github/workflows/*.yml", ".github/workflows/*.yaml"):
            for f in self.root.glob(pattern):
                self.ci_workflows.append(f.name)

    def _scan_config(self):
        """Look for known config files."""
        for name in (".env.example", "Dockerfile", "Makefile",
                     "docker-compose.yml", ".gitignore", ".nvmrc",
                     ".node-version", "tsconfig.json", "vite.config.ts",
                     "next.config.js", "tailwind.config.js",
                     "pyproject.toml", "Cargo.toml", "go.mod",
                     "requirements.txt", "Gemfile"):
            path = self.root / name
            if path.is_file():
                self.config_files.append(name)

    def _detect_languages(self):
        """Detect programming languages from file extensions."""
        ext_map = {
            ".ts": "TypeScript", ".tsx": "TypeScript (React)",
            ".js": "JavaScript", ".jsx": "JavaScript (React)",
            ".py": "Python", ".go": "Go", ".rs": "Rust",
            ".java": "Java", ".rb": "Ruby", ".php": "PHP",
            ".cs": "C#", ".swift": "Swift", ".kt": "Kotlin",
            ".vue": "Vue", ".svelte": "Svelte", ".css": "CSS",
            ".scss": "SCSS", ".sql": "SQL",
        }
        found = set()
        for f in self.root.rglob("*"):
            if f.is_file() and f.suffix in ext_map:
                found.add(ext_map[f.suffix])
        self.languages = sorted(found)

    def get_project_name(self) -> str:
        # Prefer the README H1 (e.g. "# LifeSocial") — package.json "name"
        # is often a stale scaffolding slug (e.g. "lifestats-app").
        readme = self.root / "README.md"
        if readme.is_file():
            try:
                for line in readme.read_text(encoding="utf-8").splitlines():
                    if line.startswith("# ") and len(line.strip()) > 2:
                        return line.strip()[2:].strip()
            except (OSError, UnicodeDecodeError):
                pass
        return (self.pkg.get("name", "").replace("-", " ").title()
                or self.root.name)

    def get_description(self) -> str:
        return self.pkg.get("description", "")

    def get_version(self) -> str:
        return self.pkg.get("version", "0.1.0")


# ═══════════════════════════════════════════════════════════════════════
#  Developer Manual Builder
# ═══════════════════════════════════════════════════════════════════════


def _build_developer_manual(repo_root: str, output_path: str,
                            page_map: Optional[dict] = None):
    """
    Generate a full 13-section developer manual PDF from a repo scan.

    Sections (per Lifewood Developer Manual spec):
      1.0 Overview & Architecture
      2.0 Prerequisites
      3.0 Project Setup
      4.0 Code Architecture
      5.0 Component Reference
      6.0 Configuration Reference
      7.0 Data & Auth Flow
      8.0 Extending the Platform
      9.0 Commands & Workflow
     10.0 Troubleshooting
     11.0 Glossary
    """
    print(f"Scanning repo: {repo_root}")
    scanner = RepoScanner(repo_root).scan()

    project_name = scanner.get_project_name()
    description = scanner.get_description()
    version = scanner.get_version()

    print(f"  Project: {project_name} v{version}")
    print(f"  Languages: {', '.join(scanner.languages)}")
    print(f"  Config files: {len(scanner.config_files)}")
    print(f"  CI workflows: {len(scanner.ci_workflows)}")

    # ── Section list + page map for TOC ──────────────────────────
    sections = [
        "1.0  Overview & Architecture",
        "2.0  Prerequisites",
        "3.0  Project Setup",
        "4.0  Code Architecture",
        "5.0  Component Reference",
        "6.0  Configuration Reference",
        "7.0  Data & Auth Flow",
        "8.0  Extending the Platform",
        "8.1  Modifying Components & Verification",
        "9.0  Commands & Workflow",
        "10.0 Troubleshooting",
        "11.0 Glossary",
    ]
    # Page map: computed from the first pass (see build_developer_manual),
    # so ToC dot-leader numbers match the real rendered pages.
    page_map = page_map or {}

    # 1. Write spec lock
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    PdfSpecLock.write_spec_lock(
        str(OUTPUT_DIR),
        title=f"{project_name} — Developer Manual",
        audience="developer",
        page_count=22,
        sections=sections,
    )

    # 2. Build PDF
    pdf = LifewoodPDF(
        f"{project_name}",
        subtitle="Developer Manual",
        audience="developer",
        date_str=DATE,
        variant="swiss",  # clean, dense, reference-grade
    )

    # ── Cover (page 1) ───────────────────────────────────────────
    pdf.add_cover()

    # ── TOC with dot leaders (page 2) ────────────────────────────
    pdf.add_toc(sections, page_map=page_map)

    # ═════════════════════════════════════════════════════════════
    # 1.0 Overview & Architecture
    # ═════════════════════════════════════════════════════════════
    overview_desc = (
        description or f"{project_name} is a {', '.join(scanner.languages[:3])} "
        "application. See the sections below for setup, architecture, "
        "and development workflow details."
    )
    stack_rows = [
        ["Frontend", "" if not scanner.languages else scanner.languages[0],
         "User interface & client logic"],
        ["Backend", "TBD from repo scan",
         "API & business logic"],
        ["Database", "TBD from repo scan",
         "Data persistence"],
        ["Build", "", "Build toolchain"],
        ["Hosting", "", "Deployment target"],
    ]
    # Fill in what we know from package.json
    if scanner.pkg:
        deps = scanner.pkg.get("dependencies", {})
        dev_deps = scanner.pkg.get("devDependencies", {})
        all_deps = {**deps, **dev_deps}
        if "react" in all_deps:
            stack_rows[0][1] = f"React {all_deps.get('react', '')}"
        if "next" in all_deps or "next" in dev_deps:
            stack_rows[1][1] = "Next.js"
            stack_rows[4][1] = "Vercel"
        if "vite" in dev_deps:
            stack_rows[3][1] = f"Vite {dev_deps.get('vite', '')}"
        if "supabase" in all_deps or "@supabase" in all_deps:
            stack_rows[2][1] = "Supabase / PostgreSQL"

    pdf.add_mixed_content_page("1.0", "Overview & Architecture", [
        ("body", f"{project_name} — {overview_desc}"),
        ("table", ["Layer", "Technology", "Purpose"], stack_rows),
        ("body", "Architecture diagram: The system follows a standard "
         "client-server architecture. The frontend communicates with "
         "the backend via REST API or direct database queries (Supabase). "
         "Authentication flows through Supabase Auth. Static assets and "
         "API routes are served via the hosting provider's edge network."),
    ])

    # ═════════════════════════════════════════════════════════════
    # 2.0 Prerequisites
    # ═════════════════════════════════════════════════════════════
    prereq_table = [
        ["Node.js", ">=18", "node --version"],
        ["npm / pnpm / yarn", "Latest stable", "npm --version"],
        ["Git", ">=2.30", "git --version"],
        ["Supabase account", "Any", "supabase.com"],
    ]
    # Detect package manager
    pkg_manager = "npm"
    if (Path(repo_root) / "pnpm-lock.yaml").is_file():
        pkg_manager = "pnpm"
        prereq_table[1] = ["pnpm", ">=8", "pnpm --version"]
    elif (Path(repo_root) / "yarn.lock").is_file():
        pkg_manager = "yarn"
        prereq_table[1] = ["yarn", ">=1.22", "yarn --version"]

    pdf.add_mixed_content_page("2.0", "Prerequisites", [
        ("body", "Ensure the following tools are installed before setting "
         "up the project:"),
        ("table", ["Tool", "Required Version", "Verify With"], prereq_table),
        ("callout", "Note",
         "If you use nvm (Node Version Manager), run nvm use to pick "
         "the correct Node version from .nvmrc if present."),
    ])

    # ═════════════════════════════════════════════════════════════
    # 3.0 Project Setup
    # ═════════════════════════════════════════════════════════════
    setup_steps = [
        f"Clone the repository: git clone <repo-url> && cd {scanner.root.name}",
        f"Install dependencies: {pkg_manager} install",
        "Copy environment file: cp .env.example .env",
        "Fill in environment variables (see Section 6.0)",
        f"Start dev server: {pkg_manager} run dev",
    ]
    expected_outcomes = [
        "Verify directory exists locally",
        "node_modules/ created, no errors",
        ".env file created",
        "App connects to backend services",
        "Browser opens at localhost:5173 or similar",
    ]
    setup_table = [[s, o] for s, o in zip(setup_steps, expected_outcomes)]

    # Detect specific dev command
    dev_cmd = scanner.scripts.get("dev", f"{pkg_manager} run dev")
    build_cmd = scanner.scripts.get("build", f"{pkg_manager} run build")

    pdf.add_mixed_content_page("3.0", "Project Setup", [
        ("body", "Follow these steps to get the project running locally "
         "for the first time:"),
        ("table", ["Step", "Expected Outcome"], setup_table),
        ("code", f"{pkg_manager} install\n{dev_cmd}",
         f"Quick start ({pkg_manager})"),
        ("body", "If running the dev server for the first time, expect "
         "a short delay for dependency resolution and Vite/Rspack "
         "pre-bundling."),
    ])

    # ═════════════════════════════════════════════════════════════
    # 4.0 Code Architecture
    # ═════════════════════════════════════════════════════════════
    dir_tree_text = "\n".join(scanner.dir_tree[:12]) if scanner.dir_tree else (
        "src/\n  components/\n  pages/\n  config/\n  styles/\n"
    )
    pdf.add_mixed_content_page("4.0", "Code Architecture", [
        ("body", f"The project root contains {scanner.file_count} source files "
         f"across {len(scanner.languages) if scanner.languages else 'several'} "
         "languages. Key directories:"),
        ("code", dir_tree_text, "Directory tree"),
        ("body", "Architecture flow: entry point → routes → page components "
         "→ shared child components; data flows API/database → service "
         "layer → component state → render."),
    ])

    # ═════════════════════════════════════════════════════════════
    # 5.0 Component Reference
    # ═════════════════════════════════════════════════════════════
    # Try to find key components from src/
    src_dir = Path(repo_root) / "src"
    components = []
    if src_dir.is_dir():
        comp_dir = src_dir / "components"
        if comp_dir.is_dir():
            for f in sorted(comp_dir.iterdir()):
                if f.suffix in (".tsx", ".ts", ".jsx", ".js") and not f.name.startswith("_"):
                    components.append(f.stem)
        pages_dir = src_dir / "pages"
        if pages_dir.is_dir():
            for f in sorted(pages_dir.iterdir()):
                if f.suffix in (".tsx", ".ts", ".jsx", ".js") and not f.name.startswith("_"):
                    components.append(f.stem)

    if components:
        comp_body = [f"Key components found in src/components/ and src/pages/:"]
        comp_rows = []
        for c in components[:12]:
            comp_rows.append([c, "TBD — inspect component for props", "—"])
        pdf.add_mixed_content_page("5.0", "Component Reference", [
            ("body", "The following components implement the application's UI. "
             "Each entry shows the component name and its props interface."),
            ("table", ["Component", "Purpose", "Props"], comp_rows),
            ("callout", "Note",
             "Run a full scan with src/ inspection for complete props. "
             "The table above reflects auto-detected file names."),
        ])
    else:
        pdf.add_mixed_content_page("5.0", "Component Reference", [
            ("body", "No components directory detected under src/. "
             "The application may use a flat file structure or "
             "page-based routing instead of a components/ folder."),
            ("body", "For a complete component inventory, run: "
             f"find {scanner.root.name}/src -name '*.tsx' -o -name '*.ts' | head -30"),
        ])

    # ═════════════════════════════════════════════════════════════
    # 6.0 Configuration Reference
    # ═════════════════════════════════════════════════════════════
    env_rows = []
    for key in scanner.env_keys[:12]:
        env_rows.append([key, "string", "Yes", "TBD — check .env.example",
                        "Runtime configuration value"])

    if not env_rows:
        env_rows = [
            ["VITE_SUPABASE_URL", "string", "Yes",
             "https://your-project.supabase.co",
             "Supabase project URL for database & auth"],
            ["VITE_SUPABASE_ANON_KEY", "string", "Yes",
             "eyJhbGciOiJIUzI1NiIs...",
             "Public anon key for Supabase client"],
        ]

    pdf.add_mixed_content_page("6.0", "Configuration Reference", [
        ("body", "The application is configured through environment variables "
         "defined in .env (development) or the hosting dashboard "
         "(production)."),
        ("table", ["Name", "Type", "Required", "Example", "Effect"],
         env_rows),
        ("callout", "Warning",
         "Never commit .env files. Never expose service_role keys. "
         "Use the hosting dashboard for production environment variables."),
    ])

    # ═════════════════════════════════════════════════════════════
    # 7.0 Data & Auth Flow
    # ═════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("7.0", "Data & Auth Flow", [
        ("body", "Data flows through a unidirectional pipeline: "
         "UI event → service/API call → response → state update → re-render."),
        ("steps", [
            "Component mounts or user triggers an action.",
            "Service layer makes the request (Supabase / fetch / axios).",
            "Response returns as JSON or Supabase query result.",
            "State is updated via a React setter or query cache.",
            "React re-renders affected components with the new data.",
        ]),
        ("body", "Authentication flow:"),
        ("steps", [
            "User enters email/password on the login page.",
            "Supabase Auth validates credentials, returns a session JWT.",
            "JWT is stored in the browser and sent with subsequent API "
            "requests via the Authorization header.",
            "Supabase RLS policies use the JWT's user ID for row filtering.",
            "On logout, the JWT is cleared and the UI returns to login state.",
        ]),
    ])

    # ═════════════════════════════════════════════════════════════
    # 8.0 Extending the Platform
    # ═════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("8.0", "Extending the Platform", [
        ("body", "Common extension tasks follow a recipe pattern: "
         "goal → steps → files touched → verification."),
        ("body", "Recipe: Add a new page"),
        ("steps", [
            f"Create a new file in src/pages/ or app/ directory.",
            "Define the page component and add its route to the router.",
            "Add the navigation link in the sidebar or nav bar.",
            "Verify: navigate to the new route in the browser.",
        ]),
        ("body", "Recipe: Add a new API endpoint"),
        ("steps", [
            "Create the serverless function or API route file.",
            "Define the request handler with input validation.",
            "Connect the frontend to the new endpoint.",
            "Verify: call the endpoint and check the response.",
        ]),
    ])

    pdf.add_mixed_content_page("8.1", "Modifying Components & Verification", [
        ("body", "Recipe: Modify an existing component"),
        ("steps", [
            "Locate the component file in src/components/.",
            "Identify the props interface and state management.",
            "Make the change following existing patterns.",
            f"Run {pkg_manager} run lint, then {build_cmd} to verify.",
        ]),
        ("body", "Every extension ships with verification: run the lint and "
                 "build commands, check the changed flow in the browser, "
                 "and keep the change small enough for a clean review."),
    ])

    # ═════════════════════════════════════════════════════════════
    # 9.0 Commands & Workflow
    # ═════════════════════════════════════════════════════════════
    cmd_table = []
    for name, script_cmd in list(scanner.scripts.items())[:8]:
        cmd_table.append([f"{pkg_manager} run {name}", script_cmd[:60],
                         f"Run {name} task"])
    if not cmd_table:
        cmd_table = [
            [f"{pkg_manager} run dev", "Start dev server", "Development"],
            [f"{pkg_manager} run build", "Production build", "Pre-deploy"],
            [f"{pkg_manager} run lint", "Lint check", "Code quality"],
            [f"{pkg_manager} run preview", "Preview built app", "Pre-deploy"],
        ]

    pdf.add_mixed_content_page("9.0", "Commands & Workflow", [
        ("body", "The following commands are defined in package.json scripts:"),
        ("table", ["Command", "Action", "When to Run"], cmd_table),
        ("body", "Branch & commit conventions:"),
        ("steps", [
            "Branch from main: git checkout -b feat/my-feature",
            "Make changes in small, focused commits.",
            "Write commit messages in conventional format: "
            "feat: add user dashboard, fix: resolve login redirect",
            "Push branch and open PR against main.",
            "Ensure CI passes (lint + build + tests).",
            "Squash-merge into main with a clean commit message.",
        ]),
    ])

    # ═════════════════════════════════════════════════════════════
    # 10.0 Troubleshooting
    # ═════════════════════════════════════════════════════════════
    pdf.add_mixed_content_page("10.0", "Troubleshooting", [
        ("body", "Common failures a new developer encounters on day one:"),
        ("table", ["Symptom", "Likely Cause", "Fix"],
         [
             ["npm install fails with EACCES",
              "Permission error on node_modules",
              "Use nvm or reinstall Node.js via package manager"],
             ["Dev server won't start — port in use",
              "Another process on port 5173 / 3000",
              "Kill the process or set PORT env var"],
             ["Blank page, no errors",
              "Missing .env file or wrong variables",
              "Copy .env.example to .env and fill values"],
             ["Auth: login fails silently",
              "Wrong Supabase URL or anon key",
              "Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"],
             ["Data not loading (console: 401/403)",
              "Supabase RLS policy missing or wrong",
              "Add appropriate SELECT policy for the table"],
             ["TypeScript build errors",
              "Type mismatch after dependency update",
              "Run tsc --noEmit to see all errors at once"],
             ["npm run build fails with out of memory",
              "Node heap too small for large builds",
              "Set NODE_OPTIONS=--max-old-space-size=4096"],
             ["Changes not reflecting in browser",
              "Browser cache or HMR issue",
              "Hard refresh (Cmd+Shift+R) or clear cache"],
         ]),
    ])

    # ═════════════════════════════════════════════════════════════
    # 11.0 Glossary
    # ═════════════════════════════════════════════════════════════
    glossary = [
        ["RLS", "Row-Level Security — PostgreSQL feature that restricts "
         "which rows a user can query based on their auth UID."],
        ["SPA", "Single Page Application — a web app that loads one HTML "
         "page and dynamically updates content via JavaScript."],
        ["Supabase", "Open-source Firebase alternative — provides "
         "PostgreSQL database, auth, and realtime subscriptions."],
        ["Vite", "Next-generation build tool — fast dev server with HMR "
         "and optimized production builds via Rollup."],
        ["JWT", "JSON Web Token — compact, URL-safe token format for "
         "representing claims between parties. Used for auth sessions."],
    ]

    pdf.add_mixed_content_page("11.0", "Glossary", [
        ("body", "Project-specific terminology and abbreviations used "
         "throughout this manual:"),
        ("table", ["Term", "Definition"], glossary),
    ])

    # Save
    pdf.save(output_path)
    print(f"[OK] Developer manual: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    return output_path


def _find_section_pages(path: str, sections: list) -> dict:
    """Map section number -> 1-indexed page via its bare kicker line."""
    import fitz

    doc = fitz.open(path)
    mapping = {}
    try:
        for pno, page in enumerate(doc, 1):
            text = page.get_text()
            if "cont." in text.lower():
                continue
            for line in text.splitlines():
                line = line.strip()
                if line in [s.split()[0] for s in sections] \
                        and line not in mapping:
                    mapping[line] = pno
    finally:
        doc.close()
    return mapping


def build_developer_manual(repo_root: str, output_path: str):
    """Two-pass build: pass 1 renders without ToC page numbers, pass 2
    rebuilds with the real section->page map (dot leaders + numbers)."""
    _build_developer_manual(repo_root, output_path, page_map=None)
    sections = [
        "1.0  Overview & Architecture", "2.0  Prerequisites",
        "3.0  Project Setup", "4.0  Code Architecture",
        "5.0  Component Reference", "6.0  Configuration Reference",
        "7.0  Data & Auth Flow", "8.0  Extending the Platform",
        "8.1  Modifying Components & Verification",
        "9.0  Commands & Workflow", "10.0 Troubleshooting",
        "11.0 Glossary",
    ]
    page_map = _find_section_pages(output_path, sections)
    _build_developer_manual(repo_root, output_path, page_map=page_map)
    print(f"     ToC page map: {page_map}")
    return output_path


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Generate Lifewood-branded developer manual PDF"
    )
    parser.add_argument("repo_root", nargs="?", default=os.getcwd(),
                        help="Path to repository root (default: cwd)")
    parser.add_argument("-o", "--output",
                        default=str(OUTPUT_DIR / "Developer_Manual.pdf"),
                        help="Output PDF path")
    parser.add_argument("--just-steps", action="store_true",
                        help="Print the repo scan steps without generating PDF")
    args = parser.parse_args()

    if args.just_steps:
        scanner = RepoScanner(args.repo_root).scan()
        print(f"Project: {scanner.get_project_name()}")
        print(f"Version: {scanner.get_version()}")
        print(f"Languages: {', '.join(scanner.languages)}")
        print(f"Scripts: {list(scanner.scripts.keys())}")
        print(f"Env vars: {scanner.env_keys}")
        print(f"Config files: {scanner.config_files}")
        print(f"CI: {scanner.ci_workflows}")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    build_developer_manual(args.repo_root, args.output)


if __name__ == "__main__":
    main()
