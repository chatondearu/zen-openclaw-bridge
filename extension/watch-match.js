// Pure URL → watchKey matcher (loaded by background via importScripts).
function matchWatchPage(url, pages) {
  if (!url || !pages?.length)
    return null
  for (const page of pages) {
    const parts = page.urlIncludes || []
    if (parts.length && parts.every(p => url.includes(p)))
      return { key: page.key }
  }
  return null
}
