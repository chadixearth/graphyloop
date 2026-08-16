#!/usr/bin/env python3
"""Build PRMCE System & Extension Workflows PDF with Lifewood branding —
swiss (technical/dense) style.

Content verified against docs/architecture.md, docs/usage.md, and
CONTRIBUTING.md (docs/ restored from commit 85f82af; CONTRIBUTING.md
read from the current working tree) plus the current source tree. No
invented CI/build timing numbers, no invented deploy target — neither
is documented anywhere in the repo, so both are omitted rather than
guessed.
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.claude\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\Lifewood-Development\PRMCE-clone\deliverables"
TITLE = "PRMCE"
SUBTITLE = "System & Extension Workflows"
DATE = "July 27, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    sections = [
        "1.0  System Architecture",
        "2.0  Query Data Flow",
        "3.0  Knowledge Base Ingestion Workflow",
        "4.0  Agent Routing Workflow",
        "5.0  Development Workflow",
        "6.0  Extending the Platform",
        "7.0  Known Issues & Gaps",
    ]
    page_map = {"1.0": 3, "2.0": 4, "3.0": 5, "4.0": 6, "5.0": 7, "6.0": 8, "7.0": 9}

    PdfSpecLock.write_spec_lock(
        OUTPUT_DIR, title=f"{TITLE} - {SUBTITLE}",
        audience="workflow", page_count=9, sections=sections,
    )

    pdf = LifewoodPDF(TITLE, subtitle=SUBTITLE, audience="workflow",
                      date_str=DATE, variant="swiss")
    pdf.add_cover()
    pdf.add_toc(sections, page_map=page_map)

    # 1.0 System Architecture
    p = pdf.add_mixed_content_page("1.0", "System Architecture", [
        ("body", "PRMCE is a single-page Next.js application that "
         "orchestrates multi-agent AI conversations backed by a "
         "Supabase pgvector store for retrieval-augmented generation "
         "(RAG). Each boardroom is an isolated workspace with its own "
         "agent team and knowledge base."),
        ("table", ["Layer", "Technology"],
         [["Framework", "Next.js 16.1.6 (App Router)"],
          ["UI library", "React 19.2.3"],
          ["Styling", "Tailwind CSS ^4"],
          ["Backend / Auth", "Supabase ^2.93.3"],
          ["LLM orchestration", "LangChain ^1.2.16"],
          ["LLM provider", "OpenRouter (GPT-4 Turbo)"],
          ["Vector store", "Supabase pgvector"],
          ["PDF parsing", "pdf-parse / WebPDFLoader"]]),
        ("code", "src/\n"
         "|-- agents/       prompts.ts, types.ts\n"
         "|-- app/\n"
         "|   |-- api/      chat, upload, files, enhance, debug/rag\n"
         "|   `-- page.tsx  main SPA — dashboard + chat view\n"
         "|-- components/   AgentNode, Sidebar, SourcesPanel, modals\n"
         "|-- context/      AgentProfileContext.tsx\n"
         "|-- lib/          supabase.ts, utils.ts\n"
         "|-- rag/          store.ts (RAGStore)\n"
         "`-- workflow/      orchestrator.ts (AgentOrchestrator)",
         "Directory tree (src/)"),
        ("callout", "Note",
         "OpenRouter is the unified LLM provider — chat, embeddings, "
         "and prompt enhancement all set baseURL to "
         "https://openrouter.ai/api/v1 and authenticate with "
         "OPENROUTER_API_KEY as both apiKey and openAIApiKey."),
    ])
    print(f"1.0 -> page {p}")

    # 2.0 Query Data Flow
    p = pdf.add_mixed_content_page("2.0", "Query Data Flow", [
        ("body", "A query submitted from the main SPA (src/app/page.tsx) "
         "flows through a single API route that fans out to the RAG "
         "store and the agent orchestrator before returning a combined "
         "result."),
        ("steps", [
            "The client POSTs { message, boardroom_id, mode } to "
            "/api/chat (src/app/api/chat/route.ts).",
            "The handler fetches any custom agent prompts from the "
            "Supabase agent_profiles table for that boardroom.",
            "RAGStore.retrieve(message, boardroom_id) runs a pgvector "
            "similarity search scoped to the boardroom and returns the "
            "top 20 matching document chunks.",
            "If mode is \"orchestrator\", orchestrator.route(message) "
            "selects 1\u20133 relevant agent roles first.",
            "orchestrator.brainstorm(message, context, prompts, roles) "
            "fires one parallel LLM call per active agent role.",
            "orchestrator.synthesize(message, responses) merges every "
            "agent response into one unified answer (skipped when only "
            "one agent responded).",
            "The API returns agentResponses, finalAnswer, and sources "
            "as JSON; the UI renders each agent node (loading \u2192 "
            "active \u2192 complete) plus the synthesis section.",
        ]),
        ("table", ["Method", "Path", "Description"],
         [["POST", "/api/chat", "Submit a query, get agent responses + synthesis"],
          ["POST", "/api/upload", "Upload a PDF, chunk, embed, index"],
          ["GET", "/api/files", "List uploaded files for a boardroom"],
          ["DELETE", "/api/files", "Delete a file (requires service role key)"],
          ["POST", "/api/enhance", "AI-enhance an agent's system prompt"]]),
    ])
    print(f"2.0 -> page {p}")

    # 3.0 Knowledge Base Ingestion Workflow
    p = pdf.add_mixed_content_page("3.0", "Knowledge Base Ingestion Workflow", [
        ("body", "Uploading a PDF through the Sources panel triggers a "
         "parse \u2192 chunk \u2192 embed \u2192 index pipeline handled "
         "entirely by RAGStore (src/rag/store.ts)."),
        ("steps", [
            "Client uploads multipart/form-data (file, boardroom_id) "
            "to POST /api/upload.",
            "The file is stored in the Supabase \"knowledge-base\" "
            "bucket, under a folder named for the boardroom's UUID "
            "(or uploads/ for the default \u201cMain Boardroom,\u201d "
            "whose id is the zero UUID).",
            "WebPDFLoader parses the PDF into text.",
            "RecursiveCharacterTextSplitter chunks the text — 1000 "
            "characters per chunk, 200 character overlap.",
            "Each chunk is embedded via OpenRouter/OpenAI and written "
            "into the Supabase documents table (pgvector), tagged with "
            "the boardroom_id in its metadata.",
        ]),
        ("callout", "Note",
         "RAGStore.initialize() is a one-time setup step: it connects "
         "to pgvector and, only if the documents table is empty, seeds "
         "it from any PDFs already present in a local documents/ "
         "directory."),
        ("callout", "Warning",
         "Deleting a file (DELETE /api/files) removes it from storage "
         "and attempts to delete its vectors by matching boardroom_id "
         "plus source filename — this requires SUPABASE_SERVICE_ROLE_KEY."),
    ])
    print(f"3.0 -> page {p}")

    # 4.0 Agent Routing Workflow
    p = pdf.add_mixed_content_page("4.0", "Agent Routing Workflow", [
        ("body", "Orchestrator mode adds one extra LLM call before "
         "brainstorming: an LLM-based router that narrows the full "
         "agent roster down to the 1\u20133 most relevant roles for the "
         "query."),
        ("steps", [
            "AgentOrchestrator.route(query, availableAgents) calls GPT-4 "
            "Turbo with a router system prompt listing every available "
            "agent and its description.",
            "The model is expected to return a JSON array of selected "
            "role strings, e.g. [\"CTO\", \"Operations\"].",
            "If JSON.parse on the response fails, the router falls back "
            "to activating every available agent rather than failing "
            "the request.",
            "If the parsed array is empty, the chat API falls back to "
            "the CEO role only.",
        ]),
        ("code", '["CTO", "Operations"]',
         "Example route() response"),
        ("callout", "Note",
         "Both brainstorm() and the fallback path use Promise.all, so "
         "adding more active agents does not increase latency linearly "
         "— all selected agents' LLM calls run concurrently."),
    ])
    print(f"4.0 -> page {p}")

    # 5.0 Development Workflow
    p = pdf.add_mixed_content_page("5.0", "Development Workflow", [
        ("body", "The dev environment is identical to production — no "
         "separate dev services beyond a Supabase project and an "
         "OpenRouter key."),
        ("code", "npm run dev     # Next.js dev server on port 3000\n"
         "npm run build   # production build to .next/\n"
         "npm run start   # start the production server\n"
         "npm run lint    # ESLint with eslint-config-next rules",
         "Commands (package.json)"),
        ("table", ["Convention", "Rule"],
         [["Language", "TypeScript strict mode; avoid any, prefer unknown + guards"],
          ["Imports", "Use @/ path aliases, not relative paths"],
          ["Styling", "Tailwind CSS v4 with @theme directives; no plain CSS files"],
          ["Components", "shadcn/ui primitives in src/components/ui/"],
          ["API routes", "App Router handlers always return NextResponse.json()"],
          ["Client components", "Mark \"use client\" when using hooks/browser APIs"]]),
        ("steps", [
            "Ensure npm run lint passes with no errors.",
            "Test locally with npm run dev.",
            "Keep changes scoped — one concern per pull request.",
            "Update docs if you add new env vars, API endpoints, or "
            "configuration surfaces.",
        ]),
    ])
    print(f"5.0 -> page {p}")

    # 6.0 Extending the Platform
    p = pdf.add_mixed_content_page("6.0", "Extending the Platform", [
        ("body", "Goal: add a new agent role."),
        ("steps", [
            "Add the role string to AgentRole in src/agents/types.ts.",
            "Add its system prompt to AGENT_PROMPTS in "
            "src/agents/prompts.ts.",
            "Add a description in getAgentDescription() so the router "
            "can consider it.",
            "Optionally add a color in DEFAULT_COLORS in "
            "src/components/AgentNode.tsx and AgentDetailModal.tsx.",
            "Verify: the role appears as selectable and the router "
            "picks it up automatically once it's in availableRoles.",
        ]),
        ("body", "Goal: add a new API endpoint."),
        ("steps", [
            "Create src/app/api/<name>/route.ts with exported "
            "async function GET/POST/DELETE handlers.",
            "Import supabase from @/lib/supabase for database access.",
            "Import RAGStore or AgentOrchestrator if the endpoint needs "
            "retrieval or agent calls.",
            "Verify: hit the route locally with npm run dev and confirm "
            "it returns NextResponse.json() as expected.",
        ]),
    ])
    print(f"6.0 -> page {p}")

    # 7.0 Known Issues & Gaps
    p = pdf.add_mixed_content_page("7.0", "Known Issues & Gaps", [
        ("table", ["Issue", "Detail"],
         [["POST /api/debug/rag is a no-op",
           "The route file exists (src/app/api/debug/rag/route.ts) but "
           "its handler body is empty — it returns nothing."],
          ["Optimistic UI updates don't revert on error",
           "AgentProfileContext mutates local state immediately, then "
           "syncs to Supabase. On a sync error, state is not rolled "
           "back — refreshBoardrooms() is the only recovery path."],
          ["Default boardroom uses a special storage folder",
           "The \u201cMain Boardroom\u201d (zero UUID "
           "00000000-0000-0000-0000-000000000000) stores files under "
           "uploads/ instead of a UUID folder like every other "
           "boardroom — an inconsistency to be aware of when "
           "debugging storage paths."],
          ["No LICENSE file", "The project is private per package.json; "
           "no license terms are published."],
          ["No CI workflow", "No workflow file found under .github/ — "
           "lint/build are run manually, not enforced in CI."]]),
        ("callout", "Warning",
         "Never commit a real .env.local, an OPENROUTER_API_KEY, or "
         "SUPABASE_SERVICE_ROLE_KEY. The Supabase anon key is safe for "
         "client-side use; the service role key and the OpenRouter key "
         "are not."),
    ])
    print(f"7.0 -> page {p}")

    output_path = os.path.join(OUTPUT_DIR, "PRMCE_Workflows.pdf")
    pdf.save(output_path)
    print(f"[OK] Workflows: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    print(f"     Total pages: {pdf.page_no()}")
    return output_path

if __name__ == "__main__":
    build()
