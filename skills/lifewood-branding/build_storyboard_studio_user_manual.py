#!/usr/bin/env python3
"""Build Storyboard Studio (AIGC Automation / Seedance) User Manual PDF with
Lifewood branding — editorial style.

Content verified against README.md, docs/pipeline-providers.md,
docs/kling-setup.md, and a full source-tree read of app/page.tsx,
app/_components/*, app/api/*/route.ts, lib/* (repo
https://github.com/LifewoodPH/AIGC_AUTOMATAION_SEEDANCE.git, local clone at
Lifewood-Development/LifeStory). No invented features. Known README/code
discrepancies (music provider, export status, LLM/image/video providers)
are corrected here to match the actual shipped code, not the stale README.
"""

import sys
import os

SKILL_DIR = r"C:\Users\richa\.config\opencode\skills\lifewood-branding"
sys.path.insert(0, SKILL_DIR)

from lifewood_pdf_builder import LifewoodPDF
from lifewood_pdf_design_system import PdfSpecLock

OUTPUT_DIR = r"C:\Users\richa\OneDrive\Desktop\Lifewood-Development\LifeStory\deliverables"
TITLE = "Storyboard Studio"
SUBTITLE = "User Manual"
DATE = "July 27, 2026"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def build():
    sections = [
        "1.0  Getting Started",
        "2.0  Two Ways to Work: Studio Mode vs. Fast Mode",
        "3.0  Studio Mode: Configure & Generate",
        "4.0  Studio Mode: Storyboard, Editor & Export",
        "5.0  Fast Mode: The One-Shot Pipeline",
        "6.0  Content Types & Visual Styles",
        "7.0  API Keys, Presets & Personal Styles",
        "8.0  Costs & Exporting Your Video",
        "9.0  Troubleshooting",
    ]
    page_map = {"1.0": 3, "2.0": 4, "3.0": 5, "4.0": 6, "5.0": 7,
                "6.0": 9, "7.0": 10, "8.0": 11, "9.0": 12}

    PdfSpecLock.write_spec_lock(
        OUTPUT_DIR, title=f"{TITLE} - {SUBTITLE}",
        audience="user", page_count=12, sections=sections,
    )

    pdf = LifewoodPDF(TITLE, subtitle=SUBTITLE, audience="user",
                      date_str=DATE, variant="editorial")
    pdf.add_cover()
    pdf.add_toc(sections, page_map=page_map)

    # 1.0 Getting Started
    pdf.add_mixed_content_page("1.0", "Getting Started", [
        ("body", "Storyboard Studio turns a source document (a PDF or an "
         "image) into a narrated AI video storyboard — script, images, "
         "video clips, voiceover, and music — that you can review, "
         "regenerate, and export. It is a Next.js 15 web app developed by "
         "Lifewood PH."),
        ("code", "cp .env.local.example .env.local\n"
         "npm install\n"
         "npm run dev\n"
         "# open http://localhost:3000",
         "Run locally"),
        ("body", "The app runs fully without any API keys — every "
         "integration (script writing, images, video, voiceover, music) "
         "falls back to mock or placeholder output, so you can try the "
         "whole flow before adding real keys."),
        ("table", ["Add this key", "Unlocks"],
         [["OPENROUTER_API_KEY", "Real storyboard writing, image "
           "generation, cover analysis, and hero-image compositing"],
          ["ELEVENLABS_API_KEY", "Real voiceover (ElevenLabs TTS) and "
           "real background music (ElevenLabs Music)"],
          ["ARK_API_KEY", "Real Seedance text/image-to-video generation"],
          ["KLING_ACCESS_KEY / KLING_SECRET_KEY", "Optional alternative "
           "image-to-video provider (Kling)"],
          ["REPLICATE_API_TOKEN", "Optional fallback image provider "
           "(FLUX) if OpenRouter's image model is unavailable"]]),
        ("callout", "Note",
         "The README mentions Suno for music — that integration was "
         "replaced. Music is generated through the ElevenLabs Music API "
         "using your ELEVENLABS_API_KEY; the Suno env vars are unused."),
    ])

    # 2.0 Two Ways to Work
    pdf.add_mixed_content_page("2.0", "Two Ways to Work: Studio Mode vs. Fast Mode", [
        ("body", "The home page has two tabs at the top: \"Studio (full "
         "control)\" and \"Fast Mode (doc \u2192 final video)\". They are "
         "two independent workflows, not steps of one wizard — pick the "
         "one that fits how much control you want."),
        ("table", ["", "Studio Mode", "Fast Mode"],
         [["Flow", "3-step manual wizard: Configure \u2192 Storyboard "
           "\u2192 Edit", "One continuous automatic pipeline"],
          ["Best for", "Fine-tuning frame-by-frame before generating "
           "video", "Going from a document to a finished MP4 quickly"],
          ["Content types", "Generic video formats (explainer, "
           "cinematic, promo, etc.)", "9 specialised types including "
           "book trailers"],
          ["Music", "Not wired up (placeholder in the timeline editor)",
           "Full ElevenLabs soundtrack with volume mixing"],
          ["Final export", "Not implemented — the Edit step's Export "
           "button is a placeholder", "Fully implemented: compiled MP4 "
           "plus a downloadable ZIP of every asset"],
          ["Presets / provider picker", "Saved presets sidebar only",
           "Presets, saved sessions, API-key overrides, and a "
           "per-step provider picker"]]),
        ("callout", "Tip",
         "If your goal is a finished video, start in Fast Mode. Use "
         "Studio Mode when you want to hand-edit shot descriptions, "
         "voiceover lines, and prompts before committing to generation."),
    ])

    # 3.0 Studio Mode: Configure & Generate
    pdf.add_mixed_content_page("3.0", "Studio Mode: Configure & Generate", [
        ("body", "Step 1 (\"Configure\") is where you set up everything "
         "the storyboard writer needs before it runs."),
        ("steps", [
            "Pick a target video length (15 to 180 seconds).",
            "Upload one or more source PDFs or images with the drop zone.",
            "Optionally add a short \"Story direction\" note (up to "
            "1,000 characters) to steer tone or focus.",
            "Pick a video format from the Style Picker (explainer, "
            "cinematic, social-short, documentary, promo, tutorial, "
            "story, or corporate).",
            "Pick a Visual Style — built-in (26 styles, e.g. "
            "photorealistic, anime, watercolor, cyberpunk) or one of "
            "your saved Personal Creations — and optionally attach a "
            "reference image.",
            "Open \"Fine-tuning\" to adjust frame count, per-frame "
            "duration, narrator voice, aspect ratio, tone, and "
            "creativity.",
            "Tick \"Auto-generate images & videos\" if you want every "
            "frame's image and clip created automatically, or leave it "
            "off to generate them one at a time later.",
            "Click \"Generate storyboard \u2192\".",
        ]),
        ("callout", "Note",
         "Voiceover is always generated automatically for every frame "
         "as soon as the storyboard is written — the auto-generate "
         "checkbox only controls images and video clips."),
    ])

    # 4.0 Studio Mode: Storyboard, Editor & Export
    pdf.add_mixed_content_page("4.0", "Studio Mode: Storyboard, Editor & Export", [
        ("body", "Step 2 (\"Storyboard\") lists every frame with its shot "
         "description, voiceover text, and image/video prompt, each with "
         "its own Generate/Regenerate buttons. A \"Redistribute "
         "voiceovers\" button lets you re-split the narration across "
         "frames if the pacing feels off. You can save the current "
         "configuration as a named preset, or save/update the whole "
         "session as a named storyboard to reopen later."),
        ("body", "Step 3 (\"Edit\") opens a timeline editor: play/pause "
         "preview, reorder or split clips, delete a frame, and edit shot "
         "text, voiceover, image prompt, or duration per frame."),
        ("callout", "Warning",
         "The \"Export video\" button on the Edit step is not yet "
         "implemented — clicking it shows a placeholder message. There "
         "is also no music track in the Studio-mode timeline. If you "
         "need a finished, exportable MP4 with a soundtrack, use Fast "
         "Mode instead (Section 5.0)."),
        ("body", "Every saved preset and saved storyboard is listed in "
         "the left Sidebar drawer, where you can rename, overwrite, or "
         "delete them."),
    ])

    # 5.0 Fast Mode: The One-Shot Pipeline
    pdf.add_mixed_content_page("5.0", "Fast Mode: The One-Shot Pipeline", [
        ("body", "Fast Mode runs one continuous pipeline from your "
         "uploaded document to a finished, downloadable video. Set your "
         "options (duration, aspect ratio, content type, music and "
         "subtitle toggles, audio mix sliders) and click Run — the six "
         "stages below execute automatically in order:"),
        ("table", ["Stage", "What happens"],
         [["1. Storyboard", "Analyzes your document and writes the "
           "shot-by-shot script"],
          ["2. Images", "Generates a preview image for each frame"],
          ["3. Videos", "Renders each frame into a video clip "
           "(Seedance by default, or Kling if selected)"],
          ["4. Voiceover", "Generates narration audio for every frame "
           "(ElevenLabs)"],
          ["5. Music", "Generates an instrumental soundtrack matched "
           "to your content (ElevenLabs Music)"],
          ["6. Compile", "Stitches everything into one final MP4, with "
           "burned-in subtitles if enabled"]]),
        ("body", "A progress card shows every stage's status live. Use "
         "the List/Canvas toggle to switch between a simple progress "
         "list and a visual node-graph view of the whole pipeline. Every "
         "frame's image, video, or voiceover can be regenerated "
         "individually without re-running the rest of the pipeline, and "
         "an in-progress video render can be stopped per frame."),
    ])
    pdf.add_mixed_content_page("5.1", "Fast Mode: The One-Shot Pipeline (cont.)", [
        ("body", "The \"Pipeline providers\" strip near the top lets you "
         "pick, per stage, which service does the work — for example "
         "Image Gen can run on OpenRouter, Replicate, or Pollinations, "
         "and Video Gen can run on Seedance or Kling. Your choice is "
         "tried first; if it fails or its key is missing, the app falls "
         "back through the remaining providers automatically so the "
         "pipeline still completes."),
        ("callout", "Note",
         "The provider picker is a recent addition and is still being "
         "verified end-to-end. If Kling is picked for a run that isn't "
         "a book trailer, middle frames may fail with a \"needs an "
         "image\" error, because those frames don't get a still image "
         "generated by default. Switch to Seedance, or generate each "
         "frame's image manually first, if you hit this."),
        ("body", "When the run finishes you get a compiled MP4 and, if "
         "you export, a ZIP containing that video, every individual "
         "image/clip/voiceover file, the script, and a cost report — see "
         "Section 8.0."),
    ])

    # 6.0 Content Types & Visual Styles
    pdf.add_mixed_content_page("6.0", "Content Types & Visual Styles", [
        ("body", "Fast Mode offers 9 content types, each tuning the "
         "storyboard writer's tone and structure: book-trailer, "
         "book-cinematic-trailer, book-synopsis, marketing, news, "
         "educational, pitch, explainer, and story."),
        ("table", ["Content type", "Special behavior"],
         [["book-trailer", "Frame 1 and the last frame become "
           "\u201chero\u201d shots: a photoreal 3D book composite built "
           "from your uploaded (or auto-extracted) cover image"],
          ["book-cinematic-trailer", "Locked to 15 frames at 12 "
           "seconds each (180s total); only the last frame is a hero "
           "shot; the storyboard writer follows stricter cinematic "
           "trailer rules (dialogue vs. narration balance, multi-beat "
           "\u201ccut to\u201d prompts)"],
          ["All other types", "No hero-frame compositing; standard "
           "text-to-video for every frame"]]),
        ("body", "For book content types you can pick a visual "
         "\"style preset\" for the environment around the book "
         "(photoreal, anime, 3D animation, doodle, watercolor, comic, "
         "oil painting, or mixed) — the cover artwork itself is always "
         "preserved exactly, never redrawn."),
        ("body", "Beyond book styles, the Visual Style picker (used in "
         "both modes) offers 26 built-in looks — photorealistic, "
         "cinematic, cartoon, anime, pixel art, 3D render, watercolor, "
         "cyberpunk, vaporwave, and more — plus any Personal Creations "
         "you've saved from your own reference images (Section 7.0)."),
    ])

    # 7.0 API Keys, Presets & Personal Styles
    pdf.add_mixed_content_page("7.0", "API Keys, Presets & Personal Styles", [
        ("body", "The API Keys panel (Fast Mode) lets you enter or "
         "override any provider key from the browser instead of editing "
         ".env.local — useful for trying a different key without "
         "restarting the server. Keys are stored in your browser only, "
         "and a \"Test keys\" button checks each configured provider is "
         "reachable. You can also drag a .env file onto the panel to "
         "import keys in bulk."),
        ("body", "Presets save your Studio-mode configuration (story "
         "direction, format, visual style, fine-tuning) under a name so "
         "you can reuse it later. Personal Styles let you upload a "
         "reference image with a name and description, which then "
         "appears alongside the built-in visual styles."),
        ("callout", "Warning",
         "Presets and Personal Styles are currently stored on a fixed "
         "folder path that only exists on the original developer's Mac "
         "(an external drive). On any other machine, saving a preset or "
         "a personal style will fail. Saved storyboards/sessions do not "
         "have this problem — they save to a local data folder inside "
         "the project automatically if that Mac path isn't found."),
    ])

    # 8.0 Costs & Exporting Your Video
    pdf.add_mixed_content_page("8.0", "Costs & Exporting Your Video", [
        ("body", "The Costs page (top navigation) shows running totals "
         "for every paid API call the app has made: images, video, "
         "voiceover, music, and storyboard writing, broken down by "
         "provider, with a table of your saved sessions and the most "
         "recent 200 calls."),
        ("callout", "Note",
         "All figures are estimates from a fixed price list, not real "
         "billing data from your provider accounts. Treat them as a "
         "guide, not an invoice."),
        ("body", "To get your finished video out of Fast Mode:"),
        ("steps", [
            "Let the pipeline run through the Compile stage — this "
            "produces a playable final MP4 with subtitles burned in if "
            "you enabled them.",
            "Use \"Compile only\" to re-run just the final stitching "
            "step if you've regenerated individual clips since the "
            "last compile.",
            "Click Export to download a ZIP containing the compiled "
            "video (with and without subtitles), every individual "
            "image/clip/voiceover asset, the script, and a cost report.",
        ]),
        ("callout", "Note",
         "Studio Mode has no equivalent export — its timeline editor's "
         "Export button is a placeholder (see Section 4.0)."),
    ])

    # 9.0 Troubleshooting
    pdf.add_mixed_content_page("9.0", "Troubleshooting", [
        ("table", ["Symptom", "Likely cause / what to do"],
         [["\"Cannot find module 'pdf-parse'\"",
           "Run npm install again"],
          ["Voiceover is silent / a 1-second blank clip",
           "ELEVENLABS_API_KEY is missing — add it, or check the key "
           "in the API Keys panel"],
          ["No music, or music step shows mock output",
           "ELEVENLABS_API_KEY is missing (music also runs through "
           "ElevenLabs, not Suno)"],
          ["Images all look like generic stock photos",
           "REPLICATE_API_TOKEN / OPENROUTER_API_KEY not set — the "
           "app is using the free Pollinations fallback"],
          ["Video stage never finishes / stays mock",
           "ARK_API_KEY (Seedance) is missing; add it or switch the "
           "Video Gen provider to Kling with Kling keys set"],
          ["Kling video fails with \"needs an image\"",
           "Kling requires a still image per frame; only book-trailer "
           "hero frames get one automatically outside that mode "
           "(Section 5.1) — switch to Seedance or generate the "
           "frame's image manually first"],
          ["Saving a preset or personal style fails",
           "That feature is hardcoded to a Mac-only folder path "
           "(Section 7.0) — not available on other machines"],
          ["Port 3000 already in use",
           "Start with a different port: npm run dev -- -p 4000"]]),
    ])

    output_path = os.path.join(OUTPUT_DIR, "Storyboard_Studio_User_Manual.pdf")
    pdf.save(output_path)
    print(f"[OK] User manual: {output_path}")
    print(f"     Size: {os.path.getsize(output_path)} bytes")
    return output_path

if __name__ == "__main__":
    build()
