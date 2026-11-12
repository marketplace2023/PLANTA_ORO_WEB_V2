import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Lesson } from '@/features/lms/use-lms'
import { api } from '@/lib/api'
import { LessonVideo } from './lesson-video'

vi.mock('@/lib/api', () => ({
  api: vi.fn(), apiUrl: (path: string) => `/api/v1${path}`,
  jsonBody: (body: unknown) => ({ body: JSON.stringify(body) }),
}))
const sample: Lesson = {
  id: 'lesson', title: 'Grinding', position: 0, durationMinutes: 2, content: null, videoUrl: null, completed: false,
  video: { id: 'video', status: 'READY', originalName: 'plant.mp4', durationSeconds: 100, error: null },
  playbackSource: 'upload:video', playback: { positionSeconds: 20, durationSeconds: 100, watchedSeconds: 20 },
}
function mount(lesson = sample, track = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><LessonVideo courseId="course" lesson={lesson} track={track} /></QueryClientProvider>)
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Lesson playback', () => {
  it('restores a private video and saves the current position on pause and completion', async () => {
    vi.mocked(api).mockImplementation(async (path) => path.endsWith('/session') ? { path: '/private-video?ticket=scoped' } : { completed: false })
    mount()
    const video = await screen.findByLabelText('Video de Grinding') as HTMLVideoElement
    expect(video.src).toContain('/api/v1/private-video?ticket=scoped')
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(20)
    video.currentTime = 35
    fireEvent.pause(video)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/courses/course/lessons/lesson/playback', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ positionSeconds: 35, durationSeconds: 100, source: 'upload:video', ended: false }) })))
    video.currentTime = 100
    fireEvent.ended(video)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/courses/course/lessons/lesson/playback', expect.objectContaining({ body: JSON.stringify({ positionSeconds: 100, durationSeconds: 100, source: 'upload:video', ended: true }) })))
  })

  it('does not record student progress from the instructor preview', async () => {
    vi.mocked(api).mockResolvedValue({ path: '/preview' })
    mount(sample, false)
    const video = await screen.findByLabelText('Video de Grinding') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
    fireEvent.loadedMetadata(video)
    fireEvent.pause(video)
    fireEvent.ended(video)
    expect(vi.mocked(api).mock.calls.every(([path]) => path.endsWith('/session'))).toBe(true)
  })

  it('shows processing or failure without requesting a playback ticket', () => {
    mount({ ...sample, video: { ...sample.video!, status: 'FAILED', error: 'Upload another file' } })
    expect(screen.getByRole('status')).toHaveTextContent('Upload another file')
    expect(api).not.toHaveBeenCalled()
  })

  it('keeps unsupported providers as external links', () => {
    mount({ ...sample, video: null, videoUrl: 'https://training.example/lesson' }, false)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://training.example/lesson')
    expect(api).not.toHaveBeenCalled()
  })
})
