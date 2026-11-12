import { parseVideoProbe, videoRange, videoSource } from './video-tools'

describe('Video streaming boundaries', () => {
  it('supports a complete file, open, suffix and bounded single ranges', () => {
    expect(videoRange(undefined, 100)).toEqual({ start: 0, end: 99, partial: false })
    expect(videoRange('bytes=20-', 100)).toEqual({ start: 20, end: 99, partial: true })
    expect(videoRange('bytes=-15', 100)).toEqual({ start: 85, end: 99, partial: true })
    expect(videoRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99, partial: true })
  })
  it.each(['bytes=100-', 'bytes=20-10', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=-', 'other=0-1'])('rejects invalid range %s', (range) => {
    expect(videoRange(range, 100)).toBeNull()
  })
  it('rejects files without a usable video stream or duration', () => {
    expect(() => parseVideoProbe(JSON.stringify({ streams: [{ codec_type: 'audio' }], format: { duration: '20' } }))).toThrow()
    expect(parseVideoProbe(JSON.stringify({ streams: [{ codec_type: 'video', width: 1920, height: 1080 }], format: { duration: '125.8' } }))).toBe(125.8)
  })
  it('separates progress for replaced videos and changed links', () => {
    expect(videoSource(null, 'v1')).not.toBe(videoSource(null, 'v2'))
    expect(videoSource('https://example.test/1.mp4')).not.toBe(videoSource('https://example.test/2.mp4'))
  })
})
