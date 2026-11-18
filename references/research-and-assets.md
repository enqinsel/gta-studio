# Research, story claims, source media and asset decisions

## Source hierarchy
1. Current official GTA VI site, Rockstar Newswire, media/gallery/trailers, in-game official content and notes. Start with: `https://www.rockstargames.com/VI` and `https://www.rockstargames.com/VI/media`.
2. Credible dated launch reviews / technical analyses, with evidence traceable to recorded gameplay and original reporters. Prefer two independent checks for high-stakes specificity.
3. Other publishers' creator gameplay/long-form analysis and official GTA V assets as discovery/visual references; distinguish a link to a video from permission or actual local edit access.
4. Fan maps, Reddit, YouTube, comments: leads and audience interest only; separately verify before any narration that states them as facts.

## Factual classification
Every assertion gets `claim_id`, exact wording, evidence URL, date observed/published, source type, relevant excerpt/timecode, and one status:
- `OFFICIALLY_CONFIRMED`: express Rockstar source states/shows it unambiguously.
- `OBSERVED`: directly visible in identifiable real game material, but not a named/confirmed system or fact unless sufficient.
- `INDEPENDENTLY_VERIFIED`: post-release, supported by independent credible observed evidence (with conditions/platform/version).
- `INFERENCE`: grounded deduction; narration must say it is inference.
- `SPECULATION`: unverified theory; never put it in a title or absolute claim without explicit qualification.
- `CONTRADICTED` or `UNKNOWN`: exclude from factual narration until resolved.

Log `research/claims.json` and an accessible `research/source-notes.md`. Verify publisher/game version, release dates, region and platform whenever comparing. An attributed rumor is still a rumor. Do not turn a "leak" into confirmed material.

## Topic scouting for future episodes (not a replacement for two booked topics)
Find meaningful story opportunities in GTA VI. Make a small evidence table of: video idea, why viewers care now, official factual support, available real visuals, independent coverage, last update date, competing YouTube titles/observed metrics, what is original in our angle, risks. YouTube Data API generally supplies total view counts, **not verified historical views gained in 24h**; measure daily deltas over time if collecting snapshots. An external platform's claimed outlier score must be attributed and not used as sole proof.

## Real visual sourcing policy
Priority: authentic, relevant moving footage > authentic screenshot > original Rockstar primary artwork/material > real GTA V comparison footage > official map/evidence > original motion graphics that explain the actual evidence. Record each used excerpt's source URL, uploader/publisher, in/out, scene purpose, local path/hash, identity/version, source type, provenance, and `rights_status`. Use footage as evidence embedded in original commentary, not as an uninterrupted substitute for viewing the original video.

No fake GTA VI gameplay, invented city views, fabricated NPC behavior, false HUD, fake leaked clips, AI-made gameplay or "concept" art masquerading as official. No generic AI stock montage for paragraphs. Actual real-world Miami/Florida stock must not be called "a GTA VI scene". If an illustration/diagram is needed, make it clearly analytical and grounded. A speculative map must say "approximation / fan reconstruction" and may never count as a confirmed location.

## Rights/status with fast private-cut workflow
- `APPROVED`: known relevant usage basis and terms recorded.
- `REVIEW`: actual usage terms unresolved; permitted to assemble **private, non-published** review footage only if lawfully accessible, with exact identified source and rights caveat in delivery.
- `RESTRICTED`: prohibited use or access requiring bypass; do not ingest/use.

Keep a short `assets/source-register.json` and `assets/credits.md`. Do not start the project with a copyright essay; collect enough metadata to revisit before publishing. No download methods that circumvent platform restrictions; do not remove watermarks/identifiers or repackage third-party streams as owned footage. User conducts the final release decision after a real review cut; `REVIEW` never silently becomes `APPROVED`.

## Music and SFX
Avoid ripping GTA radio tracks/soundtrack from trailers or gameplay and embedding them into the master; original source embedded audio may trigger claims. Prefer the mute/ducked original clip with an intentionally licensed underscore and sparse effects; retain spoken original audio only when the narration analyzes it and its use is reviewed.
