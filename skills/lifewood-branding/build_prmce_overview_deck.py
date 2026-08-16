#!/usr/bin/env python3
"""Build the PRMCE ("Strategic Agent Workflow") overview deck with
Lifewood branding — editorial style.

Content verified against README.md and docs/architecture.md (restored
from commit 85f82af, docs/ deleted in the working tree) plus the
current source tree / package.json — no invented metrics, no invented
deployment URL (none exists in the docs; the project is run locally).
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.claude\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_deck_builder import LifewoodDeck

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\Lifewood-Development\PRMCE-clone\deliverables"
TITLE = "PRMCE"
SUBTITLE = "Strategic Agent Workflow — Platform Overview"
DATE = "July 27, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    deck = LifewoodDeck(TITLE, subtitle=SUBTITLE, date_str=DATE, variant="editorial")

    deck.add_cover()
    deck.add_toc([
        "1.0  What Is PRMCE",
        "2.0  The Problem It Solves",
        "3.0  Platform at a Glance",
        "4.0  Key Capabilities",
        "5.0  Brainstorm vs. Orchestrator Mode",
        "6.0  Key Design Decisions",
        "7.0  Tech Stack",
        "8.0  Getting Started",
    ])

    # 1.0 What Is PRMCE
    deck.add_content("1.0", "What Is PRMCE", [
        "An AI-powered boardroom for strategic planning and execution",
        "Define agent teams (CEO, CTO, COO, Sales, Operations, Secretary, "
        "or fully custom) and drop in knowledge base PDFs",
        "Single-page Next.js app that orchestrates multi-agent AI "
        "conversations backed by a Supabase pgvector store for "
        "retrieval-augmented generation (RAG)",
        "Switch between brainstorm and orchestrator modes to get "
        "multi-perspective analysis and one synthesized answer",
    ])

    # 2.0 The Problem It Solves
    deck.add_two_column("2.0", "The Problem It Solves",
        "Before PRMCE",
        [
            "Single-perspective AI chat, no role specialization",
            "No connection to internal documents — context-free answers",
            "One-size-fits-all responses ignore functional expertise",
            "The user manually synthesizes conflicting viewpoints",
        ],
        "With PRMCE",
        [
            "A configurable team of role-specific agents per boardroom",
            "RAG over uploaded PDFs — answers cite your own sources",
            "Brainstorm mode surfaces every agent's take at once",
            "A built-in synthesis step merges responses into one answer",
        ],
    )

    # 3.0 Platform at a Glance
    deck.add_stats("3.0", "Platform at a Glance", [
        ("6", "Default Agent Roles", "CEO, COO, CTO, Sales, Operations, "
         "Secretary — plus unlimited custom roles"),
        ("5", "API Endpoints", "/api/chat, /api/upload, /api/files, "
         "/api/enhance, /api/debug/rag"),
        ("2", "Response Modes", "Brainstorm (all agents) or Orchestrator "
         "(router picks 1\u20133)"),
        ("20", "Top Documents Retrieved", "Per query, via Supabase "
         "pgvector similarity search"),
    ])

    # 4.0 Key Capabilities
    deck.add_card_grid("4.0", "Key Capabilities", [
        ("Multi-Agent Boardrooms",
         ["Configure CEO/COO/CTO/Sales/Operations/Secretary or custom roles",
          "Each boardroom has its own agents, knowledge base, and storage"]),
        ("Brainstorm & Orchestrator Modes",
         ["Brainstorm: every agent answers in parallel, circular layout",
          "Orchestrator: LLM router picks the 1\u20133 most relevant agents"]),
        ("RAG Knowledge Base",
         ["Upload PDFs per boardroom; LangChain + Supabase pgvector retrieve context",
          "Responses cite source documents"]),
        ("Voice Input & Prompt Enhancement",
         ["Dictate queries via the browser SpeechRecognition API",
          "/api/enhance refines an agent's system prompt with AI"]),
    ], grid="2x2")

    # 5.0 Brainstorm vs. Orchestrator Mode
    deck.add_two_column("5.0", "Brainstorm vs. Orchestrator Mode",
        "Brainstorm Mode",
        [
            "All agents in the boardroom respond simultaneously",
            "Circular rotating layout with animated connection lines",
            "Best for exploring every angle on a question",
            "Final synthesis combines every agent's input",
        ],
        "Orchestrator Mode",
        [
            "An LLM router (Chief of Staff) selects 1\u20133 relevant agents",
            "Selected agents respond in a horizontal flow",
            "Best for fast, targeted answers",
            "Falls back to CEO only if routing returns nothing",
        ],
    )

    # 6.0 Key Design Decisions
    deck.add_content("6.0", "Key Design Decisions", [
        "OpenRouter as the unified LLM provider — chat, embeddings, and "
        "prompt enhancement all route through OpenRouter's "
        "OpenAI-compatible API",
        "Optimistic UI updates — agent profile and boardroom mutations "
        "update React state immediately, then sync to Supabase "
        "asynchronously",
        "Boardroom UUID as storage folder — each boardroom's files live "
        "under its own UUID in Supabase Storage, with a special-cased "
        "uploads/ folder for the default \u201cMain Boardroom\u201d",
    ])

    # 7.0 Tech Stack
    deck.add_table("7.0", "Tech Stack",
        ["Layer", "Technology"],
        [["Framework", "Next.js 16.1.6"],
         ["UI library", "React 19.2.3"],
         ["Language", "TypeScript ^5"],
         ["Styling", "Tailwind CSS ^4"],
         ["Backend / Auth", "Supabase ^2.93.3"],
         ["LLM orchestration", "LangChain ^1.2.16"],
         ["LLM provider", "OpenRouter (GPT-4 Turbo)"],
         ["Vector store", "Supabase pgvector"]],
    )

    # 8.0 Getting Started
    deck.add_callout("8.0", "Getting Started",
        "npm install && npm run dev",
        "Copy .env.example to .env.local with your Supabase project and "
        "OpenRouter API key, then open http://localhost:3000. Create a "
        "boardroom, add agents, upload a PDF, and submit a query.")

    deck.add_closing("Thank You", "Lifewood PH Team")

    pptx_path = os.path.join(OUTPUT_DIR, "PRMCE_Overview.pptx")
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
