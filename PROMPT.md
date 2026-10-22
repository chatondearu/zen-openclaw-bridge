# GOAL — Zen WebExtension ↔ OpenClaw work (acteur + observateur)

## Context
Romain wants a **personal, public** Firefox/Zen WebExtension that bridges his
**real signed-in Zen tabs** to **OpenClaw work** on the same Mac
(`OPENCLAW_STATE_DIR=/cda/openclaw-work`, gateway loopback `:18900`).

OpenClaw already has a **Chrome** extension relay (`openclaw browser extension`)
that does actor-mode on Chromium. **Zen is Firefox-based** — that Chrome
extension cannot be reused. Build a **Zen-native** WebExtension instead.
Do **not** put this inside `ai-dev-kit` or `nix-config`. This repo is
`/cda/dev/zen-openclaw-bridge` (public GitHub).

## Primary goal
Ship an MVP extension that can:
1. **Observe** allowlisted origins (start with `*.slack.com`) — extract readable
   text / notifications / “needs attention” signals from the active (or listed)
   tabs and push events to OpenClaw.
2. **Act** (acteur) on allowlisted tabs when OpenClaw requests it — open/focus
   URL, snapshot DOM/text, click/type via content-script messaging (Firefox
   WebExtensions APIs; **no** `chrome.debugger`).

## Hard constraints
- Firefox / Zen WebExtension only (Manifest V3 if Zen supports it; else MV2 with
  a clear note).
- Kill switch: disabling the extension or logging out of the site = no more data.
- Local-only bridge by default: `http://127.0.0.1:<port>` or native messaging to
  a tiny helper; **no** cloud relay in v1.
- Never scrape arbitrary sites by default — **allowlist** of origins in options.
- No Slack App / OAuth in v1 (session cookies in Zen are the auth).
- Do not store Slack tokens or cookies in git / OpenClaw config files.
- Security: treat the bridge like operator access (loopback + shared secret /
  pairing token). Document risks in README.
- Code comments in English; user-facing README can be French or bilingual.
- Keep It Simple: smallest working observer first, then actor actions.
- Follow conventional commits. Prefer French replies to the human.

## Soft constraints / preferences
- Optional later: wire events into OpenClaw as drafts under
  `/cda/openclaw-work/drafts/` or inbox JSON under
  `/cda/openclaw-work/inbox/web/` — prefer the simplest documented hook.
- Align naming with OpenClaw concepts where useful (snapshot, tabs, allow/pause)
  but do not fork OpenClaw Chrome extension code unless license-compatible and
  actually portable (assume it is **not** portable).

## Out of scope (v1)
- Chrome Web Store packaging / OpenClaw official Chrome extension port
- Multi-machine / remote Gateway
- Full generic “control entire browser OS”
- Auto-send Slack messages without human confirm (drafts / propose only)

## Deliverables
1. Extension scaffold loadable in Zen (`about:debugging` → temporary add-on)
2. Options page: OpenClaw bridge URL/secret, origin allowlist, Pause/Allow
3. Background + content scripts: observe → POST/event to bridge
4. Minimal actor API: `tabs.list`, `tabs.focus`, `page.snapshot`, `page.click`,
   `page.type` (even if stubbed behind a local HTTP for OpenClaw to call)
5. README: install in Zen, pair with OpenClaw work, threat model, why not Chrome
6. `docs/ADR-001-zen-bridge.md` (English): observer+actor, allowlist, local
   bridge, no Slack App
7. One smoke path: open Slack in Zen → extension sees tab → event appears for
   OpenClaw (file or HTTP)

## Ambiguities (pick defaults, don’t block)
- Bridge transport: prefer **loopback HTTP** JSON API on a fixed port over native
  messaging unless native messaging is clearly simpler on macOS Firefox.
- OpenClaw integration: if no clean plugin hook, write
  `/cda/openclaw-work/inbox/web/<timestamp>.json` and document that the work
  agent should watch/read that folder (update OpenClaw workspace AGENTS.md only
  if touching `/cda/openclaw-work` or nix-config — ask before editing those).

## Definition of done
- Extension loads in Zen; allowlist works; Pause stops all exfiltration
- At least one end-to-end observe event reaches a local sink OpenClaw can use
- One actor action (snapshot or focus tab) callable locally
- Public README someone else could follow
- Conventional commits on main

## First actions
1. Scaffold WebExtension + local bridge stub
2. Implement observe for Slack web only
3. Document; then actor snapshot/focus
4. Commit when a vertical slice works

Start by reading this file fully, then scaffold. Ask only if a hard blocker.
