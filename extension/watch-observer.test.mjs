import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const dir = dirname(fileURLToPath(import.meta.url))
const code = readFileSync(join(dir, 'watch-observer.js'), 'utf8')

test('emits only when normalized watch content changes', async () => {
  const messages = []
  const root = { innerText: '  First \n item  ' }
  let mutation
  const window = { __zenWatchKey: 'slack-mentions' }
  const sandbox = {
    browser: {
      runtime: {
        sendMessage(message) {
          messages.push(message)
          return Promise.resolve()
        },
      },
    },
    clearTimeout() {},
    document: {
      body: root,
      querySelector: () => root,
      title: 'Mentions',
    },
    MutationObserver: class {
      constructor(callback) {
        mutation = callback
      }

      observe() {}
    },
    setInterval() {},
    setTimeout(callback) {
      callback()
    },
    window,
  }

  vm.runInNewContext(code, sandbox)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].excerpt, 'First item')
  assert.equal(messages[0].watchKey, 'slack-mentions')

  mutation()
  assert.equal(messages.length, 1)

  root.innerText = 'Second item'
  mutation()
  assert.equal(messages.length, 2)
  assert.notEqual(messages[0].hash, messages[1].hash)
})
