// Tiny client for the bridge HTTP API, shared by the CLI and the OpenClaw plugin.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function createClient({
  url = process.env.ZEN_BRIDGE_URL ?? 'http://127.0.0.1:18901',
  token = process.env.ZEN_BRIDGE_TOKEN,
  tokenFile = join(homedir(), '.config', 'zen-openclaw-bridge', 'token'),
} = {}) {
  const base = url.replace(/\/$/, '')
  const headers = () => ({ authorization: `Bearer ${token ?? readFileSync(tokenFile, 'utf8').trim()}` })

  return {
    // Resolves to { ok, result } or { ok: false, error }; never throws on bridge-level errors.
    async act(action, params = {}) {
      const res = await fetch(`${base}/actions`, { method: 'POST', headers: headers(), body: JSON.stringify({ action, params }) })
      return res.json().catch(() => ({ ok: false, error: `bridge answered ${res.status}` }))
    },
    async recent(limit = 10, withText = false) {
      const res = await fetch(`${base}/events/recent?limit=${limit}${withText ? '&text=1' : ''}`, { headers: headers() })
      const body = await res.json().catch(() => null)
      return res.ok ? { ok: true, result: body } : { ok: false, error: body?.error ?? `bridge answered ${res.status}` }
    },
  }
}

// Maps the CLI / tool vocabulary onto bridge calls.
export function run(client, { action, tabId, url, selector, text, limit, withText }) {
  const tab = { tabId: Number(tabId) }
  switch (action) {
    case 'tabs': return client.act('tabs.list')
    case 'snapshot': return client.act('page.snapshot', tab)
    case 'focus': return client.act('tabs.focus', url ? { url } : tab)
    case 'click': return client.act('page.click', { ...tab, selector })
    case 'type': return client.act('page.type', { ...tab, selector, text })
    case 'events': return client.recent(limit, withText)
    default: return Promise.resolve({ ok: false, error: `unknown action ${action}` })
  }
}
