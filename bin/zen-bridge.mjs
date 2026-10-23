#!/usr/bin/env node
// CLI for the Zen ↔ OpenClaw bridge. Prints JSON; exits 1 when the bridge reports an error.
import { createClient, run } from '../bridge/client.mjs'

const USAGE = `usage: zen-bridge <command>
  tabs                          list allowlisted tabs
  snapshot <tabId>              page title, url and text
  focus <tabId|url>             bring a tab to the front (opens the url if needed)
  click <tabId> <selector>      click the first element matching a CSS selector
  type <tabId> <selector> <text>  type into an input/editor (never submits)
  events [limit] [--text]       latest observed events, newest first

env: ZEN_BRIDGE_URL (default http://127.0.0.1:18901), ZEN_BRIDGE_TOKEN (default ~/.config/zen-openclaw-bridge/token)`

const args = process.argv.slice(2)
const withText = args.includes('--text')
const [action, a, b, ...rest] = args.filter(x => x !== '--text')
const opts = {
  tabs: {},
  snapshot: { tabId: a },
  focus: /^\d+$/.test(a ?? '') ? { tabId: a } : { url: a },
  click: { tabId: a, selector: b },
  type: { tabId: a, selector: b, text: rest.join(' ') },
  events: { limit: Number(a) || 10, withText },
}[action]

if (!opts || (action !== 'tabs' && action !== 'events' && !a)) {
  console.error(USAGE)
  process.exit(2)
}
try {
  const out = await run(createClient(), { action, ...opts })
  console.log(JSON.stringify(out.ok ? out.result : out, null, 2))
  process.exit(out.ok ? 0 : 1)
}
catch (e) {
  console.error(`zen-bridge: ${e.cause?.code ?? e.message}`)
  process.exit(1)
}
