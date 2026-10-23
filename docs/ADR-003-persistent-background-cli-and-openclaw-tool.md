# ADR-003 — Persistent MV2 background, CLI and native OpenClaw tool

- Status: Accepted
- Date: 2026-10-23
- Amends: [ADR-001](ADR-001-zen-bridge.md) (MV3 event page), [ADR-002](ADR-002-remote-bridge-and-chat.md)

## Context

1. With MV3, Firefox suspends the event page ~30 s after its last event. A
   pending `fetch` does not keep it alive, so the long-poll stops and actions
   time out until the 1-minute alarm wakes it. Measured: ~70 s windows where
   every action failed; the OpenClaw agent concluded "extension not paired".
2. Agents could only reach the bridge through `curl` in a shell tool: needs
   exec approval and a model capable of composing the call. The local model
   used the built-in Chrome `browser` tool instead and reported 0 tabs.

## Decision

1. **Manifest V2 with `background.persistent: true`.** Firefox keeps supporting
   MV2 and signs it on AMO. The code is unchanged apart from the manifest and
   the removed wake-up alarm.
2. **`bin/zen-bridge.mjs` CLI** (`tabs`, `snapshot`, `focus`, `click`, `type`,
   `events`) for humans and shell-capable agents, on top of `bridge/client.mjs`.
3. **`openclaw-plugin/`: one native tool `zen_browser`** with an `action`
   parameter, same vocabulary as the CLI, calling the bridge over HTTP.
   One compact schema (~150 tokens) instead of an MCP server's tool set, kept
   `catalogMode: "direct-only"` so small models see it without tool search.
   Installed with `openclaw plugins install --link`.
4. **`GET /events/recent`** on the bridge returns the latest events without
   page text unless `?text=1`, so agents can poll signals cheaply.

## Consequences

- Actions answer immediately while Zen runs; no more idle gaps.
- The background page stays in memory (small: no DOM work there).
- MV2 is the legacy path; if Firefox ever drops it, revisit with a WebSocket
  or native messaging host.
- The plugin loads `bridge/client.mjs` from the repo checkout (`--link`); moving
  the checkout requires reinstalling the plugin.
