// Shared by the background, options and chat pages.
const DEFAULTS = {
  bridgeUrl: 'http://127.0.0.1:18901',
  token: '',
  allowlist: ['*.slack.com', 'mail.google.com', 'calendar.google.com', 'github.com', 'linear.app', 'claude.ai'],
  paused: false,
  cyrusNotifications: true,
  watchPages: [
    { key: 'slack-mentions', urlIncludes: ['/mentions'] },
    { key: 'slack-activity', urlIncludes: ['/activity-inbox'] },
    { key: 'linear-inbox', urlIncludes: ['linear.app/', '/inbox'] },
  ],
}

/** Cap toast body (~4 ADHD lines). Exported for tests via same file load. */
function capNotifyBody(text, max = 200) {
  const s = String(text ?? '').trim()
  if (s.length <= max)
    return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}
