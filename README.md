# Zen ↔ OpenClaw bridge

Extension WebExtension pour **Zen** (Firefox) qui relie tes onglets connectés à
un agent **OpenClaw** local :

- **Observateur** : sur les origines autorisées, envoie le titre de l'onglet
  (marqueurs non-lus/mentions) et un extrait de texte.
- **Acteur** : OpenClaw peut lister/focus des onglets, prendre un snapshot,
  cliquer et taper — sans jamais envoyer (pas d'Entrée : brouillons seulement).
- **Chat** : bouton de l'extension → discuter avec ton agent OpenClaw, avec
  « New session » pour repartir de zéro.

Sites observés par défaut : Slack (`*.slack.com`), Gmail (`mail.google.com`),
Google Calendar (`calendar.google.com`), GitHub (`github.com`), Linear
(`linear.app`), Claude et ses artifacts (`claude.ai`). Modifiable dans les options.

Par défaut tout reste en local : extension → bridge `http://127.0.0.1:18901` →
fichiers JSON dans l'inbox OpenClaw. Le bridge peut aussi tourner sur une autre
machine (HTTPS). Choix et limites : [ADR-001](docs/ADR-001-zen-bridge.md),
[ADR-002](docs/ADR-002-remote-bridge-and-chat.md).

> English: a Firefox/Zen MV3 extension + a zero-dependency Node loopback bridge.
> Events land as JSON files in `$OPENCLAW_STATE_DIR/inbox/web/`; actions are
> plain HTTP calls. Read the threat model below before use.

## Prérequis

- Zen (ou Firefox ≥ 128)
- Node ≥ 20

## 1. Lancer le bridge

```bash
OPENCLAW_STATE_DIR=/chemin/vers/openclaw-work node bridge/server.mjs
```

Il affiche l'URL, le dossier inbox et le **pairing token** (généré une fois dans
`~/.config/zen-openclaw-bridge/token`, mode 600).

| Variable | Défaut |
|---|---|
| `ZEN_BRIDGE_PORT` | `18901` |
| `ZEN_BRIDGE_HOST` | `127.0.0.1` (autre valeur = uniquement derrière TLS, voir plus bas) |
| `OPENCLAW_GATEWAY_URL` | `http://127.0.0.1:18789` (gateway OpenClaw pour le chat) |
| `OPENCLAW_GATEWAY_TOKEN` | token du gateway (`gateway.auth.token`) |
| `OPENCLAW_AGENT` | `openclaw/default` (ou `openclaw/<agentId>`) |
| `ZEN_BRIDGE_TOKEN` | lu/généré dans `~/.config/zen-openclaw-bridge/token` |
| `ZEN_BRIDGE_INBOX` | `$OPENCLAW_STATE_DIR/inbox/web`, sinon `./inbox` |

## 2. Installer l'extension dans Zen

**Depuis une release (durable)** — Zen n'impose pas la signature Mozilla :

1. `about:config` → `xpinstall.signatures.required` = `false`
2. Télécharger le `.xpi` de la dernière [release](https://github.com/chatondearu/zen-openclaw-bridge/releases)
3. `about:addons` → ⚙ → **Install Add-on From File…** → choisir le `.xpi`

**Depuis les sources (temporaire, pour développer)** :
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** →
`extension/manifest.json`. Disparaît au redémarrage de Zen.

La page d'options s'ouvre à l'installation :

1. **Bridge URL** : `http://127.0.0.1:18901` en local, ou `https://…` pour un bridge distant
2. **Pairing token** : celui affiché par le bridge
3. **Save** → accepter la demande d'accès (bridge + sites)

## 3. Smoke test

1. Ouvrir Slack dans Zen (ou recharger l'onglet).
2. Un fichier apparaît dans l'inbox :

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
  "text": "…derniers messages visibles…"
}
```

Un nouvel événement est émis à chaque changement de titre (nouveau message, mention).

## 4. Actions (côté OpenClaw)

```bash
TOKEN=$(cat ~/.config/zen-openclaw-bridge/token)
act() { curl -s -XPOST -H "authorization: Bearer $TOKEN" http://127.0.0.1:18901/actions -d "$1"; echo; }

act '{"action":"tabs.list"}'
act '{"action":"tabs.focus","params":{"tabId":12}}'
act '{"action":"tabs.focus","params":{"url":"https://app.slack.com/client"}}'
act '{"action":"page.snapshot","params":{"tabId":12}}'
act '{"action":"page.click","params":{"tabId":12,"selector":"[data-qa=\"channel_sidebar_name_general\"]"}}'
act '{"action":"page.type","params":{"tabId":12,"selector":"[data-qa=\"message_input\"] [contenteditable]","text":"brouillon"}}'
```

Réponse : `{"ok":true,"result":…}` ou `{"ok":false,"error":"…"}` (HTTP 502).
Délai max 20 s. Après une longue inactivité, la première action peut attendre
jusqu'à ~1 min (réveil de l'event page, voir ADR).

Pour l'agent OpenClaw work : lire/surveiller `inbox/web/*.json`, et appeler
`/actions` pour agir. Aucune action ne poste de message : l'humain valide.

## 5. Chat avec OpenClaw

Clique sur l'icône de l'extension (↗ pour l'ouvrir dans un onglet). Les messages
passent par le bridge, qui appelle l'endpoint OpenAI-compatible du gateway
OpenClaw (`/v1/chat/completions`) : le token du gateway reste côté bridge, jamais
dans le navigateur. Chaque « New session » crée une nouvelle session OpenClaw.

Cet endpoint est **désactivé par défaut** dans OpenClaw. Dans la config du gateway :

```json5
{ gateway: { http: { endpoints: { chatCompletions: { enabled: true } } } } }
```

puis lancer le bridge avec `OPENCLAW_GATEWAY_URL` et `OPENCLAW_GATEWAY_TOKEN`.

## 6. Bridge distant

Pour brancher l'extension sur un OpenClaw d'une autre machine, lance le bridge
sur cette machine et expose-le **uniquement en HTTPS** (Tailscale Serve, reverse
proxy avec TLS…). L'extension refuse `http://` hors loopback. Exemple Tailscale :

```bash
node bridge/server.mjs                       # écoute 127.0.0.1:18901
tailscale serve --bg --https=443 18901       # → https://<machine>.<tailnet>.ts.net
```

L'inbox est alors écrite sur la machine distante.

## Modèle de menace

Traite ce bridge comme un **accès opérateur** à tes onglets autorisés.

- **Qui peut agir** : tout process local qui a le token peut lire et taper dans
  les onglets allowlistés (avec ta session Slack). Garde le token secret (600),
  ne le commite pas, ne le mets pas dans la config OpenClaw versionnée.
- **Réseau** : écoute sur `127.0.0.1` par défaut. Pas de CORS : une page web ne
  peut pas appeler le bridge (préflight refusé + token requis). Bridge distant :
  HTTPS obligatoire côté extension, garde-le sur un réseau privé (tailnet), jamais
  exposé publiquement.
- **Chat** : le bridge détient le token du gateway, qui vaut un accès opérateur
  complet à OpenClaw. Le token du bridge donne donc aussi la main sur l'agent.
- **Données** : seuls le titre et le texte rendu sortent du navigateur, vers le
  disque local. Aucun cookie ni token Slack n'est lu ou stocké. L'inbox contient
  du contenu Slack en clair : protège ce dossier et purge-le.
- **Périmètre** : uniquement les hôtes de l'allowlist. L'extension a la
  permission `tabs` (voit les URL de tous les onglets) mais filtre avant tout envoi.
- **Kill switch** : *Pause* dans les options, désactiver l'extension, ou se
  déconnecter du site = plus rien ne sort. Pause est revérifiée avant chaque action.
- **Pas d'envoi auto** : `page.type` n'appuie jamais sur Entrée. Un `page.click`
  sur un bouton « Envoyer » reste possible : ne l'autorise pas côté agent.
- **Injection** : le texte observé vient de tiers (messages Slack). Un agent qui
  le lit doit le traiter comme donnée, jamais comme instruction.

## Pourquoi pas l'extension Chrome d'OpenClaw ?

Elle pilote Chromium via `chrome.debugger` (CDP). Zen est basé sur Firefox, qui
n'expose pas cette API aux extensions. Cette extension utilise uniquement les
APIs WebExtension Firefox (`tabs`, `scripting`, `storage`, `alarms`).

## Releases

Chaque tag `vX.Y.Z` (identique à `version` dans `extension/manifest.json`) lance
la CI : tests, lint, build du `.xpi` et publication d'une release GitHub.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Développement

```bash
node --test bridge/*.test.mjs      # test du bridge
npx web-ext lint -s extension      # lint Mozilla
npx web-ext run -s extension --firefox=/Applications/Zen.app/Contents/MacOS/zen
```

Licence : MIT.
