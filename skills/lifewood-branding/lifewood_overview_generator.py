#!/usr/bin/env python3
"""
Lifewood Overview Generator -- scans Lifewood branding + ppt-master skills
and produces a structured PDF overview of the entire codebase.

What it does:
    1. Scans the Lifewood branding skill directory for files/modules/classes
    2. Scans the ppt-master skill directory for capabilities
    3. Generates a 7-page overview PDF with cover, components, pipelines,
       brand rules, and quick reference
    4. Also generates a plain Markdown version for quick reference

Usage:
    python lifewood_overview_generator.py
    # Produces lifewood_overview.pdf + lifewood_overview.md in temp dir

    # Or import:
    from lifewood_overview_generator import LifewoodOverviewGenerator
    gen = LifewoodOverviewGenerator()
    pdf_path = gen.generate_overview_pdf("output/overview.pdf")
    md_text = gen.generate_overview_markdown()
"""

from __future__ import annotations

import ast
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Own PDF builder -- uses LifewoodPDF for branded output
# ---------------------------------------------------------------------------

try:
    from lifewood_pdf_builder import LifewoodPDF
except ImportError:
    LifewoodPDF = None  # type: ignore

from lifewood_pdf_design_system import (
    PDF_CASTLETON_GREEN,
    PDF_DARK_SERPENT,
    PDF_SAFFRON,
    PDF_SEA_SALT,
    PDF_MARGIN_L,
    PDF_CONTENT_W,
)

# Local layout constants (not in design system -- PDF builder owns these)
PDF_BODY_SIZE = 10
PDF_BODY_LEADING = 5.0

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SKILL_DIR = Path(__file__).resolve().parent
PPT_MASTER_DIR = (
    Path.home()
    / ".config"
    / "opencode"
    / "skills"
    / "ppt-master-src"
    / "skills"
    / "ppt-master"
)
OUTPUT_DIR = Path(
    os.environ.get("TEMP", os.environ.get("TMPDIR", "/tmp"))
) / "opencode"

# ---------------------------------------------------------------------------
# AST-based code analysis
# ---------------------------------------------------------------------------


def _extract_classes_from_file(filepath: str) -> List[Dict[str, str]]:
    """Extract class names and their docstrings from a Python file.

    Uses the ``ast`` module for safe, import-free parsing.

    Args:
        filepath: Absolute path to a .py file.

    Returns:
        List of dicts with keys 'name' and 'docstring'.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read())
    except (SyntaxError, UnicodeDecodeError, OSError):
        return []

    classes = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            doc = ast.get_docstring(node) or ""
            classes.append({
                "name": node.name,
                "docstring": doc.split(".")[0].strip() if doc else "",
            })
    return classes


def _extract_functions_from_file(filepath: str) -> List[Dict[str, str]]:
    """Extract top-level function names and their docstrings.

    Args:
        filepath: Absolute path to a .py file.

    Returns:
        List of dicts with keys 'name' and 'docstring'.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read())
    except (SyntaxError, UnicodeDecodeError, OSError):
        return []

    functions = []
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            doc = ast.get_docstring(node) or ""
            functions.append({
                "name": node.name,
                "docstring": doc.split(".")[0].strip() if doc else "",
            })
    return functions


# ---------------------------------------------------------------------------
# Markdown parsing helpers
# ---------------------------------------------------------------------------


def _extract_skill_name(lines: List[str]) -> str:
    """Extract skill name from first heading in markdown."""
    for line in lines:
        if line.startswith("# ") and not line.startswith("# PDF"):
            return line.lstrip("# ").strip()
    return "Lifewood Branding"


def _extract_skill_description(lines: List[str]) -> str:
    """Extract first meaningful paragraph after the first heading."""
    found_heading = False
    for line in lines:
        if line.startswith("# "):
            found_heading = True
            continue
        if found_heading and line.strip() and not line.startswith("#"):
            # Skip frontmatter
            if line.startswith("---"):
                continue
            return line.strip()
    return ""


def _count_rules(lines: List[str]) -> int:
    """Count numbered rules or checklist items in the markdown."""
    count = 0
    in_checklist = False
    for line in lines:
        # Detect checklist section
        if "checklist" in line.lower() or "quick checklist" in line.lower():
            in_checklist = True
            continue
        if in_checklist:
            # Count numbered items like "1." or "- [ ]"
            if re.match(r"^\d+\.", line.strip()):
                count += 1
            elif line.strip().startswith("- ["):
                count += 1
            elif line.startswith("---") or line.startswith("#"):
                in_checklist = False
    # Fallback: count all numbered list items in the file
    if count == 0:
        for line in lines:
            if re.match(r"^\d+\.\s", line.strip()):
                count += 1
    return count


def _extract_color_palette(lines: List[str]) -> List[Dict[str, str]]:
    """Extract color palette entries from markdown table."""
    colors = []
    in_color_table = False
    for line in lines:
        if "| Name | Hex | Role |" in line:
            in_color_table = True
            continue
        if in_color_table:
            if line.startswith("|---"):
                continue
            if not line.startswith("|"):
                in_color_table = False
                continue
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 3:
                colors.append({
                    "name": parts[0],
                    "hex": parts[1],
                    "role": parts[2],
                })
    return colors


def _extract_output_playbooks(lines: List[str]) -> List[str]:
    """Extract output playbook section headings."""
    playbooks = []
    in_playbooks = False
    for line in lines:
        if "## Output playbooks" in line:
            in_playbooks = True
            continue
        if in_playbooks and line.startswith("### "):
            pb = line.replace("###", "").strip()
            playbooks.append(pb)
        if in_playbooks and line.startswith("---") and playbooks:
            break
    return playbooks


def _infer_module_purpose(filename: str, classes: List[Dict[str, str]]) -> str:
    """Infer module purpose from class docstrings or filename."""
    # First try class docstrings
    descriptions = [c["docstring"] for c in classes if c["docstring"]]
    if descriptions:
        return descriptions[0]

    # Fallback: filename-based description
    name = Path(filename).stem
    name_map = {
        "lifewood_deck_builder": "PowerPoint deck builder with Lifewood branding",
        "lifewood_pdf_design_system": "PDF design constants, color utilities, and spec lock",
        "lifewood_pdf_builder": "PDF document builder with Lifewood branding",
        "lifewood_overview_generator": "Codebase overview generator (this module)",
    }
    return name_map.get(name, f"Lifewood module: {name}")


# ===================================================================
# LifewoodOverviewGenerator
# ===================================================================


class LifewoodOverviewGenerator:
    """Scans Lifewood branding + ppt-master skills and generates
    a structured overview PDF + Markdown reference.

    Args:
        skill_dir: Path to the Lifewood branding skill directory.
            Defaults to the directory containing this script.
    """

    def __init__(self, skill_dir: Optional[str] = None):
        self.skill_dir = Path(skill_dir).resolve() if skill_dir else SKILL_DIR
        self._manifest: Optional[Dict] = None
        self._ppt_manifest: Optional[Dict] = None

    # ------------------------------------------------------------------
    # Scan methods
    # ------------------------------------------------------------------

    def scan_skill_directory(self) -> Dict:
        """Scan the Lifewood branding skill directory for all components.

        Returns:
            Dict with keys:
            - 'modules': list of .py files found
            - 'assets': list of asset files (png, jpg, svg)
            - 'docs': list of .md files
            - 'key_classes': list of class names
            - 'key_functions': list of function names
            - 'skill_name': extracted from SKILL.md
            - 'skill_description': extracted from SKILL.md
            - 'rules_count': count of numbered rules
            - 'playbooks': list of output playbooks
            - 'colors': extracted color palette
            - 'module_details': detailed class/function info per module
        """
        result: Dict = {
            "modules": [],
            "assets": [],
            "docs": [],
            "key_classes": [],
            "key_functions": [],
            "skill_name": "Lifewood Branding",
            "skill_description": "",
            "rules_count": 0,
            "playbooks": [],
            "colors": [],
            "module_details": [],
        }

        if not self.skill_dir.is_dir():
            return result

        # Scan files
        for entry in sorted(self.skill_dir.iterdir()):
            if entry.is_dir() and entry.name != "__pycache__":
                # Recursively list subdirectories (assets)
                for sub in sorted(entry.iterdir()):
                    if sub.suffix.lower() in (".png", ".jpg", ".jpeg", ".svg"):
                        result["assets"].append(sub.name)
            elif entry.suffix == ".py":
                result["modules"].append(entry.name)
                # Extract classes and functions
                classes = _extract_classes_from_file(str(entry))
                functions = _extract_functions_from_file(str(entry))
                for c in classes:
                    result["key_classes"].append(c["name"])
                for f in functions:
                    result["key_functions"].append(f["name"])
                result["module_details"].append({
                    "filename": entry.name,
                    "classes": classes,
                    "functions": functions,
                    "purpose": _infer_module_purpose(entry.name, classes),
                })
            elif entry.suffix == ".md":
                result["docs"].append(entry.name)

        # Parse SKILL.md
        skill_md_path = self.skill_dir / "SKILL.md"
        if skill_md_path.is_file():
            try:
                with open(skill_md_path, "r", encoding="utf-8") as f:
                    md_lines = f.readlines()
                result["skill_name"] = _extract_skill_name(md_lines)
                result["skill_description"] = _extract_skill_description(md_lines)
                result["rules_count"] = _count_rules(md_lines)
                result["playbooks"] = _extract_output_playbooks(md_lines)
                result["colors"] = _extract_color_palette(md_lines)
            except (OSError, UnicodeDecodeError):
                pass

        self._manifest = result
        return result

    def scan_ppt_master(self) -> Dict:
        """Scan ppt-master skill for key capabilities.

        Looks in:
            ~/.config/opencode/skills/ppt-master-src/skills/ppt-master/

        Returns:
            Dict with keys:
            - 'exists': bool
            - 'scripts_count': int
            - 'workflows': list of workflow .md filenames
            - 'templates_available': list of template directories
            - 'scripts_list': list of .py filenames in scripts/
        """
        result: Dict = {
            "exists": False,
            "scripts_count": 0,
            "scripts_list": [],
            "workflows": [],
            "templates_available": [],
        }

        ppt_dir = Path(PPT_MASTER_DIR)
        if not ppt_dir.is_dir():
            self._ppt_manifest = result
            return result

        result["exists"] = True

        # Scripts
        scripts_dir = ppt_dir / "scripts"
        if scripts_dir.is_dir():
            py_files = sorted(
                f.name for f in scripts_dir.iterdir()
                if f.suffix == ".py"
            )
            result["scripts_list"] = py_files
            result["scripts_count"] = len(py_files)

        # Workflows
        workflows_dir = ppt_dir / "workflows"
        if workflows_dir.is_dir():
            for entry in sorted(workflows_dir.iterdir()):
                if entry.suffix == ".md":
                    result["workflows"].append(entry.stem)
                elif entry.is_dir():
                    # Also include sub-markdown files in subdirs
                    for sub in sorted(entry.rglob("*.md")):
                        rel = sub.relative_to(workflows_dir)
                        result["workflows"].append(str(rel.with_suffix("")))

        # Templates
        templates_dir = ppt_dir / "templates"
        if templates_dir.is_dir():
            for entry in sorted(templates_dir.iterdir()):
                if entry.is_dir():
                    result["templates_available"].append(entry.name)

        self._ppt_manifest = result
        return result

    # ------------------------------------------------------------------
    # PDF generation
    # ------------------------------------------------------------------

    def generate_overview_pdf(self, output_path: str) -> str:
        """Generate a complete overview PDF using LifewoodPDF.

        Pages:
            1. Cover: "Lifewood Branding System - Codebase Overview"
            2. Overview: what this system is, what it does
            3. Components: scanned modules, classes, and their purposes
            4. PPT Pipeline: how to generate PPTX (deck_builder + ppt-master)
            5. PDF Pipeline: how to generate PDF (pdf_builder design)
            6. Brand Rules Summary: colors, fonts, logo, numbering
            7. Quick Reference: commands to generate outputs

        Args:
            output_path: Where to save the PDF.

        Returns:
            Absolute path to generated PDF.

        Raises:
            ImportError: If lifewood_pdf_builder is not available.
        """
        if LifewoodPDF is None:
            raise ImportError(
                "Cannot generate PDF: lifewood_pdf_builder not available. "
                "Run: pip install fpdf2"
            )

        # Ensure manifests are populated
        manifest = self._manifest or self.scan_skill_directory()
        ppt = self._ppt_manifest or self.scan_ppt_master()

        pdf = LifewoodPDF(
            "Lifewood Branding System",
            subtitle="Codebase Overview & Reference",
            variant="swiss",
        )

        # ---- Page 1: Cover ----
        pdf.add_cover()

        # ---- Page 2: Overview + Components (merged, dense) ----
        details = manifest.get("module_details", [])
        module_table = []
        for mod in details:
            purpose = (mod.get("purpose", "") or "")[:60]
            classes = mod.get("classes", [])
            funcs = mod.get("functions", [])
            n_classes = len(classes)
            n_funcs = len(funcs)
            module_table.append([
                mod.get("filename", "?"),
                purpose,
                str(n_classes) if n_classes else "—",
                str(n_funcs) if n_funcs else "—",
            ])

        pdf.add_mixed_content_page("1.0", "System Overview", [
            ("body",
             f"Lifewood Branding System — a codebase encoding Lifewood's "
             f"visual identity for on-brand deliverables (PPTX, PDF, Word, "
             f"images, video). {manifest.get('skill_description', '')[:180]}"),
            ("table",
             ["Module", "Purpose", "Classes", "Functions"],
             module_table),
            ("spacer", 2),
            ("body",
             f"Python modules: {len(manifest.get('modules', []))}  |  "
             f"Asset files: {len(manifest.get('assets', []))}  |  "
             f"Brand rules: {manifest.get('rules_count', 0)}  |  "
             f"Output playbooks: {len(manifest.get('playbooks', []))}"),
        ])

        # ---- Page 3: PPT Pipeline (dense) ----
        ppt_table = [["LifewoodDeck (deck_builder)", "python-pptx shapes, "
                     "12+ layouts, ContentAnalyzer"]]
        if ppt.get("exists"):
            ppt_table.append(
                ["PPT-Master integration",
                 f"{ppt.get('scripts_count', 0)} scripts available"]
            )
            wf = ppt.get("workflows", [])
            if wf:
                ppt_table.append(
                    ["Workflows", ", ".join(wf[:5])]
                )
            tmpl = ppt.get("templates_available", [])
            if tmpl:
                ppt_table.append(
                    ["Templates", ", ".join(tmpl)]
                )

        pdf.add_mixed_content_page("2.0", "PPT Pipeline", [
            ("body",
             "Generate branded PowerPoint presentations using LifewoodDeck "
             "with 12+ slide layout presets. PPT-Master provides additional "
             "SVG-to-PPTX pipeline for complex decks."),
            ("table", ["Component", "Capability"], ppt_table),
            ("code",
             "from lifewood_deck_builder import LifewoodDeck\n"
             "deck = LifewoodDeck(\"Title\", \"Subtitle\")\n"
             "deck.add_cover()\n"
             'deck.add_toc([\"1.0 Section\", \"2.0 Section\"])\n'
             "deck.save(\"output.pptx\")",
             "Python — Generate PPTX"),
        ])

        # ---- Page 4: PDF Pipeline + Brand Rules (merged) ----
        colors = manifest.get("colors", [])
        color_rows = []
        for c in colors:
            color_rows.append([
                c.get("name", "?"),
                c.get("hex", "?"),
                c.get("role", ""),
            ])

        pdf.add_mixed_content_page("3.0", "PDF Pipeline & Brand Rules", [
            ("body",
             "Generate branded PDF documents using LifewoodPDF with fpdf2. "
             "PowerPoint 16:9 canvas (13.333x7.5 in), Page X of Y numbering that starts after the ToC, logo bottom-right."),
            ("code",
             "from lifewood_pdf_builder import LifewoodPDF\n"
             'pdf = LifewoodPDF("Document Title")\n'
             'pdf.add_content_page("1.0", "Heading", ["Body"])\n'
             "pdf.save(\"output.pdf\")",
             "Python — Generate PDF"),
            ("body",
             "Color palette (Lifewood brand):"),
            ("table", ["Name", "Hex", "Role"], color_rows),
            ("body",
             "Typography: Manrope throughout (fallback: Helvetica). "
             "Headings #046241 (700-800), subheadings #133020 (600), "
             "body #133020 (400). Logo bottom-right. Numbered heading "
             "system: 1.0, 1.1... Prepared by: Lifewood PH Team on cover. "
             "Page X of Y bottom-center on content pages only (cover & TOC unnumbered)."),
        ])

        # ---- Page 5: Quick Reference (dense) ----
        pdf.add_mixed_content_page("4.0", "Quick Reference", [
            ("code",
             "python lifewood_deck_builder.py \"Title\" -o deck.pptx\n"
             "python lifewood_deck_builder.py \"Title\" -o deck.pptx --pdf",
             "CLI — Generate outputs"),
            ("code",
             "# Developer manual (full 13-section)\n"
             "python build_developer_manual.py /path/to/repo\n\n"
             "# Admin manual (template)\n"
             "python build_admin_manual.py\n\n"
             "# Overview generator\n"
             "python lifewood_overview_generator.py",
             "CLI — Manual generators"),
            ("code",
             "# Brand color constants (from lifewood_pdf_design_system.py)\n"
             "PDF_PAPER = (245, 238, 219)       # #F5EEDB\n"
             "PDF_WHITE = (255, 255, 255)       # #FFFFFF\n"
             "PDF_SEA_SALT = (249, 247, 247)    # #F9F7F7\n"
             "PDF_CASTLETON_GREEN = (4, 98, 65) # #046241\n"
             "PDF_DARK_SERPENT = (19, 48, 32)   # #133020\n"
             "PDF_SAFFRON = (255, 179, 71)      # #FFB347\n"
             "PDF_EARTH_YELLOW = (255, 195, 112) # #FFC370",
             "Python — Color constants"),
            ("callout", "Note",
             "Run: python -m pytest test_overlap.py -v to verify PDF/PPT "
             "system separation (49 tests)."),
        ])

        abs_path = pdf.save(output_path)
        return abs_path

    # ------------------------------------------------------------------
    # Markdown generation
    # ------------------------------------------------------------------

    def generate_overview_markdown(self) -> str:
        """Generate overview in Markdown format (for quick reference).

        Returns:
            Markdown string describing the entire codebase.
        """
        manifest = self._manifest or self.scan_skill_directory()
        ppt = self._ppt_manifest or self.scan_ppt_master()

        lines: List[str] = []
        lines.append("# Lifewood Branding System \u2014 Codebase Overview")
        lines.append("")
        lines.append(
            f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )
        lines.append("")
        lines.append("---")
        lines.append("")

        # Overview section
        lines.append("## 1.0 System Overview")
        lines.append("")
        lines.append(
            f"**Skill:** {manifest.get('skill_name', 'Lifewood Branding')}"
        )
        lines.append("")
        lines.append(
            f"{manifest.get('skill_description', '')}"
        )
        lines.append("")
        lines.append(f"- **Python modules:** {len(manifest.get('modules', []))}")
        lines.append(f"- **Asset files:** {len(manifest.get('assets', []))}")
        lines.append(f"- **Brand rules:** {manifest.get('rules_count', 0)}")
        lines.append(f"- **Output playbooks:** {len(manifest.get('playbooks', []))}")
        lines.append("")

        # Components section
        lines.append("## 2.0 Codebase Components")
        lines.append("")

        details = manifest.get("module_details", [])
        if details:
            for mod in details:
                filename = mod.get("filename", "?")
                purpose = mod.get("purpose", "")
                lines.append(f"### {filename}")
                lines.append("")
                lines.append(f"{purpose}")
                lines.append("")

                classes = mod.get("classes", [])
                if classes:
                    lines.append("**Classes:**")
                    for c in classes:
                        doc = c.get("docstring", "")
                        if doc:
                            lines.append(f"  - `{c['name']}` \u2014 {doc}")
                        else:
                            lines.append(f"  - `{c['name']}`")
                    lines.append("")

                functions = mod.get("functions", [])
                if functions:
                    lines.append("**Functions:**")
                    for f in functions:
                        doc = f.get("docstring", "")
                        if doc:
                            lines.append(f"  - `{f['name']}` \u2014 {doc}")
                        else:
                            lines.append(f"  - `{f['name']}`")
                    lines.append("")
        else:
            lines.append("No Python modules found.")
            lines.append("")

        # Assets section
        assets = manifest.get("assets", [])
        if assets:
            lines.append("**Assets:**")
            for a in assets:
                lines.append(f"  - {a}")
            lines.append("")

        # PPT Pipeline
        lines.append("## 3.0 PPT Pipeline")
        lines.append("")
        lines.append(
            "Generate branded PowerPoint presentations using LifewoodDeck "
            "with 12+ slide layout presets."
        )
        lines.append("")
        lines.append("- `LifewoodDeck` class in `lifewood_deck_builder.py`")
        lines.append("- Native python-pptx shapes with full Lifewood branding")
        lines.append("- Smart layout engine (ContentAnalyzer)")
        lines.append("- PDF export via PowerPoint COM or LibreOffice")
        lines.append("")

        if ppt.get("exists"):
            lines.append("**PPT-Master Integration:**")
            lines.append(
                f"- Script count: {ppt.get('scripts_count', 0)}"
            )
            if ppt.get("workflows"):
                lines.append(f"- Workflows: {', '.join(ppt['workflows'])}")
            if ppt.get("templates_available"):
                lines.append(
                    f"- Templates: {', '.join(ppt['templates_available'])}"
                )
            lines.append("")

        # PDF Pipeline
        lines.append("## 4.0 PDF Pipeline")
        lines.append("")
        lines.append(
            "Generate branded PDF documents using LifewoodPDF with fpdf2."
        )
        lines.append("")
        lines.append("- `LifewoodPDF` class in `lifewood_pdf_builder.py`")
        lines.append("- PowerPoint 16:9 slide canvas (13.333x7.5 in) — A4 is forbidden")
        lines.append("- Page X of Y numbering (starts after ToC), logo bottom-right every page")
        lines.append("- Design constants in `lifewood_pdf_design_system.py`")
        lines.append("")

        # Brand Rules
        lines.append("## 5.0 Brand Rules Summary")
        lines.append("")

        colors = manifest.get("colors", [])
        if colors:
            lines.append("### Color Palette")
            lines.append("")
            lines.append("| Name | Hex | Role |")
            lines.append("|------|-----|------|")
            for c in colors:
                lines.append(
                    f"| {c.get('name', '')} | {c.get('hex', '')} | "
                    f"{c.get('role', '')} |"
                )
            lines.append("")

        lines.append("### Typography")
        lines.append("")
        lines.append("- **Font:** Manrope (Helvetica/Inter/Arial fallback)")
        lines.append("- **Headings:** Castleton Green #046241, 700-800 weight")
        lines.append("- **Subheadings:** Dark Serpent #133020, weight 600")
        lines.append("- **Body:** 12pt, Dark Serpent #133020, weight 400")
        lines.append("")

        lines.append("### Layout Rules")
        lines.append("")
        lines.append("- **Logo:** bottom-right (docs/slides), top-right (reels)")
        lines.append("- **Numbering:** 1.0, 1.1, 1.1.1, 2.0...")
        lines.append("- **Cover:** No page number, includes Prepared by + Date")
        lines.append("- **Cover & TOC:** No page numbers — numbering starts after the ToC")
        lines.append('- **Pages:** "Page X of Y" bottom-center (starts after ToC)')
        lines.append("- **Backgrounds:** Sea Salt #F9F7F7 or White preferred")
        lines.append("")

        # Quick Reference
        lines.append("## 6.0 Quick Reference")
        lines.append("")
        lines.append("### Generate PPTX")
        lines.append("")
        lines.append("```bash")
        lines.append('python lifewood_deck_builder.py "Title" --output deck.pptx')
        lines.append("```")
        lines.append("")
        lines.append("### Generate PDF")
        lines.append("")
        lines.append("```python")
        lines.append("from lifewood_pdf_builder import LifewoodPDF")
        lines.append('pdf = LifewoodPDF("Document Title")')
        lines.append("pdf.add_cover()")
        lines.append('pdf.add_content_page("1.0", "Heading", "Body text")')
        lines.append('pdf.save("output.pdf")')
        lines.append("```")
        lines.append("")
        lines.append("### Generate Overview")
        lines.append("")
        lines.append("```bash")
        lines.append("python lifewood_overview_generator.py")
        lines.append("```")
        lines.append("")

        # Color constants
        lines.append("### Brand Color Constants")
        lines.append("")
        lines.append("```python")
        lines.append("# From lifewood_pdf_design_system.py")
        lines.append("PDF_PAPER = (245, 238, 219)       # #F5EEDB")
        lines.append("PDF_WHITE = (255, 255, 255)       # #FFFFFF")
        lines.append("PDF_SEA_SALT = (249, 247, 247)    # #F9F7F7")
        lines.append("PDF_CASTLETON_GREEN = (4, 98, 65) # #046241")
        lines.append("PDF_DARK_SERPENT = (19, 48, 32)   # #133020")
        lines.append("PDF_SAFFRON = (255, 179, 71)      # #FFB347")
        lines.append("PDF_EARTH_YELLOW = (255, 195, 112) # #FFC370")
        lines.append("```")
        lines.append("")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------

    @property
    def manifest(self) -> Dict:
        """Lifewood skill manifest (lazy-loaded)."""
        if self._manifest is None:
            self.scan_skill_directory()
        return self._manifest or {}

    @property
    def ppt_manifest(self) -> Dict:
        """PPT-master manifest (lazy-loaded)."""
        if self._ppt_manifest is None:
            self.scan_ppt_master()
        return self._ppt_manifest or {}


# ===================================================================
# CLI entry point
# ===================================================================

def main() -> int:
    """Run the overview generator and save PDF + Markdown."""
    os.makedirs(str(OUTPUT_DIR), exist_ok=True)

    pdf_path = str(OUTPUT_DIR / "lifewood_overview.pdf")
    md_path = str(OUTPUT_DIR / "lifewood_overview.md")

    gen = LifewoodOverviewGenerator()

    # Scan first for display
    print("Scanning Lifewood branding skill...")
    manifest = gen.scan_skill_directory()
    print(f"  Modules: {len(manifest.get('modules', []))}")
    print(f"  Assets: {len(manifest.get('assets', []))}")
    print(f"  Classes: {len(manifest.get('key_classes', []))}")
    print(f"  Functions: {len(manifest.get('key_functions', []))}")
    print(f"  Rules: {manifest.get('rules_count', 0)}")
    print(f"  Playbooks: {len(manifest.get('playbooks', []))}")

    print("Scanning ppt-master skill...")
    ppt = gen.scan_ppt_master()
    if ppt.get("exists"):
        print(f"  Scripts: {ppt.get('scripts_count', 0)}")
        print(f"  Workflows: {len(ppt.get('workflows', []))}")
        print(f"  Templates: {len(ppt.get('templates_available', []))}")
    else:
        print("  (not found at expected path)")

    # Generate PDF
    print("Generating overview PDF...")
    try:
        result_pdf = gen.generate_overview_pdf(pdf_path)
        print(f"[OK] PDF: {result_pdf}")
    except ImportError as e:
        print(f"[WARN] {e}")
        print("  Install fpdf2: pip install fpdf2")
    except Exception as e:
        print(f"[ERROR] PDF generation failed: {e}")

    # Generate Markdown
    print("Generating overview Markdown...")
    try:
        md_content = gen.generate_overview_markdown()
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md_content)
        print(f"[OK] Markdown: {md_path}")
    except Exception as e:
        print(f"[ERROR] Markdown generation failed: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
