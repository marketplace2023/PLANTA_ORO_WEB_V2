import { describe, expect, it } from 'vitest'
import { playableVideoUrl, videoTime } from './lesson-video'

describe('Video links', () => {
  it.each(['https://www.youtube.com/watch?v=example', 'https://youtu.be/example', 'https://player.vimeo.com/video/1', 'https://media.example/video.mp4?signature=123', 'https://media.example/playlist.m3u8'])('embeds supported media: %s', (url) => expect(playableVideoUrl(url)).toBe(true))
  it.each(['javascript:alert(1)', 'https://youtube.com.evil.example/v', 'https://user:password@youtube.com/v', 'https://example.com/course', '/video.mp4'])('keeps unsupported inputs out of the player: %s', (url) => expect(playableVideoUrl(url)).toBe(false))
  it('formats a saved position', () => expect(videoTime(125.8)).toBe('2:05'))
})
