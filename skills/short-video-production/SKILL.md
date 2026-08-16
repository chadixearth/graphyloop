---
name: short-video-production
description: Use when turning a finished story or script into a rendered ~1-minute video: HyperFrames composition, scene timing, captions, voiceover sync, 9:16 export. Not for story writing (use story-engineering).
---

# Short Video Production

## 1. Overview

Pipeline from script to rendered MP4: script with per-scene timing → composition (HTML/CSS-keyframe, deterministic) → render → 9:16 MP4.

Default renderer: HyperFrames (HTML→video, local, deterministic). Read the hyperframes skill first — hyperframes-core for composition contract, hyperframes-cli for commands — before building.

## 2. 60s Scene Plan

5-6 scenes matching story-engineering beat sheet:

| Time | Scene |
|---|---|
| 0-3s | Hook |
| 3-8s | Context |
| 8-45s | Body (2-3 scenes, micro-payoffs) |
| 45-55s | Payoff |
| 55-60s | CTA |

## 3. Composition Rules

- 9:16 (1080x1920) for Shorts/TikTok/Reels
- One visual idea per scene
- Captions word-synced to voiceover (show the spoken word chunk)
- Text large and mobile-readable
- No flicker / animation overload — deterministic keyframes only
- Prefer transform/opacity animation (60fps safe)

## 4. Voiceover

- ~150-160 words per 60s; 2.5-2.7 words/sec
- Mark per-scene word counts in the script
- Pause 0.3-0.5s at beat boundaries
- No TTS key available → render silent with captions, note audio step

## 5. Render Checklist

- Verify composition validates (`hyperframes lint` / `validate`)
- Render at 1080x1920
- Check hook frame: first 3s must show tension text
- Check captions legible on small screen
- Export MP4
- Name output `video.mp4`

## 6. Common Failures

- Bare `waitForLoadState` hangs on SSE pages — never use
- Browser timeouts must be explicit (`page.goto` 15000ms)
- Render fails twice → stop and report, no silent looping

## 7. Cross-Reference

- story-engineering — source story
- video-ai-automation — tool stack incl. TTS options
