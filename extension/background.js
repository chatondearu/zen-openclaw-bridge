// Event page: the single gate between allowlisted tabs and the loopback bridge.
// Nothing reaches the bridge when paused, unpaired, or for a non-allowlisted origin.
const DEFAULTS = { bridgeUrl: 'http://127.0.0.1:18901', token: '', allowlist: ['*.slack.com'], paused: false }

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function active() {
  const cfg = await browser.storage.local.get(DEFAULTS)
  return !cfg.paused && cfg.token ? cfg : null
}

// Allowlist entries are hostnames, optionally prefixed by "*." for subdomains.
function allowed(url, allowlist) {
  let u
  try {
    u = new URL(url)
  }
  catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    return false
  return allowlist.some(p => p.startsWith('*.') ? u.hostname === p.slice(2) || u.hostname.endsWith(p.slice(1)) : u.hostname === p)
}

function bridge(cfg, path, init = {}) {
  return fetch(cfg.bridgeUrl.replace(/\/$/, '') + path, {
    ...init,
    headers: { 'authorization': `Bearer ${cfg.token}`, 'content-type': 'application/json' },
  })
}

// --- Observer ---------------------------------------------------------------

async function observe(tab, cfg) {
  if (allowed(tab.url, cfg.allowlist))
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['observer.js'] }).catch(e => console.warn('[zen-openclaw] inject failed', tab.url, e))
}

async function observeAll() {
  const cfg = await active()
  if (cfg)
    for (const tab of await browser.tabs.query({})) observe(tab, cfg)
}

browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const cfg = info.status === 'complete' && await active()
  if (cfg)
    observe(tab, cfg)
})

browser.runtime.onMessage.addListener(async (msg, sender) => {
  const cfg = await active()
  if (!cfg || msg?.type !== 'page.observed' || !allowed(sender.tab?.url, cfg.allowlist))
    return
  const { type, title, attention, text } = msg
  await bridge(cfg, '/events', {
    method: 'POST',
    body: JSON.stringify({ type, source: 'zen', tabId: sender.tab.id, url: sender.tab.url, title, attention, text }),
  }).catch(e => console.warn('[zen-openclaw] event not delivered', e))
  pollLoop()
})

// --- Actor ------------------------------------------------------------------
// Functions below run inside the page via scripting.executeScript; they return { error } instead of throwing.

function pageSnapshot() {
  const root = document.querySelector('[role="main"]') ?? document.body
  return { title: document.title, url: location.href, text: root.innerText.slice(0, 20000) }
}

function pageClick(selector) {
  const el = document.querySelector(selector)
  if (!el)
    return { error: `no element matches ${selector}` }
  el.click()
  return { clicked: selector }
}

// Types into inputs or contenteditable editors (Slack composer). Never presses Enter: drafts only.
function pageType(selector, text) {
  const el = document.querySelector(selector)
  if (!el)
    return { error: `no element matches ${selector}` }
  el.focus()
  if (el.isContentEditable) {
    document.execCommand('insertText', false, text)
  }
  else {
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { typed: text.length }
}

async function allowedTab(params, cfg) {
  const tab = await browser.tabs.get(Number(params.tabId))
  if (!allowed(tab.url, cfg.allowlist))
    throw new Error('tab is not on an allowlisted origin')
  return tab
}

async function inPage(tabId, func, args = []) {
  const [res] = await browser.scripting.executeScript({ target: { tabId }, func, args })
  if (res.error)
    throw new Error(String(res.error.message ?? res.error))
  if (res.result?.error)
    throw new Error(res.result.error)
  return res.result
}

const actions = {
  'tabs.list': async (p, cfg) => (await browser.tabs.query({}))
    .filter(t => allowed(t.url, cfg.allowlist))
    .map(({ id, windowId, url, title, active }) => ({ id, windowId, url, title, active })),
  'tabs.focus': async (p, cfg) => {
    let tab
    if (p.tabId != null) {
      tab = await allowedTab(p, cfg)
    }
    else {
      if (!allowed(p.url, cfg.allowlist))
        throw new Error('url is not on an allowlisted origin')
      tab = (await browser.tabs.query({})).find(t => t.url === p.url) ?? await browser.tabs.create({ url: p.url })
    }
    await browser.tabs.update(tab.id, { active: true })
    await browser.windows.update(tab.windowId, { focused: true })
    return { id: tab.id }
  },
  'page.snapshot': async (p, cfg) => inPage((await allowedTab(p, cfg)).id, pageSnapshot),
  'page.click': async (p, cfg) => inPage((await allowedTab(p, cfg)).id, pageClick, [String(p.selector)]),
  'page.type': async (p, cfg) => inPage((await allowedTab(p, cfg)).id, pageType, [String(p.selector), String(p.text ?? '')]),
}

async function run(action, params) {
  // Re-check right before acting: Pause may have been hit during the long-poll.
  const cfg = await active()
  if (!cfg)
    return { ok: false, error: 'paused or not paired' }
  if (!Object.hasOwn(actions, action))
    return { ok: false, error: `unknown action ${action}` }
  try {
    return { ok: true, result: await actions[action](params, cfg) }
  }
  catch (e) {
    return { ok: false, error: String(e.message ?? e) }
  }
}

// Long-poll the bridge for actions. The event page may be suspended; the alarm and any tab event wake it up again.
let polling = false
async function pollLoop() {
  if (polling)
    return
  polling = true
  try {
    for (let cfg = await active(); cfg; cfg = await active()) {
      try {
        const res = await bridge(cfg, '/actions/next')
        if (res.status === 204)
          continue
        if (!res.ok) {
          console.warn('[zen-openclaw] bridge answered', res.status)
          await sleep(5000)
          continue
        }
        const { id, action, params } = await res.json()
        await bridge(cfg, `/actions/${id}/result`, { method: 'POST', body: JSON.stringify(await run(action, params ?? {})) })
      }
      catch (e) {
        console.warn('[zen-openclaw] bridge unreachable', e)
        await sleep(5000)
      }
    }
  }
  finally {
    polling = false
  }
}

function start() {
  observeAll()
  pollLoop()
}

browser.runtime.onInstalled.addListener(() => browser.alarms.create('wake', { periodInMinutes: 1 }))
browser.runtime.onStartup.addListener(() => browser.alarms.create('wake', { periodInMinutes: 1 }))
browser.alarms.onAlarm.addListener(pollLoop)
browser.storage.onChanged.addListener(start)
start()
