const DEFAULTS = { bridgeUrl: 'http://127.0.0.1:18901', token: '', allowlist: ['*.slack.com'], paused: false }
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
    status.textContent = 'Bridge not reachable — is `node bridge/server.mjs` running?'
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const allowlist = $('allowlist').value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (allowlist.some(h => !/^(?:\*\.)?[a-z0-9.-]+$/.test(h))) {
    status.textContent = 'Invalid origin: use hostnames like slack.com or *.slack.com.'
    return
  }
  // Must run first, inside the user gesture.
  const granted = await browser.permissions.request({ origins: allowlist.map(h => `*://${h}/*`) })
  await browser.storage.local.set({
    bridgeUrl: $('bridgeUrl').value.trim(),
    token: $('token').value.trim(),
    allowlist,
    paused: $('paused').checked,
  })
  status.textContent = granted ? 'Saved.' : 'Saved, but host access was refused: those origins cannot be observed.'
  checkBridge($('bridgeUrl').value.trim())
})
