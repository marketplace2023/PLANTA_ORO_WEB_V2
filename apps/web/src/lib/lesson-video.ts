/** Only supported providers and direct media files are embedded; other links remain external. */
export function playableVideoUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    return /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com)$/.test(host)
      || /\.(mp4|webm|ogv|m3u8|mpd)$/i.test(url.pathname)
  } catch { return false }
}

export function videoTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}
