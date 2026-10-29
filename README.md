# Zen ↔ OpenClaw bridge

A WebExtension for **Zen** (Firefox) that connects your signed-in tabs to an
**OpenClaw** agent:

- **Observer**: on allowlisted origins, sends the tab title (unread/mention
  markers) and a text excerpt. **Watch pages** (Slack Mentions, Slack Activity,
  Linear Inbox) additionally emit `watch.digest` when rendered list content
  changes (content hash), not only when the title changes. See
  [ADR-004](docs/ADR-004-watch-pages.md).
- **Actor**: OpenClaw can list/focus tabs, take a snapshot, click and type —
  never submit (no Enter key: drafts only).
- **Chat**: the toolbar button opens a chat with your OpenClaw agent, with
  "New session" to start over.

Observed by default: Slack (`*.slack.com`), Gmail (`mail.google.com`), Google
Calendar (`calendar.google.com`), GitHub (`github.com`), Linear (`linear.app`),
Claude and its artifacts (`claude.ai`). Editable in the options.

By default everything stays local: extension → bridge `http://127.0.0.1:18901` →
JSON files in the OpenClaw inbox. The bridge can also run on another machine
(HTTPS). Design and trade-offs: [ADR-001](docs/ADR-001-zen-bridge.md),
[ADR-002](docs/ADR-002-remote-bridge-and-chat.md),
[ADR-003](docs/ADR-003-persistent-background-cli-and-openclaw-tool.md),
[ADR-004](docs/ADR-004-watch-pages.md).

## Requirements

- Zen (or Firefox ≥ 128)
- Node ≥ 20

## 1. Start the bridge

```bash
OPENCLAW_STATE_DIR=/path/to/openclaw-work node bridge/server.mjs
```

It prints its URL, the inbox folder and where the **pairing token** lives
(generated once in `~/.config/zen-openclaw-bridge/token`, mode 600; the token
itself is never logged). Copy it with
`pbcopy < ~/.config/zen-openclaw-bridge/token`.

| Variable | Default |
|---|---|
| `ZEN_BRIDGE_PORT` | `18901` |
| `ZEN_BRIDGE_HOST` | `127.0.0.1` (anything else only behind TLS, see below) |
| `ZEN_BRIDGE_TOKEN` | read/generated in `~/.config/zen-openclaw-bridge/token` |
| `ZEN_BRIDGE_INBOX` | `$OPENCLAW_STATE_DIR/inbox/web`, else `./inbox` |
| `OPENCLAW_GATEWAY_URL` | `http://127.0.0.1:18789` (OpenClaw gateway, for chat) |
| `OPENCLAW_GATEWAY_TOKEN` | gateway token (`gateway.auth.token`) |
| `OPENCLAW_AGENT` | `openclaw/default` (or `openclaw/<agentId>`) |

## 2. Install the extension in Zen

**From a release (persistent)** — Zen does not enforce Mozilla signing:

1. `about:config` → set `xpinstall.signatures.required` to `false`
2. Download the `.xpi` from the latest [release](https://github.com/chatondearu/zen-openclaw-bridge/releases)
3. `about:addons` → ⚙ → **Install Add-on From File…** → pick the `.xpi`

**From source (temporary, for development)**:
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** →
`extension/manifest.json`. Removed when Zen restarts.

The options page opens on install:

1. **Bridge URL**: `http://127.0.0.1:18901` locally, or `https://…` for a remote bridge
2. **Pairing token**: the content of `~/.config/zen-openclaw-bridge/token`
3. **Save** → accept the host access request (bridge + sites)

## 3. Smoke test

1. Open Slack in Zen (or reload the tab).
2. A file shows up in the inbox:

```bash
ls "$OPENCLAW_STATE_DIR/inbox/web"
```

```json
{
  "receivedAt": "2026-10-22T13:05:01.914Z",
  "type": "page.observed",
  "source": "zen",
  "tabId": 12,
  "url": "https://app.slack.com/client/T000/C000",
  "title": "! general (Workspace) - Slack",
  "attention": true,
  "text": "…last visible messages…"
}
```

A new event is emitted on every title change (new message, mention).

### Watch digests (Mentions, Activity, Linear Inbox)

Default watch keys (editable in options, one line per rule:
`key|substring[,substring…]`):

| `watchKey` | Substrings |
| --- | --- |
| `slack-mentions` | `/mentions` |
| `slack-activity` | `/activity-inbox` |
| `linear-inbox` | `linear.app/`, `/inbox` |

On Beamy (2026-10-28), Slack Activity lives at `/activity-inbox`; navigating to
Mentions often redirects to that same surface. Linear Inbox matches any
`linear.app/…/inbox…` path.

When watch-matched tab content changes, a digest lands in the same inbox folder:

```json
{
  "receivedAt": "2026-10-28T17:05:01.914Z",
  "type": "watch.digest",
  "source": "zen",
  "tabId": 12,
  "url": "https://app.slack.com/client/T105LTTB2/activity-inbox",
  "title": "Activité",
  "watchKey": "slack-activity",
  "hash": "8f3a2b1c",
  "excerpt": "…last visible list text…",
  "attention": true
}
```

A nix-config poller (`openclaw-work-zen-watch.sh`) turns new digests into foam
inbox notes; other tabs still use `page.observed` only.

## 4. Actions (OpenClaw side)

```bash
TOKEN=$(cat ~/.config/zen-openclaw-bridge/token)
act() { curl -s -XPOST -H "authorization: Bearer $TOKEN" http://127.0.0.1:18901/actions -d "$1"; echo; }

act '{"action":"tabs.list"}'
act '{"action":"tabs.focus","params":{"tabId":12}}'
act '{"action":"tabs.focus","params":{"url":"https://app.slack.com/client"}}'
act '{"action":"page.snapshot","params":{"tabId":12}}'
act '{"action":"page.click","params":{"tabId":12,"selector":"[data-qa=\"channel_sidebar_name_general\"]"}}'
act '{"action":"page.type","params":{"tabId":12,"selector":"[data-qa=\"message_input\"] [contenteditable]","text":"draft"}}'
act '{"action":"notify.show","params":{"persona":{"name":"Cyrus","emoji":"⚙️"},"title":"⚙️ Cyrus","body":"18 archive candidates — review when you can.","chatSeed":"18 archive candidates — review when you can."}}'
```

Response: `{"ok":true,"result":…}` or `{"ok":false,"error":"…"}` (HTTP 502),
20 s timeout. No action ever posts a message: the human confirms.

`notify.show` is an outbound OS toast (not a page actor). Toggle **Cyrus
notifications** in options (default on). Click opens chat with `chatSeed` as
context. Grant the `notifications` permission when prompted after reload.

### CLI

Same actions, token read from `~/.config/zen-openclaw-bridge/token`:

```bash
node bin/zen-bridge.mjs tabs
node bin/zen-bridge.mjs events 5          # latest signals, add --text for excerpts
node bin/zen-bridge.mjs snapshot 12
node bin/zen-bridge.mjs focus https://app.slack.com/client
node bin/zen-bridge.mjs click 12 '[data-qa="channel_sidebar_name_general"]'
node bin/zen-bridge.mjs type 12 '[data-qa="message_input"] [contenteditable]' draft text
```

`ZEN_BRIDGE_URL` points it at another bridge. Exit code 1 when the bridge
reports an error.

### OpenClaw tool

`openclaw-plugin/` adds one native agent tool, `zen_browser`
(`action`: `tabs`, `snapshot`, `events`, `focus`, `click`, `type`):

```bash
openclaw plugins install --link /path/to/zen-openclaw-bridge/openclaw-plugin
```

The agent then answers "what's in my tabs?" without shell access. Events also
land in `inbox/web/*.json` for agents that prefer files.

## 5. Chat with OpenClaw

Click the extension button (↗ opens it in a tab). Messages go through the
bridge, which calls the gateway's OpenAI-compatible endpoint
(`/v1/chat/completions`): the gateway token stays on the bridge, never in the
browser. Each "New session" starts a new OpenClaw session.

This endpoint is **disabled by default** in OpenClaw. In the gateway config:

```json5
{ gateway: { http: { endpoints: { chatCompletions: { enabled: true } } } } }
```

then start the bridge with `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN`.

## 6. Remote bridge

To connect the extension to an OpenClaw on another machine, run the bridge on
that machine and expose it **over HTTPS only** (Tailscale Serve, a TLS reverse
proxy…). The extension refuses `http://` outside loopback. Tailscale example:

```bash
node bridge/server.mjs                       # listens on 127.0.0.1:18901
tailscale serve --bg --https=443 18901       # → https://<machine>.<tailnet>.ts.net
```

The inbox is then written on the remote machine.

## Threat model

Treat this bridge as **operator access** to your allowlisted tabs.

- **Who can act**: any process holding the token can read and type in
  allowlisted tabs (with your Slack session). Keep the token secret (mode 600),
  never commit it, never put it in versioned OpenClaw config.
- **Network**: listens on `127.0.0.1` by default. No CORS: a web page cannot call
  the bridge (preflight refused + token required). Remote bridge: HTTPS is
  enforced by the extension; keep it on a private network (tailnet), never
  publicly exposed.
- **Chat**: the bridge holds the gateway token, which is full operator access to
  OpenClaw. The bridge token therefore also controls the agent.
- **Data**: only the title and rendered text leave the browser, to local disk.
  No Slack cookie or token is read or stored. The inbox holds Slack content in
  clear text: protect that folder and purge it.
- **Scope**: allowlisted hosts only. The extension has the `tabs` permission
  (sees every tab URL) but filters before anything is sent.
- **Kill switch**: *Pause* in the options, disabling the extension, or logging
  out of the site = nothing leaves. Pause is re-checked before every action.
- **No auto-send**: `page.type` never presses Enter. A `page.click` on a "Send"
  button is still possible: do not allow it on the agent side.
- **Prompt injection**: observed text comes from third parties (Slack messages).
  An agent reading it must treat it as data, never as instructions.

## Why not OpenClaw's Chrome extension?

It drives Chromium through `chrome.debugger` (CDP). Zen is Firefox-based, and
Firefox does not expose that API to extensions. This extension only uses Firefox
WebExtension APIs (`tabs`, `scripting`, `storage`).

## Releases

Every `vX.Y.Z` tag (equal to `version` in `extension/manifest.json`) runs CI:
tests, lint, `.xpi` build and a GitHub release.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Development

```bash
node --test bridge/*.test.mjs      # bridge tests
npx web-ext lint -s extension      # Mozilla lint
npx web-ext run -s extension --firefox=/Applications/Zen.app/Contents/MacOS/zen
```

Contributors and coding agents: see [AGENTS.md](AGENTS.md).

License: MIT.
