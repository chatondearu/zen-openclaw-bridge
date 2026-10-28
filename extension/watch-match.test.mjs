import assert from 'node:assert/strict'
import { deepEqual } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const dir = dirname(fileURLToPath(import.meta.url))
const code = readFileSync(join(dir, 'watch-match.js'), 'utf8')
const sandbox = { module: { exports: {} }, exports: {} }
vm.runInNewContext(`${code}\nmodule.exports = { matchWatchPage };`, sandbox)
const { matchWatchPage } = sandbox.module.exports

const pages = [
  { key: 'slack-mentions', urlIncludes: ['/mentions'] },
  { key: 'slack-activity', urlIncludes: ['/activity-inbox'] },
  { key: 'linear-inbox', urlIncludes: ['linear.app/', '/inbox'] },
]

test('matches slack mentions', () => {
  deepEqual(
    matchWatchPage('https://app.slack.com/client/T1/mentions', pages),
    { key: 'slack-mentions' },
  )
})

test('matches slack activity', () => {
  deepEqual(
    matchWatchPage('https://app.slack.com/client/T1/activity-inbox', pages),
    { key: 'slack-activity' },
  )
})

test('matches linear inbox', () => {
  deepEqual(
    matchWatchPage('https://linear.app/acme/inbox', pages),
    { key: 'linear-inbox' },
  )
})

test('ignores plain slack channel', () => {
  assert.equal(matchWatchPage('https://app.slack.com/client/T1/C123', pages), null)
})

test('first matching page wins', () => {
  const overlapping = [
    { key: 'a', urlIncludes: ['slack.com'] },
    { key: 'b', urlIncludes: ['slack.com', '/mentions'] },
  ]
  deepEqual(matchWatchPage('https://app.slack.com/client/T1/mentions', overlapping), { key: 'a' })
})
