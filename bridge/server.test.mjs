import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
