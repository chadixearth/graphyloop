#!/usr/bin/env python3
"""Build Storyboard Studio (AIGC Automation / Seedance) System & Extension
Workflows PDF with Lifewood branding — swiss (technical/dense) style.

Content verified against a full source-tree read of app/page.tsx,
app/_components/*, all app/api/*/route.ts files, lib/*, middleware.ts, and
.env.local.example (repo https://github.com/LifewoodPH/AIGC_AUTOMATAION_SEEDANCE.git,
local clone at Lifewood-Development/LifeStory). Where README.md/docs/*.md
claims disagree with the current code, the code wins and the discrepancy is
called out explicitly (Section 7.0) rather than silently repeating stale docs.
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.config\opencode\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\Lifewood-Development\LifeStory\deliverables"
TITLE = "Storyboard Studio"
SUBTITLE = "System & Extension Workflows"
DATE = "July 27, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    sections = [
        "1.0  System Architecture",
        "2.0  Two Pipelines: Studio Mode vs. Fast Mode",
        "3.0  API Route Reference",
        "4.0  Provider Cascades & Key Overrides",
        "5.0  Persistence & Storage",
        "6.0  Cost Tracking",
        "7.0  Known Issues & Documentation Discrepancies",
        "8.0  Environment & Local Setup",
    ]
    page_map = {"1.0": 3, "2.0": 4, "3.0": 5, "4.0": 7, "5.0": 8,
                "6.0": 9, "7.0": 10, "8.0": 11}

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
        ("body", "Storyboard Studio is a Next.js 15 app (App Router, "
         "React 19, TypeScript) with serverless API routes under app/api/ "
         "— there is no separate backend server. Every external provider "
         "call (LLM, image, video, TTS, music) is made from a route "
         "handler, never directly from the browser."),
        ("table", ["Layer", "Technology"],
         [["Framework", "Next.js 15 (App Router) + React 19"],
          ["Language", "TypeScript"],
          ["LLM providers", "OpenAI, DeepSeek, Google, OpenRouter "
           "(selectable per call)"],
          ["Image providers", "OpenRouter (Nano Banana), Google direct, "
           "Replicate (FLUX), Pollinations (free fallback)"],
          ["Video providers", "ByteDance Ark / Seedance, Kling"],
          ["Voiceover & music", "ElevenLabs (TTS + Music API)"],
          ["Video assembly", "ffmpeg / ffprobe (server-side, via "
           "app/api/compile)"],
          ["PDF/text extraction", "pdf-parse (server), pdfjs-dist "
           "(client, for cover-image rasterization)"]]),
        ("code", "app/\n"
         "|-- page.tsx              Studio-mode 3-step wizard root\n"
         "|-- _components/          FastModePanel, PipelineCanvas,\n"
         "|                          PipelineStrip, StoryboardView,\n"
         "|                          Timeline, Sidebar, ApiKeysPanel, ...\n"
         "|-- api/                  ~25 route handlers (Section 3.0)\n"
         "`-- costs/page.tsx        cost dashboard\n"
         "lib/                      pipeline-providers, image-gen,\n"
         "                          video-prompt, visual-styles, costs,\n"
         "                          user-keys, server-keys, brand, i18n\n"
         "middleware.ts             authorship header stamp only",
         "Directory tree (top-level)"),
        ("callout", "Note",
         "middleware.ts does not gate auth or routes. It runs on every "
         "request (excluding _next/static, _next/image, favicon.ico) and "
         "only attaches X-Author / X-Copyright / X-Owner response "
         "headers as a Lifewood PH authorship stamp."),
    ])

    # 2.0 Two Pipelines
    pdf.add_mixed_content_page("2.0", "Two Pipelines: Studio Mode vs. Fast Mode", [
        ("body", "app/page.tsx holds a mode: 'studio' | 'fast' toggle "
         "(no routing — both render conditionally on one page). The two "
         "modes are largely independent, feature-divergent pipelines "
         "that share only a few primitives: the Frame type, and the "
         "/api/storyboard, /api/image, /api/voiceover, and "
         "/api/storyboards routes."),
        ("body", "Studio mode is a manual 3-step wizard (step: 1|2|3 in "
         "page.tsx): Configure \u2192 Storyboard \u2192 Edit. Only the "
         "LAST frame ever passes an image_url to /api/video (a \"book "
         "reveal shot\"); every other frame is pure Seedance "
         "text-to-video. The Edit step's Timeline has no music track "
         "wiring at all, and its Export button is a literal "
         "alert('Export not implemented yet...') placeholder "
         "(page.tsx:664) with zero backend call."),
        ("body", "Fast mode (_components/FastModePanel.tsx, 2,445 "
         "lines) runs one sequential pipeline via run(): storyboard \u2192 "
         "images \u2192 videos \u2192 voiceover \u2192 music \u2192 "
         "compile, with Promise.all fan-out across frames within each "
         "stage. This is the actively developed, functionally complete "
         "path — it has its own provider-selection strip, API-key "
         "override panel, cost-aware node-graph view (PipelineCanvas), "
         "and a real ffmpeg compile + JSZip export."),
        ("callout", "Note",
         "Treat these as two separate systems when extending the app. "
         "A change to Fast Mode's stage logic (FastModePanel.tsx) has no "
         "effect on Studio mode's wizard (page.tsx), and vice versa."),
    ])

    # 3.0 API Route Reference
    pdf.add_mixed_content_page("3.0", "API Route Reference", [
        ("body", "All ~25 routes live under app/api/. Provider-selectable "
         "routes accept an optional provider field and fall back through "
         "a cascade rather than hard-failing when a preferred provider's "
         "key is missing (Section 4.0)."),
        ("table", ["Route", "Purpose"],
         [["POST /api/storyboard", "Core storyboard LLM call; 4-provider "
           "cascade; mock 5-frame fallback if unparsable/no key"],
          ["GET/POST /api/storyboards(+[id])", "Save/list/load session "
           "JSON; portable path fallback (Section 5.0)"],
          ["POST /api/image", "Still-image gen; 4-stage provider "
           "cascade ending in free Pollinations"],
          ["POST /api/image/analyze", "Vision LLM cover-style "
           "extraction (OpenRouter only, hard error if no key)"],
          ["POST /api/image/stylize", "Image-edit call for hero "
           "book composites and redraw styles (OpenRouter only)"],
          ["POST /api/video", "Synchronous Seedance gen (blocking poll "
           "loop); used by Studio mode"],
          ["POST /api/video/create + GET /api/video/status", "Async "
           "Seedance create/poll pair; used by Fast Mode"],
          ["POST/GET /api/video/kling/create, /kling/status", "Kling "
           "image-to-video create/poll (JWT-signed)"],
          ["POST /api/video/regen-prompt", "LLM rewrite of a "
           "content-policy-rejected video prompt"],
          ["POST /api/voiceover(+/redistribute)", "ElevenLabs TTS; "
           "mock silent MP3 if no key. /redistribute re-splits VO "
           "text across frames"],
          ["POST /api/music", "ElevenLabs Music API call — NOT Suno "
           "(Section 7.0)"],
          ["POST /api/compile", "ffmpeg: trims/mixes/concats all "
           "clips + VO + music + burned subtitles into final.mp4"],
          ["POST /api/export", "JSZip bundle: compiled video(s), "
           "every asset, script, cost report"],
          ["GET /api/costs", "Aggregates data/cost-log.jsonl + saved "
           "sessions by kind/provider"]]),
    ])
    pdf.add_mixed_content_page("3.1", "API Route Reference (cont.)", [
        ("table", ["Route", "Purpose"],
         [["GET/POST /api/presets(+[id])", "Studio-mode config presets "
           "— hardcoded Mac-only path, no fallback (Section 5.0)"],
          ["GET/POST /api/personal-styles(+[id], +image/[filename])",
           "User reference-image styles — same hardcoded-path issue"],
          ["GET /api/style-preview/[id]", "Cached built-in visual-style "
           "thumbnail; generates + caches on first miss"],
          ["GET /api/test-keys", "Probes all 7 provider credentials "
           "and reports configured/ok/status per provider"],
          ["POST /api/upload", "PDF-only text extraction via "
           "pdf-parse, truncated to 50,000 chars"]]),
        ("callout", "Note",
         "app/api/export/route.ts:109 has a known pre-existing "
         "tsc --noEmit type error (documented in "
         "docs/pipeline-providers.md), unrelated to any provider-"
         "selection work — leave it in mind if you touch that file."),
    ])

    # 4.0 Provider Cascades & Key Overrides
    pdf.add_mixed_content_page("4.0", "Provider Cascades & Key Overrides", [
        ("body", "Two independent mechanisms let a user override which "
         "provider or key is used per request, without restarting the "
         "server:"),
        ("table", ["File", "Role"],
         [["lib/pipeline-providers.ts", "PIPELINE_STEPS registry (7 "
           "steps: script, image-prompt, image-gen, video-gen, "
           "video-prompt, voiceover, sound); localStorage-backed "
           "per-step provider choice; getStepProvider(stepId) resolver"],
          ["lib/user-keys.ts", "EDITABLE_KEYS (14 key/model defs); "
           "localStorage store; kfetch() wrapper that auto-injects "
           "key headers on every Fast Mode request"],
          ["lib/server-keys.ts", "pickKey(req, envName): reads the "
           "matching x-*-key request header first, falls back to "
           "process.env[envName]"]]),
        ("code", "// Image-gen cascade (lib/image-gen.ts):\n"
         "[preferredProvider, ...rest] of\n"
         "  ['openrouter', 'nanobanana-google', 'replicate', 'pollinations']\n"
         "// Pollinations needs no key — always-available last resort.\n\n"
         "// Video-gen: 'seedance' (Ark) or 'kling' — user pick is\n"
         "// locked for the whole run once started, no per-frame fallback.",
         "Cascade behavior"),
        ("callout", "Warning",
         "Video-gen has a known gap: if 'kling' is selected outside "
         "book-trailer content types, middle frames have no image_url "
         "(runImagesStage only generates hero images for book frames) "
         "and every middle-frame Kling call fails with a clear "
         "\"needs an image\" error. Documented as an open Phase 2.5 fix "
         "in docs/pipeline-providers.md."),
    ])

    # 5.0 Persistence & Storage
    pdf.add_mixed_content_page("5.0", "Persistence & Storage", [
        ("body", "Three JSON-file-backed stores exist, with inconsistent "
         "portability:"),
        ("table", ["Store", "Path resolution", "Portable?"],
         [["Saved storyboards/sessions", "/Volumes/AI data/Claude "
           "test/storyboards if that mount exists, else <cwd>/data/"
           "storyboards", "Yes — has a real fallback"],
          ["Presets", "Hardcoded /Volumes/AI data/Claude test/presets, "
           "no env var, no fallback", "No — POST/PATCH/DELETE throw "
           "off that Mac"],
          ["Personal styles", "Hardcoded /Volumes/AI data/Claude "
           "test/personal-styles (meta/ + images/ subdirs)", "No — "
           "same issue as presets"]]),
        ("callout", "Warning",
         "Presets and personal-styles are a real portability bug, not "
         "a design choice — the paths are literal string constants in "
         "app/api/presets/route.ts and app/api/personal-styles/route.ts "
         "(also echoed in Sidebar.tsx's \"Stored at\" footer text). To "
         "fix: mirror the storyboards route's existsSync() fallback "
         "pattern, or move all three to an env-configurable data dir."),
        ("body", "Generated media assets (images, videos, audio, "
         "compiled output, exports) are NOT part of this JSON-store "
         "question — they always write to public/generated/<kind>/ "
         "using content-hash filenames, which is already portable."),
    ])

    # 6.0 Cost Tracking
    pdf.add_mixed_content_page("6.0", "Cost Tracking", [
        ("body", "lib/costs.ts holds hardcoded USD price tables "
         "(LLM per-model, image, video-per-second, ElevenLabs TTS "
         "$0.30/1k chars, ElevenLabs Music $0.008/sec — snapshot dated "
         "2026-04-28 in source comments) and exposes one estimator per "
         "kind plus logCost(), which appends a line to "
         "data/cost-log.jsonl on every provider call site."),
        ("body", "GET /api/costs aggregates two sources: every saved "
         "session's per-frame image/video/audio costs (explicitly "
         "excluding music and storyboard-LLM cost by design), and the "
         "full JSONL log grouped by kind and by provider. The Costs "
         "page renders both plus a raw \"recent 200 calls\" table."),
        ("callout", "Note",
         "These are estimates from a static price list — there is no "
         "live billing API integration with any provider. If a "
         "provider's real pricing changes, only lib/costs.ts's "
         "constants need updating; no route logic depends on the "
         "actual numbers being current."),
    ])

    # 7.0 Known Issues & Documentation Discrepancies
    pdf.add_mixed_content_page("7.0", "Known Issues & Documentation Discrepancies", [
        ("body", "README.md and docs/ predate large parts of the "
         "current Fast Mode feature set. Verified against the current "
         "source tree, the following claims are stale — trust the code, "
         "update the docs to match:"),
        ("table", ["README/docs claim", "Actual code"],
         [["Music via Suno (optional, no official API yet)",
           "Music is fully implemented via the ElevenLabs Music API; "
           "SUNO_API_KEY/SUNO_API_BASE are unused dead config"],
          ["\"Video export... Not yet implemented\"",
           "True only for Studio mode's Timeline Export button. Fast "
           "Mode's /api/compile (ffmpeg) + /api/export (ZIP) are fully "
           "implemented production code"],
          ["LLM = OpenRouter only; image/video = Replicate",
           "4 LLM providers (OpenAI/DeepSeek/Google/OpenRouter); image "
           "cascades OpenRouter\u2192Google-direct\u2192Replicate\u2192"
           "Pollinations; video is Seedance/Kling, not Replicate"],
          ["Project structure shows only 6 API routes",
           "~25 routes now exist (compile, export, costs, presets, "
           "personal-styles, video/create+status+kling+regen-prompt, "
           "voiceover/redistribute, etc.)"]]),
        ("callout", "Warning",
         "docs/pipeline-providers.md self-documents its per-step "
         "provider-selection feature as \"not verified end-to-end in a "
         "browser\" — treat that feature as beta when advising users or "
         "planning further work on top of it."),
    ])

    # 8.0 Environment & Local Setup
    pdf.add_mixed_content_page("8.0", "Environment & Local Setup", [
        ("code", "cp .env.local.example .env.local\n"
         "npm install\n"
         "npm run dev       # next dev --webpack -p 3000\n"
         "npm run build     # production build\n"
         "npm run start     # next start -p 3000",
         "Setup & scripts (package.json)"),
        ("table", ["Env var", "Used for"],
         [["OPENAI_API_KEY / OPENAI_MODEL", "Storyboard LLM option"],
          ["DEEPSEEK_API_KEY / DEEPSEEK_MODEL", "Storyboard LLM option"],
          ["GOOGLE_API_KEY / GOOGLE_MODEL", "Storyboard LLM option + "
           "direct Nano-Banana-Google image gen"],
          ["OPENROUTER_API_KEY (+ OPENROUTER_IMAGE_MODEL)", "Storyboard "
           "LLM, image gen/analyze/stylize, music-prompt drafting"],
          ["ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID", "Voiceover TTS "
           "and Music API"],
          ["ARK_API_KEY / ARK_VIDEO_MODEL", "Seedance video gen"],
          ["KLING_ACCESS_KEY / KLING_SECRET_KEY / KLING_MODEL / "
           "KLING_BASE", "Optional Kling video gen"],
          ["PUBLIC_BASE_URL", "Lets Ark fetch locally-hosted reference "
           "images in production"],
          ["REPLICATE_API_TOKEN", "Fallback image provider — used in "
           "code but missing from .env.local.example"],
          ["SUNO_API_KEY", "Unused / dead — no route references it"]]),
        ("callout", "Note",
         "No test command or framework is configured (package.json's "
         "\"test\" script is a placeholder that exits 1). Run "
         "npx tsc --noEmit before committing; there is one known "
         "pre-existing error at app/api/export/route.ts:109 (Section "
         "3.1) that is safe to ignore unless you're touching that file."),
    ])

    output_path = os.path.join(OUTPUT_DIR, "Storyboard_Studio_Workflows.pdf")
    pdf.save(output_path)
    print(f"[OK] Workflows: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    return output_path

if __name__ == "__main__":
    build()
