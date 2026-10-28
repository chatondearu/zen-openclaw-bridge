// Injected only on watch-matched tabs. Emits watch.changed when main text hash changes.
if (!window.__zenOpenclawWatchObserver) {
  window.__zenOpenclawWatchObserver = true
  let lastHash = null
  const djb2 = (text) => {
    let hash = 5381
    for (let i = 0; i < text.length; i++)
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i)
    return (hash >>> 0).toString(16)
  }
  const tick = () => {
    const watchKey = window.__zenWatchKey
    if (!watchKey)
      return
    const root = document.querySelector('[role="main"]') ?? document.body
    const excerpt = (root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000)
    const hash = djb2(excerpt)
    if (hash === lastHash)
      return
    lastHash = hash
    browser.runtime.sendMessage({
      type: 'watch.changed',
      watchKey,
      title: document.title,
      hash,
      excerpt,
    }).catch(() => {})
  }
  tick()
  const root = document.querySelector('[role="main"]') ?? document.body
  const observer = new MutationObserver(() => {
    clearTimeout(window.__zenWatchDebounce)
    window.__zenWatchDebounce = setTimeout(tick, 400)
  })
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  setInterval(tick, 5000)
}
