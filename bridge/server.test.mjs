import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBridge } from './server.mjs'

test('auth, event inbox and action round-trip', async (t) => {
  const inboxDir = mkdtempSync(join(tmpdir(), 'zen-bridge-'))
  const server = createBridge({ token: 'secret', inboxDir })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}`
  const auth = { authorization: 'Bearer secret', 'content-type': 'application/json' }

  assert.equal((await fetch(`${base}/events`, { method: 'POST', body: '{}' })).status, 401)

  assert.equal((await fetch(`${base}/events`, { method: 'POST', headers: auth, body: JSON.stringify({ type: 'tab.seen' }) })).status, 202)
  const [file] = readdirSync(inboxDir)
  assert.equal(JSON.parse(readFileSync(join(inboxDir, file), 'utf8')).type, 'tab.seen')

  // Recent events drop the page text unless asked.
  await fetch(`${base}/events`, { method: 'POST', headers: auth, body: JSON.stringify({ type: 'page.observed', text: 'secret page' }) })
  const recent = await (await fetch(`${base}/events/recent?limit=1`, { headers: auth })).json()
  assert.deepEqual([recent.length, recent[0].type, 'text' in recent[0]], [1, 'page.observed', false])
  const withText = await (await fetch(`${base}/events/recent?limit=1&text=1`, { headers: auth })).json()
  assert.equal(withText[0].text, 'secret page')

  // OpenClaw asks, the fake extension polls and answers.
  const call = fetch(`${base}/actions`, { method: 'POST', headers: auth, body: JSON.stringify({ action: 'tabs.list' }) })
  const action = await (await fetch(`${base}/actions/next`, { headers: auth })).json()
  assert.equal(action.action, 'tabs.list')
  await fetch(`${base}/actions/${action.id}/result`, { method: 'POST', headers: auth, body: JSON.stringify({ ok: true, result: [] }) })
  assert.deepEqual(await (await call).json(), { ok: true, result: [] })

  // Extension already waiting when OpenClaw asks.
  const poll = fetch(`${base}/actions/next`, { headers: auth }).then(r => r.json())
  await new Promise(r => setTimeout(r, 50))
  const call2 = fetch(`${base}/actions`, { method: 'POST', headers: auth, body: JSON.stringify({ action: 'page.snapshot', params: { tabId: 1 } }) })
  const action2 = await poll
  assert.equal(action2.params.tabId, 1)
  await fetch(`${base}/actions/${action2.id}/result`, { method: 'POST', headers: auth, body: JSON.stringify({ ok: false, error: 'paused' }) })
  assert.equal((await call2).status, 502)
})

test('chat is relayed to the OpenClaw gateway with a per-session user', async (t) => {
  let seen
  const gw = createServer((req, res) => {
    let body = ''
    req.on('data', c => body += c).on('end', () => {
      seen = { auth: req.headers.authorization, path: req.url, ...JSON.parse(body) }
      res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }))
    })
  })
  await new Promise(r => gw.listen(0, '127.0.0.1', r))
  const server = createBridge({
    token: 'secret',
    inboxDir: mkdtempSync(join(tmpdir(), 'zen-bridge-')),
    gateway: { url: `http://127.0.0.1:${gw.address().port}`, token: 'gw', agent: 'openclaw/default' },
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  t.after(() => { server.close(); gw.close() })

  const res = await fetch(`http://127.0.0.1:${server.address().port}/chat`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret' },
    body: JSON.stringify({ message: 'ping', session: 's1' }),
  })
  assert.deepEqual(await res.json(), { ok: true, reply: 'pong' })
  assert.equal(seen.path, '/v1/chat/completions')
  assert.equal(seen.auth, 'Bearer gw')
  assert.equal(seen.user, 'zen-s1')
  assert.equal(seen.messages[0].content, 'ping')
})
