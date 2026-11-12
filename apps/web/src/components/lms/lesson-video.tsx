import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, PlayCircle, RefreshCw } from 'lucide-react'
import { api, apiUrl, jsonBody } from '@/lib/api'
import { playableVideoUrl, videoTime } from '@/lib/lesson-video'
import type { Lesson } from '@/features/lms/use-lms'
import { Button } from '@/components/ui/button'

const ExternalPlayer = lazy(() => import('react-player'))
type Position = { positionSeconds: number; durationSeconds: number }
type Payload = Position & { source: string; ended: boolean }

/** Native MP4 playback for private uploads, provider players for external media. */
export function LessonVideo({ courseId, lesson, track = false }: { courseId: string; lesson: Lesson; track?: boolean }) {
  const client = useQueryClient()
  const media = useRef<HTMLVideoElement>(null)
  const position = useRef<Position>({ positionSeconds: lesson.playback?.positionSeconds ?? 0, durationSeconds: lesson.playback?.durationSeconds ?? 0 })
  const [initialResume] = useState(lesson.completed ? 0 : lesson.playback?.positionSeconds ?? 0)
  const resume = useRef(initialResume)
  const restored = useRef(false)
  const playing = useRef(false)
  const finished = useRef(lesson.completed ?? false)
  const pending = useRef<Payload | null>(null)
  const saving = useRef(false)
  const [saveError, setSaveError] = useState(false)
  const [playError, setPlayError] = useState(false)
  const [reload, setReload] = useState(0)
  const video = lesson.video
  const session = useQuery({
    queryKey: ['lms', 'video-session', courseId, lesson.id, video?.id],
    queryFn: () => api<{ path: string; expiresAt: string }>(`/courses/${courseId}/lessons/${lesson.id}/video/session`, { method: 'POST' }),
    enabled: video?.status === 'READY', staleTime: 3 * 60 * 60_000, refetchInterval: video?.status === 'READY' ? 3 * 60 * 60_000 : false, retry: 1,
  })
  const src = video ? (session.data ? apiUrl(session.data.path) : undefined) : lesson.videoUrl ?? undefined

  const flush = useCallback(async (ended = false) => {
    if (!track || !lesson.playbackSource || !position.current.durationSeconds) return
    pending.current = { ...position.current, source: lesson.playbackSource, ended: ended || !!pending.current?.ended }
    if (saving.current) return
    saving.current = true
    try {
      while (pending.current) {
        const payload: Payload = pending.current
        pending.current = null
        try {
          const result = await api<{ completed: boolean }>(`/courses/${courseId}/lessons/${lesson.id}/playback`, { method: 'PATCH', ...jsonBody(payload), keepalive: true })
          setSaveError(false)
          if (result.completed && !finished.current) {
            finished.current = true
            void client.invalidateQueries({ queryKey: ['lms', 'course', courseId] })
            void client.invalidateQueries({ queryKey: ['lms', 'mine'] })
          }
        } catch { setSaveError(true) }
      }
    } finally { saving.current = false }
  }, [client, courseId, lesson.id, lesson.playbackSource, track])

  useEffect(() => {
    const timer = window.setInterval(() => { if (playing.current) void flush() }, 10_000)
    const save = () => { void flush() }
    const hide = () => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', hide)
      save()
    }
  }, [flush])

  useEffect(() => { restored.current = false }, [src, reload])
  const read = () => {
    const element = media.current
    if (element && Number.isFinite(element.currentTime) && Number.isFinite(element.duration) && element.duration > 0) {
      position.current = { positionSeconds: element.currentTime, durationSeconds: element.duration }
      if (restored.current) resume.current = element.currentTime
    }
  }
  const ready = () => {
    const element = media.current
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return
    if (!restored.current) {
      restored.current = true
      if (resume.current > 0) element.currentTime = Math.min(resume.current, Math.max(0, element.duration - 1))
    }
    read()
  }
  const pause = () => { playing.current = false; read(); void flush() }
  const ended = () => { playing.current = false; read(); void flush(true) }
  const start = () => { playing.current = true; read(); void flush() }
  const retry = () => {
    resume.current = position.current.positionSeconds
    setPlayError(false)
    setReload((value) => value + 1)
    if (video) void session.refetch()
  }

  if (video && video.status !== 'READY') return <div className="rounded-lg border border-border bg-muted p-4 text-sm" role="status">
    {video.status === 'FAILED' ? (video.error ?? 'No se pudo preparar el video.') : <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Preparando video para reproducir…</span>}
  </div>
  if (!video && !src) return null
  if (video && session.isError) return <div className="rounded-lg border border-border p-4 text-sm" role="alert">No se pudo abrir el video. <Button size="sm" variant="outline" onClick={retry}>Reintentar</Button></div>
  if (video && !src) return <p className="flex items-center gap-2 text-sm" role="status"><Loader2 className="size-4 animate-spin" /> Abriendo video…</p>

  const props = { controls: true, playsInline: true, width: '100%', height: '100%', className: 'h-full w-full', onLoadedMetadata: ready, onDurationChange: ready, onTimeUpdate: read, onPlaying: start, onPause: pause, onEnded: ended, onError: () => { playing.current = false; setPlayError(true) } }
  const playable = !!video || (!!src && playableVideoUrl(src))

  return <div className="space-y-2">
    {playable && !playError && <div className="aspect-video overflow-hidden rounded-xl bg-black">
      {video ? <video key={`${src}-${reload}`} ref={media} src={src} preload="metadata" {...props} aria-label={`Video de ${lesson.title}`} /> :
        <Suspense fallback={<div className="grid h-full place-items-center text-white"><PlayCircle className="size-8" /></div>}>
          <ExternalPlayer key={`${src}-${reload}`} ref={media} src={src} onReady={ready} {...props} />
        </Suspense>}
    </div>}
    {playError && <div className="rounded-lg border border-border bg-muted p-3 text-sm" role="alert">No se pudo reproducir. Revisa la conexión o los permisos del video. <Button size="sm" variant="outline" onClick={retry}><RefreshCw /> Reintentar</Button></div>}
    {track && initialResume > 0 && <p className="text-xs text-muted-foreground">Continuar desde {videoTime(initialResume)}.</p>}
    {track && <p className="text-xs text-muted-foreground" role="status">{saveError ? 'No se pudo guardar la posición. Se volverá a intentar al continuar.' : 'Tu posición se guarda mientras reproduces. La lección se completa al terminar si has reproducido al menos el 90 %.'}</p>}
    {!video && src && <a href={src} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4"><ExternalLink className="size-4" />{playable ? 'Abrir video en su sitio original' : 'Ver video (enlace externo)'}</a>}
  </div>
}
