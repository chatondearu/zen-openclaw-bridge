import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const dir = dirname(fileURLToPath(import.meta.url))

test('capNotifyBody keeps short text and truncates with ellipsis', () => {
  const sandbox = {}
  vm.runInNewContext(readFileSync(join(dir, 'defaults.js'), 'utf8'), sandbox)
  assert.equal(sandbox.capNotifyBody('hi'), 'hi')
  assert.equal(sandbox.capNotifyBody('  padded  '), 'padded')
  const long = 'x'.repeat(250)
  const capped = sandbox.capNotifyBody(long)
  assert.equal(capped.length, 200)
  assert.equal(capped.endsWith('…'), true)
})
