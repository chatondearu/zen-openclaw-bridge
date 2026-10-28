# ADR-004 — Watch pages and `watch.digest`

- Status: Accepted
- Date: 2026-10-28
- Related: [ADR-001](ADR-001-zen-bridge.md), nix-config spec `2026-10-28-zen-watch-digest-design.md`

## Context

Generic `page.observed` fires on **title** changes. That misses list updates on
Slack Mentions, Slack Activity, and Linear Inbox when the tab title stays the
same, and it floods the inbox with every Slack channel tab.

## Decision

1. **Watch page list** in extension options (`watchPages`: `key` + `urlIncludes`
   substrings). Defaults (live URLs on Beamy workspace, 2026-10-28):

   | `watchKey` | Intent | URL substrings (all must match) |
   | ---------- | ------ | ------------------------------- |
   | `slack-mentions` | Mentions | `/mentions` (Slack often redirects to Activity; keep matcher if a dedicated path returns) |
   | `slack-activity` | Activity | `/activity-inbox` |
   | `linear-inbox` | Linear Inbox | `linear.app/`, `/inbox` |

2. **Watch-matched tabs** get `watch-observer.js`: normalized visible body text,
   stable hash, debounced `MutationObserver` (+ short interval fallback). When the
   hash changes for that tab, POST `watch.digest` to the bridge (same inbox as
   `page.observed`).

3. **Non-watch allowlisted tabs** keep `observer.js` and `page.observed`
   unchanged (title + excerpt).

4. **Event shape** (bridge adds `receivedAt` on persist):

   ```json
   {
     "type": "watch.digest",
     "source": "zen",
     "tabId": 12,
     "url": "https://app.slack.com/client/T…/activity-inbox",
     "title": "Activité",
     "watchKey": "slack-activity",
     "hash": "a1b2c3d4",
     "excerpt": "…normalized text, capped…",
     "attention": true
   }
   ```

5. **Downstream:** **nix-config** poller `openclaw-work-zen-watch.sh` reads new
   `watch.digest` files under `$OPENCLAW_STATE_DIR/inbox/web` and writes foam
   notes under `$CDA_FOAM/inbox/`. Bridge repo does not run the poller.

6. **Security unchanged:** no cookies or credentials leave the browser; pause /
   unpaired / non-allowlisted still block all traffic. Actor rules (drafts only)
   unchanged.

## Consequences

- Watch tabs may emit both `page.observed` (title) and `watch.digest` (content);
  foam triage should prefer digests for pings.
- URL substrings are workspace-specific; edit options if Slack or Linear routes change.
- Excerpt quality starts as capped body text; list-region selectors can tighten later.

## Rejected

- Replacing `page.observed` globally with content hashing (too noisy on channel tabs).
- Emitting digests only from `page.observed` + `attention` filter (misses silent list updates).
