const $ = id => document.getElementById(id)
const status = $('status')

browser.storage.local.get(DEFAULTS).then((cfg) => {
  $('bridgeUrl').value = cfg.bridgeUrl
  $('token').value = cfg.token
  $('allowlist').value = cfg.allowlist.join('\n')
  $('paused').checked = cfg.paused
  checkBridge(cfg.bridgeUrl)
})

async function checkBridge(url) {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/health`)
    status.textContent = res.ok ? 'Bridge reachable.' : `Bridge answered ${res.status}.`
  }
  catch {
    status.textContent = 'Bridge not reachable — is `node bridge/server.mjs` running there?'
  }
}

// Plain HTTP is only acceptable on loopback; anything remote must be HTTPS.
function bridgePermission(url) {
  const u = new URL(url)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
  if (u.protocol === 'https:' || (u.protocol === 'http:' && loopback))
    return `${u.protocol}//${u.hostname}/*`
  return null
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const bridgeUrl = $('bridgeUrl').value.trim()
  const bridgeOrigin = bridgePermission(bridgeUrl)
  if (!bridgeOrigin) {
    status.textContent = 'Remote bridge must use https:// (plain http is only allowed on 127.0.0.1 / localhost).'
    return
  }
  const allowlist = $('allowlist').value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (allowlist.some(h => !/^(?:\*\.)?[a-z0-9.-]+$/.test(h))) {
    status.textContent = 'Invalid origin: use hostnames like slack.com or *.slack.com.'
    return
  }
  // Must run first, inside the user gesture.
  const granted = await browser.permissions.request({ origins: [bridgeOrigin, ...allowlist.map(h => `*://${h}/*`)] })
  await browser.storage.local.set({
    bridgeUrl,
    token: $('token').value.trim(),
    allowlist,
    paused: $('paused').checked,
  })
  status.textContent = granted ? 'Saved.' : 'Saved, but host access was refused: the bridge or some origins are unreachable.'
  checkBridge(bridgeUrl)
})
