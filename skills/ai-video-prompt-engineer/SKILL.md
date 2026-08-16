---
name: ai-video-prompt-engineer
description: "Use when the user wants to create AI video generation prompts for a brand, product, website, or topic. Includes interactive Q&A flow to gather requirements then outputs a single unified prompt (one paste) for tools like OmniFlash, Runway, Pika, Kling, Sora. Do NOT use for HyperFrames/Remotion video creation workflows."
---

# AI Video Prompt Engineer

## Overview

Generate production-quality AI video prompts through an interactive 7-question flow. Output is always a **single unified prompt** describing all segments in one continuous timeline — one copy-paste, no repeated pasting per segment. Designed for OmniFlash and similar AI video models.

## The Output Contract

The output file MUST follow this exact structure:

```
# [Title] — [Duration] [Style] Film
## Single Unified Prompt — One Paste for OmniFlash

---INSTRUCTION (read first)---

Rules the AI video model must follow:
- Anti-Slop Constitution: no glitch, no lens flare, no floating AI brains, no robots, no particle explosions, no hexagonal wireframe tunnels, no holographic hands
- Real humans only — every scene features people doing real work (no androids, no synthetic humans, no faceless silhouettes)
- Natural color names only in prompt body — hex codes go in FOR EDITOR section at bottom
- Mobile-readable text overlays (minimum 5% of frame height), clean geometric sans-serif, high contrast
- Natural motivated lighting (window light, monitor glow, golden hour) — not flat studio
- Smooth purposeful camera movement (gimbal/dolly/slider) — no handheld/shaky
- Voice-visual match: tone of visuals matches tone of the brand

---[00:00-00:XX] SEGMENT 1 — NAME---

Full scene description for segment 1. Include:
- Camera movement, lighting, color palette, human activity, setting
- Text overlay content, timing, position, color (natural name)
- Transition instruction for end of segment

---[00:XX-00:YY] SEGMENT 2 — NAME---

Full scene description for segment 2. Same level of detail. No cross-references to segment 1 — fully standalone description.

---[00:YY-00:ZZ] SEGMENT 3 — NAME---

Full scene description for segment 3.

---FOR EDITOR — Hex Codes & Technical Specs---

| Natural Name | Hex Code | Usage |
|---|---|---|
| [description] | #[code] | [where used] |

Plus: font specs, logo rules, aspect ratio, audio direction.
```

## Interactive Flow

Ask **ONE question at a time** via the `question` tool. Do NOT batch questions. Wait for user answer before asking next.

### Q1 — Topic
- Ask: "What topic / brand / website do you want the AI video prompts about?"
- If URL provided, fetch it for content. If topic alone, proceed.
- After answer, acknowledge and move to Q2.

### Q2 — Duration
- Options: 15s / 30s / 60s / 90s / Custom
- Label clearly: 15s = short social teaser, 30s = standard social clip, 60s = brand story, 90s = full narrative
- After answer, calculate segment length (duration ÷ N segments — not yet asked) and move to Q3.

### Q3 — Slice Structure (number of segments)
- Options: 3 segments / 4 segments / 5 segments / Custom
- After answer, calculate approximate per-segment duration and move to Q4.

### Q4 — Narrative Arc
- Options: Problem→Solution→CTA / Hook→Detail→Proof / Vision→Capability→Impact / Custom
- After answer, move to Q5.

### Q5 — Visual Approach
- Options: Cinematic / Mixed (text+B-roll) / Text Cards (kinetic typography) / Person on Camera / Product Demo
- After answer, move to Q6.

### Q6 — Tone
- Options: Professional / Warm / Energetic / Calm / Humorous
- After answer, move to Q7.

### Q7 — Brand Colors or Style References (optional)
- Ask: "Do you have brand colors or style references, or should I use natural cinematic color language?"
- If they provide brand colors: use natural color names in prompts, hex codes in FOR EDITOR table
- If they say no: use natural cinematic color language (warm amber, deep teal, cream, etc.)
- After answer, generate the full output.

## Generation Rules

### Anti-Slop Constitution (mandatory, include in every output INSTRUCTION block)

1. **Natural color names only** in prompt body — never hex codes in scene descriptions. Hex codes go ONLY in the FOR EDITOR section at bottom.
2. **Voice-visual match enforced** — a professional brand gets clean corporate visuals, not playful animation. A warm brand gets soft natural lighting, not harsh studio.
3. **Clear mobile-readable text** — text overlays minimum 5% of frame height, high contrast against background, geometric sans-serif.
4. **No glitch/distortion** — no VHS effects, no screen tearing, no corrupted pixels.
5. **No generic AI slop** — no floating brains, no glowing robot heads, no particle explosions, no hexagonal wireframe tunnels, no holographic hands touching data, no lens flare.
6. **Seamless crossfade transitions** between segments — 1.5–2s overlap. Describe the transition visual (e.g., "data viz dissolves into neural network patterns").
7. **Real humans** in every scene — no androids, no synthetic humans, no faceless mannequins, no silhouettes. People doing real work.

### Output Rules

1. **Single unified prompt** — ALL segments in ONE document. One paste. Never produce separate prompts per segment.
2. **INSTRUCTION block first** — global rules the AI video model must follow, before any scene descriptions.
3. **Timestamp markers** — `[00:00-00:10]`, `[00:10-00:20]` etc. for every segment.
4. **Fully standalone scene descriptions** — each segment described completely without referencing other segments. Include camera, lighting, color, people, action, text overlays, transitions.
5. **FOR EDITOR section at the bottom** — hex code table, font specs, logo rules, aspect ratio, audio direction.
6. **If brand colors provided:** natural color names in prompt body (e.g., "deep forest green"), exact hex codes in FOR EDITOR table.

### File Output

Save the unified prompt to a timestamped file:
- Path: `C:\Users\richa\AppData\Local\Temp\opencode\<topic>-<duration>-prompts.md`
- Show user the file path at end

## Example Output Structure

For a 30s video with 3 segments:

- 1 unified markdown file
- INSTRUCTION block at top (anti-slop rules, color rule, legibility, lighting, camera, humans)
- Segment 1 [00:00-00:10] — full scene, text overlay at :03, transition at end
- Segment 2 [00:10-00:20] — full scene, text overlay at :05 of segment, transition at end
- Segment 3 [00:20-00:30] — full scene, final text overlays, end frame, fade
- FOR EDITOR table — all hex codes, font, logo, audio direction

## Common Mistakes

| Mistake | Fix |
|---|---|
| Producing separate prompts per segment | Merge into ONE unified prompt with timestamp markers |
| Hex codes in scene descriptions | Move all hex codes to FOR EDITOR section; use natural color names in body |
| Cross-referencing between segments ("opens from the crossfade") | Write each segment as fully standalone — no "from the previous scene" references |
| Generic AI imagery (robots, brains, particles) | Replace with real human activity, real environments, real technology applications |
| No INSTRUCTION block | Always start with a clear read-first instruction block for the AI model |
| Text overlays too small for mobile | Minimum 5% of frame height, high contrast, clean sans-serif |
| Vague transitions ("scene changes") | Describe the exact visual transition (crossfade with specific element morphing) |
