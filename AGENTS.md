# Agent guide

<!-- agents-setup:managed -->

## Mandatory workflow

Every feature, fix, or decision that affects product, architecture, or design
must follow this sequence:

1. Read this `AGENTS.md`, then `foam/index.md` (if present).
2. Search **foam** (`foam/decisions/`, `prd/`, `plans/`) for related ADRs and specs.
3. Search **GitHub** for overlap before starting work:
   ```bash
   gh issue list --state all --search "keywords" --limit 20
   gh pr list --state all --search "keywords" --limit 20
   ```
4. If an issue, PR, ADR, or PRD already covers the topic — **read it** and
   confront the new proposal with recorded decisions. Cite sources.
5. For non-trivial scope: ensure a Kanban issue, PRD (`prd/`), and plan
   (`plans/`) exist or create them before coding.
6. After shipping or deciding: update foam (ADR, PRD status, feature lists) and
   refresh this file when stack or skills change.

Skills: **cda-foam**, **cda-prd**, **cda-plan**,
**cda-dev**, **cda-kanban**,
**cda-agents**, **cda-commit**, **cda-review**.

## Project memory (foam)

| Path | Purpose |
| ---- | ------- |
| `foam/index.md` | Map of Content — start here |
| `foam/decisions/` | Architecture Decision Records |
| `prd/` | Product requirements |
| `plans/` | Implementation checklists |
| GitHub Project | Kanban execution status |

Sync feature lists: `cda-foam/scripts/import-kanban.sh`.

Cursor rule (if present): `.cursor/rules/product-memory.mdc`.

## Skills by context

| When | Skill |
| ---- | ----- |
| Bootstrap / update this file | `cda-agents` |
| ADRs, foam graph, import kanban | `cda-foam` |
| PRD from Kanban issue | `cda-prd` |
| Implementation plan from PRD | `cda-plan` |
| Multi-task chat batch → epic + parallel PRs | `cda-dev` |
| Issues, board, PRs, milestones | `cda-kanban` |
| Commits | `cda-commit` |
| Code review | `cda-review` |
| Bold creative UI | `cda-design-bold` |
| Anti-slop landings / redesigns | `cda-design-taste` |
| Brand DESIGN.md templates | `cda-design-md` |
| UI a11y / UX audit | `cda-design-audit` |
| Visual design pass (screenshot loop) | `cda-design-loop` |
| User-facing `doc/` | `cda-docs` |
| Library docs | `cda-context7` |
| Nix / direnv projects | `nix-develop-shell`, `nix-direnv-setup` |


<!-- /agents-setup:managed -->

## Project-specific notes

### Language

**Everything in this repo is English**: code, comments, README, docs, ADRs,
UI strings, commit messages, PR titles and descriptions, issues, release notes.
(Agents may still reply to the human in their own language in chat.)

### What this is

A Firefox/Zen MV3 WebExtension plus a zero-dependency Node bridge that connects
signed-in browser tabs to an OpenClaw agent: observe allowlisted sites, act on
them on request, and chat with the agent. Kickoff brief: [PROMPT.md](PROMPT.md).

| Path | Role |
| ---- | ---- |
| `extension/manifest.json` | MV3 manifest (Gecko id `zen-openclaw-bridge@chatondearu.github.io`, min Firefox 128) |
| `extension/defaults.js` | Shared defaults (bridge URL, allowlist…) loaded by every extension page |
| `extension/background.js` | Event page: single gate to the bridge — observer injection, actor actions, chat, long-poll |
| `extension/observer.js` | Injected into allowlisted tabs; reports title changes + text excerpt |
| `extension/options.*` | Bridge URL, pairing token, allowlist, Pause |
| `extension/chat.*` | Toolbar popup chat (also opens in a tab with `#tab`) |
| `bridge/server.mjs` | HTTP bridge: `/health`, `/events`, `/actions`, `/actions/next`, `/actions/:id/result`, `/chat` |
| `bridge/server.test.mjs` | `node:test` suite |
| `docs/ADR-*.md` | Architecture decisions (this repo keeps ADRs here, no `foam/`) |
| `.github/workflows/ci.yml` | Tests + lint on push/PR; `.xpi` release on `v*` tags |

### Commands

```bash
node --test bridge/*.test.mjs                 # bridge tests (Node ≥ 20, no install)
npx --yes web-ext@8 lint -s extension         # must stay at 0 errors / 0 warnings / 0 notices
node bridge/server.mjs                        # run the bridge (prints the pairing token)
npx --yes web-ext@8 run -s extension --firefox=/Applications/Zen.app/Contents/MacOS/zen
```

There is no `package.json` and no dependency on purpose; keep it that way unless
a feature truly needs one.

### Conventions

- Conventional Commits (`feat(extension):`, `feat(bridge):`, `docs:`, `ci:`…).
- **No AI attribution**: no `Co-Authored-By: Claude` trailer, no "Generated with
  Claude Code" footer in commits or PRs.
- Small changes go straight to `main` and are pushed; CI must stay green.
- **Release**: bump `version` in `extension/manifest.json`, commit, then
  `git tag vX.Y.Z && git push origin vX.Y.Z`. CI fails if the tag and the
  manifest version differ.
- Style: no semicolons, 2-space indent, single quotes (Anthony Fu style), plain
  JS, no build step. Comments only for the non-obvious *why*.
- New decisions that change the security model or transport get a new
  `docs/ADR-00N-*.md`; update the README threat model in the same change.

### Security invariants (do not break)

1. `background.js` is the only code that talks to the bridge; every send checks
   `active()` (not paused + paired) and `allowed()` (allowlist).
2. Pause is re-checked right before running each actor action and blocks chat.
3. Observer and actions only touch allowlisted origins.
4. Plain `http://` bridge URLs are accepted only for loopback hosts.
5. The bridge binds `127.0.0.1` by default, requires the bearer token on every
   route except `/health`, and sends no CORS headers.
6. The OpenClaw gateway token lives only on the bridge host, never in the browser.
7. `page.type` never submits (no Enter); nothing auto-sends messages.
8. Never store or read site cookies/tokens; never commit tokens or inbox files.

### Gotchas

- Firefox MV3 background is an **event page** (`background.scripts`) and can be
  suspended: a 1-minute alarm and tab events restart the long-poll.
- Functions passed to `scripting.executeScript({ func })` are serialized: they
  cannot use outer variables and should return `{ error }` instead of throwing.
- `storage.onChanged` restarts observers only for keys in `DEFAULTS`; chat
  history lives under the `chat` key.
- `permissions.request` must be the first `await` in the options submit handler
  (user gesture).
- OpenClaw's `/v1/chat/completions` is disabled by default
  (`gateway.http.endpoints.chatCompletions.enabled`); a 404 from the gateway
  means it is off. The OpenAI `user` field (`zen-<uuid>`) selects the session.
- Zen ships with `MOZ_REQUIRE_SIGNING=false`: unsigned `.xpi` releases install
  after setting `xpinstall.signatures.required=false`.

### Adding a site

1. Add the hostname to `allowlist` in `extension/defaults.js` and its pattern to
   `host_permissions` in the manifest.
2. The generic observer applies at once; add site-specific extraction in
   `observer.js` only when the title heuristic is not enough.
3. Update the default site list in the README and bump the version.
