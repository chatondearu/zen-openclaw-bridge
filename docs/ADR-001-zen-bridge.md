# ADR-001 — Zen WebExtension + loopback bridge for OpenClaw

- Status: Accepted (local-only bridge amended by ADR-002; MV3 event page replaced by ADR-003)
- Date: 2026-10-22

## Context

OpenClaw needs to see and act on web apps where the user is already signed in
(Slack first) in **Zen**, a Firefox-based browser. OpenClaw's existing browser
relay is a Chrome extension built on `chrome.debugger` (CDP). Firefox has no
`debugger` WebExtension API, so that extension is not portable.

## Decision

1. **Native Firefox WebExtension, Manifest V3.** Zen 1.21 ships Gecko 153; MV3
   (event page via `background.scripts`, `scripting` API) is fully supported.
   No `chrome.debugger`, no CDP.
2. **Observer + actor in one extension.**
   - Observer: `observer.js` is injected only into allowlisted tabs and reports
     title changes (Slack's unread/mention markers) with a text excerpt.
   - Actor: OpenClaw requests `tabs.list`, `tabs.focus`, `page.snapshot`,
     `page.click`, `page.type`; the background runs them with
     `scripting.executeScript`. `page.type` never submits (no Enter): drafts only.
3. **Allowlist of hostnames** (default `*.slack.com`), editable in options.
   Every observe event and every actor call is checked against it in the
   background, which is the single gate to the bridge.
4. **Loopback HTTP bridge** (`bridge/server.mjs`, Node, zero dependencies) on
   `127.0.0.1:18901`, bearer pairing token. Chosen over native messaging: no
   native-host manifest to install per browser profile, and OpenClaw can call it
   with plain `curl`. The extension cannot listen on a port, so it **long-polls**
   `GET /actions/next`; OpenClaw's `POST /actions` blocks until the result.
5. **OpenClaw integration = inbox folder.** Each event is written to
   `$OPENCLAW_STATE_DIR/inbox/web/<timestamp>.json`. No OpenClaw plugin hook is
   needed; the work agent reads that folder.
6. **No Slack App / OAuth.** The browser session is the auth. No cookie or token
   leaves the browser; the extension only reads rendered DOM text.
7. **Kill switch.** Pause in options, disabling the extension, or logging out of
   the site stops all data. Pause is re-checked right before each action.

## Consequences

- Event pages can be suspended when idle; a 1-minute alarm plus every tab event
  restarts the long-poll, so the first action after a long idle may wait up to
  ~1 min. Upgrade path if this hurts: a WebSocket or native messaging port.
- The bridge has operator-level power over allowlisted tabs: anyone with the
  token and local access can read and type in them. See README threat model.
- Selectors for `page.click` / `page.type` are site-specific and will break when
  Slack changes its DOM.
- Title-prefix "attention" detection is a heuristic.

## Rejected

- Porting OpenClaw's Chrome extension: depends on `chrome.debugger`.
- MV2 persistent background: would remove the idle-suspend issue, but MV3 works
  in Zen and MV2 is the legacy path.
- Cloud relay, Slack App: out of scope for v1 (local-only, no new credentials).
