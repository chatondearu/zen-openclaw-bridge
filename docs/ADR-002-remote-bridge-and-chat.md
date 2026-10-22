# ADR-002 — Configurable (remote) bridge and chat with OpenClaw

- Status: Accepted
- Date: 2026-10-22
- Amends: [ADR-001](ADR-001-zen-bridge.md) (local-only bridge)

## Context

The extension should work with any OpenClaw instance, not only the one on the
same Mac, and should let the user talk to the agent directly, not only feed it
observations.

## Decision

1. **Bridge URL is configurable** in the options page. Plain `http://` is
   accepted only for loopback hosts; any other host must be `https://` because
   the pairing token is a bearer secret. The bridge gains `ZEN_BRIDGE_HOST`
   (default `127.0.0.1`); the recommended remote setup keeps it on loopback and
   publishes it through TLS (Tailscale Serve or a reverse proxy).
2. **Chat goes through the bridge**, which calls the OpenClaw gateway's
   OpenAI-compatible `POST /v1/chat/completions` (non-streaming). The gateway
   token stays on the bridge host (`OPENCLAW_GATEWAY_TOKEN`), never in the
   browser. One extension "session" maps to the OpenAI `user` field
   (`zen-<uuid>`), which OpenClaw turns into a stable session key; "New session"
   rotates the uuid.
3. **Chat UI is the action popup** (also openable in a tab). The background owns
   the request and stores history in `storage.local`, so closing the popup does
   not lose the reply. Pause also blocks chat.
4. **Default allowlist** grows to Slack, Gmail, Google Calendar, GitHub, Linear
   and claude.ai, all with install-time host permissions. Per-site extractors are
   added later; the generic title/text observer applies meanwhile.

## Consequences

- The chat endpoint is disabled by default in OpenClaw and must be enabled in
  the gateway config (`gateway.http.endpoints.chatCompletions.enabled`).
- The bridge token now grants operator access to the OpenClaw agent as well as
  to allowlisted tabs.
- Non-streaming replies: long agent runs show "…" until done; Node's fetch
  gives up after ~5 min without response headers.
- Rejected: extension talking to the gateway directly (gateway token in the
  browser, CORS on the gateway); WebSocket gateway protocol (device pairing,
  more code) — revisit if streaming is needed.
