# Selected GitHub repositories · gta-studio

Research date: 2026-11-18. These are public **reference repositories, not bundled dependencies**. README and repository metadata were checked via the connected GitHub source. Before installing or copying code, inspect the repository's current tag, license, security posture, CLI contract, and compatibility with the project's pinned versions. **No `git clone` or `npx install` should occur simply because a repo is listed here.** The user's list is a menu to curate, not 13 mandatory integrations.

## P0 — keep and reuse what Bay Referee already has

| Repository | Decision | Rationale / actual use |
| --- | --- | --- |
| https://github.com/heygen-com/hyperframes | **KEEP / primary compositor** | Already used in Bay Referee. HTML/CSS/JS and seekable frame-accurate composition; preserve a tested pinned version, check CLI and skills compatibility before an upgrade. Recent project also offers `reverse-any-video` and `style-sampling` skills; those can meet reference-analysis needs without a new Python package. |
| https://github.com/greensock/GSAP | **KEEP / existing animation** | Already present in Bay Referee; reuse deterministic, time-seekable animations, not real-time browser clocks. No second timeline/render framework. |

Existing Bay Referee FFmpeg/ffprobe, Sharp, Whisper medium, asset provenance schemas, QA and OS-wide heavy-job lease remain the implementation foundation. Source: https://github.com/enqinsel/bay-referee (read-only).

## P1 — optional, high-value *reference* tools; not pilot dependencies

| Repository | Decision | Rationale / exact trigger |
| --- | --- | --- |
| https://github.com/JuneYaooo/rea-video | **USE ON-DEMAND for analyzing a reference video**, not as an editor | CLI analyses provided local clips shot by shot and produces `VIDEO.md` plus reports; useful to infer cut rhythm, source/graphic ratio, camera motion, visual hierarchy. Requires Python >=3.10 and FFmpeg; optional model access may cost money. **Do not install for EP01 if HyperFrames' already-available reverse-video skills or a manual reference breakdown suffice.** Never use analysis to clone another creator's images/voice/branding/shot order. |
| https://github.com/lemomo-ai/lemo-opuscar | **READ STYLE GUIDANCE selectively**, no engine installation | `styles/visual-investigation/STYLE.md` and selectively `styles/hologram-hud/STYLE.md`, `styles/neon-tubes/STYLE.md` illustrate evidence-first investigations and sparing sci-fi accents. Its ready-made code-film system targets Claude and is not needed for an archive-led long-form episode. **Do not copy its demo films, artwork, fonts, source code or full style prompts**; reuse only independently designed high-level principles after licensing checks. GitHub's license identifier is not unambiguously resolved for this repo. |
| https://github.com/mrdoob/three.js | **OPTIONAL if a clearly useful 3D diagram is proven necessary** | A lightweight targeted Three.js scene may help explain a confirmed map/camera relationship. It must be labeled schematic and never presented as actual in-game footage. Skip for pilot unless a specific shot cannot be done well in 2D. |

## P2 — defer or skip in the first production

| Repository | Decision | Why not now |
| --- | --- | --- |
| https://github.com/remotion-dev/remotion | **DEFER** | Capable React video pipeline, but switching/adding a compositor would duplicate tested HyperFrames and delay the pilot. Consider only for a documented blocker, with licensing and performance review. |
| https://github.com/remotion-dev/skills | **DEFER together with Remotion** | Useful only if a Remotion pipeline is actually adopted; don't install best-practice skills for a renderer we are not using. |
| https://github.com/storytold/effectcraft | **DEFER** | Promising Rust compositor with CLI/MCP and effects; still changing rapidly, adds a separate project format and rendering/QA burden. Not necessary to edit sourced GTA clips. |
| https://github.com/ahujasid/mcp-for-blender | **SKIP for pilot** | 3D scene creation is unrelated to sourced GTA investigation and adds install/render complexity on an M4/16 GB Mac. Can revisit for a genuine schematic, not game recreation. |
| https://github.com/Comfy-Org/ComfyUI | **SKIP for pilot** | Local diffusion generation is memory-heavy and contrary to the user's real-game-media-first requirement. No synthetic GTA gameplay or NPC shots. |
| https://github.com/heydamir/unslop | **PRINCIPLES ONLY, no install** | Focused on UI/website polish, not documentary montage. Its anti-generic-UI diagnosis is conceptually helpful for optional HTML preview screens, but not a core video dependency. |
| https://github.com/pbakaus/impeccable | **PRINCIPLES ONLY, no install** | Primarily interface design audits. The optional live mode can run external coding agents with bypassed permission/sandbox settings; never enable that behavior for the video workspace. Refer to typography/review concepts only. |
| https://github.com/anthropics/skills | **REFERENCE ONLY** | General Agent Skills patterns and examples; our GTA skill already has a valid `SKILL.md` layout. No runtime functionality needed. |

## Explicit minimum viable stack

**Default:** existing Bay Referee HyperFrames + GSAP + FFmpeg + Sharp + Whisper + Higgsfield/ElevenLabs v4 + GTA-specific storyboard/source registers + local QA. **Optional exploration:** one reference-video breakdown using existing HyperFrames skills or rea-video, and 1–2 high-level code-film style concepts from lemo-opuscar. **Avoid** cloning 13 repositories, auto-updating global tooling, custom 3D pipelines, extra AI-video generation, UI dashboard building, or a new render framework before EP01 is watchable.

## Short compatibility and security checklist

1. Inspect the exact checked-out versions and compare CLI options to Bay Referee's `hyperframes` pin before changing code. Pin any new dependency and keep its license in the inventory.
2. Reuse the existing OS-level cross-project flock rather than inventing a new one; avoid parallel memory-heavy jobs.
3. Do not execute arbitrary repository install scripts, global plugins/hooks or permission-bypassing live modes without review. Install only isolated, understood, necessary dependencies.
4. Repository source code licenses do not grant rights to GTA clips, demonstration videos, reference media, game logos or creator footage.
5. Prefer a written testable reason for an integration (specific scene / quality / missing capability) to popularity or GitHub star counts.
