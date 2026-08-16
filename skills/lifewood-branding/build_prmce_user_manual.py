#!/usr/bin/env python3
"""Build PRMCE User Manual PDF with Lifewood branding — editorial style.

Content verified against docs/usage.md, docs/installation.md, and
docs/troubleshooting.md (restored from commit 85f82af, docs/ deleted in
the working tree) plus the current source tree — no invented features
(no export button, no dark-mode toggle, no self-service password
reset: none of these exist in the shipped app per the source docs).
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.claude\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\Lifewood-Development\PRMCE-clone\deliverables"
TITLE = "PRMCE"
SUBTITLE = "User Manual"
DATE = "July 27, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    sections = [
        "1.0  Getting Started",
        "2.0  Boardrooms",
        "3.0  Agents",
        "4.0  Modes: Brainstorm & Orchestrator",
        "5.0  Knowledge Base",
        "6.0  Voice Input",
        "7.0  Troubleshooting",
    ]
    page_map = {"1.0": 3, "2.0": 4, "3.0": 5, "4.0": 6, "5.0": 7, "6.0": 8, "7.0": 9}

    PdfSpecLock.write_spec_lock(
        OUTPUT_DIR, title=f"{TITLE} - {SUBTITLE}",
        audience="user", page_count=9, sections=sections,
    )

    pdf = LifewoodPDF(TITLE, subtitle=SUBTITLE, audience="user",
                      date_str=DATE, variant="editorial")
    pdf.add_cover()
    pdf.add_toc(sections, page_map=page_map)

    # 1.0 Getting Started
    p = pdf.add_mixed_content_page("1.0", "Getting Started", [
        ("body", "PRMCE is an AI-powered boardroom for strategic planning "
         "and execution. Define a team of agents (CEO, CTO, COO, Sales, "
         "Operations, Secretary, or your own custom roles), drop in "
         "knowledge base PDFs, and ask questions to get multi-perspective "
         "analysis and one synthesized answer."),
        ("body", "The app runs at a URL your administrator gives you "
         "(by default, a local install serves it at "
         "http://localhost:3000 — see the project's Installation guide "
         "for environment setup)."),
        ("table", ["What you can do", "Where"],
         [["Create and configure your agent team", "Boardroom + Agent modals"],
          ["Get every agent's perspective on a question", "Brainstorm mode"],
          ["Get a fast, targeted answer from 1\u20133 agents", "Orchestrator mode"],
          ["Give agents your own documents to reference", "Sources panel"],
          ["Dictate a query instead of typing", "Microphone icon"]]),
        ("callout", "Note",
         "This manual covers day-to-day use. Environment variables, "
         "Supabase table setup, and API keys are covered in the "
         "project's separate Installation guide, intended for whoever "
         "deploys the app."),
    ])
    print(f"1.0 -> page {p}")

    # 2.0 Boardrooms
    p = pdf.add_mixed_content_page("2.0", "Boardrooms", [
        ("body", "Boardrooms are isolated workspaces — each has its own "
         "agent team and knowledge base. Nothing uploaded or configured "
         "in one boardroom is visible in another."),
        ("steps", [
            "Create a boardroom — click the \u201cCreate New Boardroom\u201d "
            "card on the home dashboard, or open the boardroom switcher "
            "in the header and select \u201cInaugurate Boardroom.\u201d",
            "Switch boardrooms — click the boardroom switcher (shows the "
            "current boardroom name). The previous query and agent "
            "responses clear, and the new boardroom's knowledge base loads.",
            "Rename a boardroom — open the switcher dropdown, hover a "
            "boardroom, and click the pencil icon.",
            "Delete a boardroom — open the switcher dropdown, hover a "
            "boardroom, and click the trash icon.",
        ]),
        ("callout", "Warning",
         "Deleting a boardroom removes its agents and every knowledge "
         "base document with it. This cannot be undone. You also cannot "
         "delete the last remaining boardroom — the app blocks this "
         "with an alert."),
    ])
    print(f"2.0 -> page {p}")

    # 3.0 Agents
    p = pdf.add_mixed_content_page("3.0", "Agents", [
        ("body", "Each boardroom starts with six default agents. You can "
         "add, remove, rename, and customize any of them, or add "
         "entirely custom roles."),
        ("table", ["Role", "Focus"],
         [["CEO", "Strategy, big picture, high-level decisions"],
          ["COO", "Operations, efficiency, day-to-day execution"],
          ["CTO", "Technology, security, infrastructure"],
          ["Sales", "Revenue, customers, market fit"],
          ["Operations", "Logistics, resources, delivery"],
          ["Secretary", "Record keeping, clarity, synthesis"],
          ["Custom", "Any role you define yourself"]]),
        ("steps", [
            "View a response — click any agent node (either mode) to "
            "open a detail modal with the full response text and "
            "referenced sources.",
            "Configure a system prompt — in the detail modal, click the "
            "edit (pencil) icon to change the display name, role ID, or "
            "system prompt. Click \u201cEnhance with AI\u201d to refine the "
            "prompt automatically.",
            "Add a custom agent — click the center + button in "
            "brainstorm mode, or open \u201cInaugurate Agent.\u201d Enter a "
            "unique Role ID (e.g. SEO_SPECIALIST), a display name, and "
            "an optional system prompt.",
            "Remove an agent — in the detail modal footer, click "
            "\u201cFire Agent.\u201d This removes it from the current "
            "boardroom only.",
        ]),
    ])
    print(f"3.0 -> page {p}")

    # 4.0 Modes: Brainstorm & Orchestrator
    p = pdf.add_mixed_content_page("4.0", "Modes: Brainstorm & Orchestrator", [
        ("body", "Switch between the two response modes using the toggle "
         "buttons above the input bar."),
        ("body", "Brainstorm mode — every agent in the boardroom answers "
         "at once:"),
        ("steps", [
            "Enter a query in the textarea.",
            "Click \u201cBrainstorm\u201d or press Enter.",
            "All agents display their responses in a rotating ring.",
            "Once every response arrives, a \u201cFinal Synthesis\u201d "
            "section appears, combining every agent's input.",
        ]),
        ("body", "Orchestrator mode — a router picks the most relevant "
         "1\u20133 agents:"),
        ("steps", [
            "Toggle to \u201cOrchestrator Mode.\u201d",
            "Enter a query in the textarea.",
            "Click \u201cRoute\u201d or press Enter.",
            "The orchestrator node at the top shows routing status.",
            "Selected agents respond in a horizontal flow, followed by "
            "a final synthesis.",
        ]),
        ("callout", "Note",
         "If the router can't determine which agents apply, it falls "
         "back to the CEO agent only."),
    ])
    print(f"4.0 -> page {p}")

    # 5.0 Knowledge Base
    p = pdf.add_mixed_content_page("5.0", "Knowledge Base", [
        ("body", "Upload PDF documents per boardroom so agents can "
         "reference them when answering. Each boardroom's files are "
         "kept separate from every other boardroom's."),
        ("steps", [
            "Upload — drop a PDF onto the Sources panel (right sidebar, "
            "\u201cDrop PDF here to Add\u201d), or use the upload modal.",
            "Delete — hover the file in the Sources panel and click the "
            "trash icon.",
        ]),
        ("body", "Behind the scenes, an uploaded file is parsed, split "
         "into overlapping chunks, and embedded into the boardroom's "
         "vector index — this is what lets agents retrieve and cite the "
         "right passage for a given question."),
        ("callout", "Tip",
         "When an agent cites a source, the file name appears as a "
         "badge in the Final Synthesis section and in that agent's "
         "detail modal."),
        ("callout", "Note",
         "If a boardroom has no uploaded files, the Sources panel shows "
         "\u201cNo files found. Upload one above!\u201d and agents answer "
         "without knowledge base context."),
    ])
    print(f"5.0 -> page {p}")

    # 6.0 Voice Input
    p = pdf.add_mixed_content_page("6.0", "Voice Input", [
        ("body", "Click the microphone icon next to the input bar to "
         "dictate your query instead of typing it."),
        ("callout", "Note",
         "Voice input requires a browser with Web Speech API support "
         "— Chrome, Edge, or Safari. The microphone icon does not "
         "appear on unsupported browsers. Dictation is currently "
         "English (en-US) only."),
    ])
    print(f"6.0 -> page {p}")

    # 7.0 Troubleshooting
    p = pdf.add_mixed_content_page("7.0", "Troubleshooting", [
        ("table", ["Symptom", "What to do"],
         [["\u201cCannot delete the last boardroom\u201d alert",
           "Create another boardroom first, then delete the one you "
           "no longer need."],
          ["Agents respond without citing any sources",
           "Confirm the boardroom has uploaded PDFs in the Sources "
           "panel — agents can only cite documents that have been "
           "uploaded and indexed."],
          ["Sources panel shows \u201cNo files found\u201d",
           "Upload at least one PDF via the Sources panel before "
           "expecting cited answers."],
          ["Boardroom switcher shows no boardrooms",
           "Create a boardroom from the home dashboard."],
          ["\u201cFailed to add agent\u201d error",
           "This is a backend configuration issue — contact your "
           "administrator."],
          ["Voice input (microphone) icon missing",
           "Switch to Chrome, Edge, or Safari — other browsers don't "
           "support the Web Speech API this feature needs."],
          ["Brainstorm mode feels slow",
           "Brainstorm calls every agent in parallel. Switch to "
           "Orchestrator mode, which calls only 1\u20133 agents, for "
           "faster responses."],
          ["Agents respond, but responses seem generic",
           "Add a system prompt for that agent (Agent detail modal → "
           "edit icon) so it has more specific guidance to draw on."]]),
        ("callout", "Warning",
         "If a problem persists after trying the steps above, contact "
         "the Lifewood PH support team with a description of what you "
         "were doing and any error message shown."),
    ])
    print(f"7.0 -> page {p}")

    output_path = os.path.join(OUTPUT_DIR, "PRMCE_User_Manual.pdf")
    pdf.save(output_path)
    print(f"[OK] User manual: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    print(f"     Total pages: {pdf.page_no()}")
    return output_path

if __name__ == "__main__":
    build()
