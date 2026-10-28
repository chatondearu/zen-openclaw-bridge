// Shared by the background, options and chat pages.
const DEFAULTS = {
  bridgeUrl: 'http://127.0.0.1:18901',
  token: '',
  allowlist: ['*.slack.com', 'mail.google.com', 'calendar.google.com', 'github.com', 'linear.app', 'claude.ai'],
  paused: false,
  watchPages: [
    { key: 'slack-mentions', urlIncludes: ['/mentions'] },
    { key: 'slack-activity', urlIncludes: ['/activity-inbox'] },
    { key: 'linear-inbox', urlIncludes: ['linear.app/', '/inbox'] },
  ],
}
