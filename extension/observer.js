// Injected into allowlisted tabs only. Reports title changes (unread/mention markers live there on Slack, Gmail…)
// with a short text excerpt. The background decides whether anything leaves the browser.
if (!window.__zenOpenclawObserver) {
  window.__zenOpenclawObserver = true
  let last = null
  const report = () => {
    if (document.title === last)
      return
    last = document.title
    const root = document.querySelector('[role="main"]') ?? document.body
    browser.runtime.sendMessage({
      type: 'page.observed',
      title: document.title,
      // shortcut: title heuristic ("*"/"!" prefix, "(3)" counters), upgrade to per-site DOM badges if too noisy
      attention: /^[*!]|\(\d+\)/.test(document.title),
      text: root.innerText.slice(-4000),
    }).catch(() => {})
  }
  report()
  setInterval(report, 3000)
}
