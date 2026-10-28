import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const dir = dirname(fileURLToPath(import.meta.url))
const code = readFileSync(join(dir, 'background.js'), 'utf8')
  .split('\nfunction start()')[0]

const defaults = {
  allowlist: ['*.slack.com'],
  bridgeUrl: 'http://127.0.0.1:18901',
  paused: false,
  token: 'token',
  watchPages: [{ key: 'slack-activity', urlIncludes: ['/activity-inbox'] }],
}

function matchWatchPage(url, pages) {
  const page = pages.find(page => page.urlIncludes.every(part => url.includes(part)))
  return page ? { key: page.key } : null
}

function createSandbox() {
  const calls = []
  const listeners = {}
  let storageReads = 0
  const browser = {
    runtime: {
      getURL: () => 'moz-extension://test/',
      onMessage: {
        addListener(listener) {
          listeners.message = listener
        },
      },
    },
    scripting: {
      async executeScript(details) {
        calls.push(details)
      },
    },
    storage: {
      local: {
        async get() {
          storageReads++
          return storageReads === 1 ? defaults : { ...defaults, paused: true }
        },
      },
    },
    tabs: {
      onUpdated: {
        addListener(listener) {
          listeners.updated = listener
        },
      },
    },
  }
  const sandbox = {
    browser,
    console,
    DEFAULTS: defaults,
    capNotifyBody: (text, max = 200) => {
      const s = String(text ?? '').trim()
      return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`
    },
    fetch: async () => {
      calls.push({ fetch: true })
      throw new Error('offline')
    },
    matchWatchPage,
    URL,
  }
  vm.runInNewContext(code, sandbox)
  return { calls, listeners }
}

test('URL updates clear the watch key after leaving a watch URL', async () => {
  const { calls, listeners } = createSandbox()

  await listeners.updated(
    7,
    { url: 'https://app.slack.com/client/T1/C123' },
    { id: 7, url: 'https://app.slack.com/client/T1/C123' },
  )

  assert.equal(calls.length, 2)
  assert.equal(calls[1].func.name, 'setWatchKey')
  assert.equal(calls[1].args[0], null)
})

test('watch.changed is dropped when the sender URL no longer matches its key', async () => {
  const { calls, listeners } = createSandbox()

  await listeners.message(
    { type: 'watch.changed', watchKey: 'slack-activity' },
    { tab: { id: 7, url: 'https://app.slack.com/client/T1/C123' } },
  )

  assert.equal(calls.some(call => call.fetch), false)
})

test('watch.changed is dropped when the sender key does not match the URL', async () => {
  const { calls, listeners } = createSandbox()

  await listeners.message(
    { type: 'watch.changed', watchKey: 'stale-key' },
    { tab: { id: 7, url: 'https://app.slack.com/client/T1/activity-inbox' } },
  )

  assert.equal(calls.some(call => call.fetch), false)
})
