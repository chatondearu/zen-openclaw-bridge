// Loopback bridge between the Zen WebExtension and OpenClaw.
// Zero dependencies: node:http + node:fs. Binds 127.0.0.1 by default, every route but /health needs the bearer token.
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ACTION_TIMEOUT_MS = 20_000
const POLL_TIMEOUT_MS = 25_000
const MAX_BODY = 1_000_000

export function loadToken(file = join(homedir(), '.config', 'zen-openclaw-bridge', 'token')) {
  if (process.env.ZEN_BRIDGE_TOKEN)
    return process.env.ZEN_BRIDGE_TOKEN
  try {
    return readFileSync(file, 'utf8').trim()
  }
  catch {
    const token = randomBytes(24).toString('hex')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${token}\n`, { mode: 0o600 })
    chmodSync(file, 0o600)
    return token
  }
}

export function createBridge({ token, inboxDir, gateway = {} }) {
  mkdirSync(inboxDir, { recursive: true })
  const queue = [] // actions waiting for the extension
  const waiters = [] // extension long-polls waiting for an action
  const pending = new Map() // action id -> resolve(result)

  const authorized = (req) => {
    const got = Buffer.from(req.headers.authorization ?? '')
    const want = Buffer.from(`Bearer ${token}`)
    return got.length === want.length && timingSafeEqual(got, want)
  }

  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(body === undefined ? '' : JSON.stringify(body))
  }

  const readJson = req => new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
      }
      else { chunks.push(c) }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  })

  const dispatch = (action) => {
    const waiter = waiters.shift()
    if (waiter)
      waiter(action)
    else queue.push(action)
  }

  const routes = {
    // Extension -> inbox file OpenClaw can read.
    'POST /events': async (req, res) => {
      const event = await readJson(req)
      const ts = new Date().toISOString()
      const file = join(inboxDir, `${ts.replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}.json`)
      writeFileSync(file, `${JSON.stringify({ receivedAt: ts, ...event }, null, 2)}\n`)
      send(res, 202, { file })
    },
    // Latest observed events, newest first; text is dropped unless ?text=1 to keep agent context small.
    'GET /events/recent': async (req, res) => {
      const q = new URL(req.url, 'http://x').searchParams
      const limit = Math.min(Number(q.get('limit')) || 10, 100)
      const files = readdirSync(inboxDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, limit)
      send(res, 200, files.map((f) => {
        const { text, ...event } = JSON.parse(readFileSync(join(inboxDir, f), 'utf8'))
        return q.get('text') === '1' ? { ...event, text } : event
      }))
    },
    // OpenClaw -> extension: blocks until the extension answers or times out.
    'POST /actions': async (req, res) => {
      const { action, params = {} } = await readJson(req)
      if (typeof action !== 'string')
        return send(res, 400, { ok: false, error: 'action required' })
      const id = randomUUID()
      let timer
      const result = await new Promise((resolve) => {
        pending.set(id, resolve)
        timer = setTimeout(() => resolve({ ok: false, error: 'timeout: extension did not answer (paused, closed or not paired?)' }), ACTION_TIMEOUT_MS)
        dispatch({ id, action, params })
      })
      clearTimeout(timer)
      pending.delete(id)
      const i = queue.findIndex(a => a.id === id)
      if (i !== -1)
        queue.splice(i, 1)
      send(res, result.ok ? 200 : 502, result)
    },
    // Extension chat -> OpenClaw gateway (OpenAI-compatible endpoint). The gateway token never reaches the browser.
    'POST /chat': async (req, res) => {
      const { message, session } = await readJson(req)
      if (typeof message !== 'string' || !message.trim())
        return send(res, 400, { ok: false, error: 'message required' })
      let r
      try {
        r = await fetch(`${gateway.url.replace(/\/$/, '')}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(gateway.token && { authorization: `Bearer ${gateway.token}` }) },
          // Same `user` => same OpenClaw session; a new session id from the extension starts a new one.
          body: JSON.stringify({ model: gateway.agent, user: `zen-${String(session ?? 'default').slice(0, 64)}`, messages: [{ role: 'user', content: message }] }),
        })
      }
      catch (e) {
        return send(res, 502, { ok: false, error: `gateway unreachable at ${gateway.url}: ${e.cause?.code ?? e.message}` })
      }
      const body = await r.json().catch(() => ({}))
      if (!r.ok)
        return send(res, 502, { ok: false, error: body.error?.message ?? `gateway answered ${r.status} (is gateway.http.endpoints.chatCompletions enabled?)` })
      send(res, 200, { ok: true, reply: body.choices?.[0]?.message?.content ?? '' })
    },
    // Extension long-poll for the next action.
    'GET /actions/next': async (req, res) => {
      const next = queue.shift()
      if (next)
        return send(res, 200, next)
      let waiter, timer
      const action = await new Promise((resolve) => {
        waiter = resolve
        waiters.push(resolve)
        timer = setTimeout(() => resolve(null), POLL_TIMEOUT_MS)
        res.on('close', () => resolve(null))
      })
      clearTimeout(timer)
      const i = waiters.indexOf(waiter)
      if (i !== -1)
        waiters.splice(i, 1)
      if (!action)
        return send(res, 204)
      // Client went away while we resolved: requeue so the action is not lost.
      if (res.destroyed)
        return queue.unshift(action)
      send(res, 200, action)
    },
  }

  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    if (req.method === 'GET' && path === '/health')
      return send(res, 200, { ok: true })
    if (!authorized(req))
      return send(res, 401, { ok: false, error: 'unauthorized' })
    try {
      const result = path.match(/^\/actions\/([\w-]+)\/result$/)
      if (req.method === 'POST' && result) {
        const resolve = pending.get(result[1])
        if (!resolve)
          return send(res, 404, { ok: false, error: 'unknown or expired action' })
        resolve(await readJson(req))
        return send(res, 204)
      }
      const route = routes[`${req.method} ${path}`]
      if (!route)
        return send(res, 404, { ok: false, error: 'not found' })
      await route(req, res)
    }
    catch (e) {
      if (!res.headersSent)
        send(res, 400, { ok: false, error: String(e.message ?? e) })
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.ZEN_BRIDGE_PORT ?? 18901)
  // Non-loopback only behind TLS (reverse proxy, Tailscale): the token travels in clear over plain HTTP.
  const host = process.env.ZEN_BRIDGE_HOST ?? '127.0.0.1'
  const gateway = {
    url: process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18789',
    token: process.env.OPENCLAW_GATEWAY_TOKEN,
    agent: process.env.OPENCLAW_AGENT ?? 'openclaw/default',
  }
  const inboxDir = process.env.ZEN_BRIDGE_INBOX
    ?? (process.env.OPENCLAW_STATE_DIR ? join(process.env.OPENCLAW_STATE_DIR, 'inbox', 'web') : join(process.cwd(), 'inbox'))
  const token = loadToken()
  createBridge({ token, inboxDir, gateway }).listen(port, host, () => {
    console.log(`zen-openclaw-bridge listening on http://${host}:${port}`)
    console.log(`inbox: ${inboxDir}`)
    console.log(`chat -> ${gateway.url} (${gateway.agent})`)
    console.log(`pairing token: ${token}`)
  })
}
