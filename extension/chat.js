const log = document.getElementById('log')
const text = document.getElementById('text')
if (location.hash === '#tab')
  document.body.classList.add('tab')

function render(chat) {
  const messages = chat?.messages ?? []
  log.replaceChildren(...messages.map((m) => {
    const div = document.createElement('div')
    div.className = `msg ${m.role}`
    div.textContent = m.text
    return div
  }))
  if (messages.at(-1)?.role === 'user')
    log.append(Object.assign(document.createElement('div'), { className: 'msg assistant', textContent: '…' }))
  log.scrollTop = log.scrollHeight
}

browser.storage.local.get('chat').then(({ chat }) => render(chat))
browser.storage.onChanged.addListener(changes => changes.chat && render(changes.chat.newValue))

document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault()
  const value = text.value.trim()
  if (!value)
    return
  text.value = ''
  // The background owns the request, so closing the popup does not lose the reply.
  browser.runtime.sendMessage({ type: 'chat.send', text: value })
})
text.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    document.getElementById('form').requestSubmit()
  }
})
document.getElementById('new').addEventListener('click', () =>
  browser.storage.local.set({ chat: { session: crypto.randomUUID(), messages: [] } }))
document.getElementById('pop').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('chat.html#tab') })
  window.close()
})
text.focus()
