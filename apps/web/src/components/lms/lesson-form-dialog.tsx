import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAddLesson, useRemoveLessonVideo, useUpdateLesson, useUploadLessonVideo, type CourseSection, type Lesson } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'

/** Metadata and media are saved separately; retrying an upload never creates another lesson. */
export function LessonFormDialog({ courseId, lesson, sections, initialSectionId, onClose }: { courseId: string; lesson?: Lesson; sections?: CourseSection[]; initialSectionId?: string | null; onClose: () => void }) {
  const add = useAddLesson(courseId)
  const update = useUpdateLesson(courseId)
  const upload = useUploadLessonVideo(courseId)
  const remove = useRemoveLessonVideo(courseId)
  const [mode, setMode] = useState<'none' | 'external' | 'upload'>(lesson?.video ? 'upload' : lesson?.videoUrl ? 'external' : 'none')
  const [file, setFile] = useState<File | null>(null)
  const savedId = useRef(lesson?.id)
  const abort = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState('')
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [content, setContent] = useState(lesson?.content ?? '')
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? '')
  const [minutes, setMinutes] = useState(String(lesson?.durationMinutes ?? 10))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [sectionId, setSectionId] = useState(lesson?.sectionId ?? initialSectionId ?? '')
  useEffect(() => () => abort.current?.abort(), [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Requerido'
    if (!Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 1440) next.durationMinutes = 'Minutos enteros entre 0 y 1440'
    if (mode === 'upload' && !file && !lesson?.video) next.file = 'Selecciona un archivo de video'
    if (mode === 'external') {
      try { const url = new URL(videoUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error() } catch { next.videoUrl = 'Indica un enlace http o https válido' }
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    setPhase('Guardando la lección…')
    try {
      const section = sections?.length ? { sectionId: sectionId || null } : {}
      if (savedId.current) await update.mutateAsync({ ...section, id: savedId.current, title: title.trim(), content: content.trim() || null, videoUrl: mode === 'external' ? videoUrl.trim() : null, durationMinutes: Number(minutes) })
      else {
        const created = await add.mutateAsync({ ...section, title: title.trim(), content: content.trim() || undefined, videoUrl: mode === 'external' ? videoUrl.trim() : undefined, durationMinutes: Number(minutes) })
        savedId.current = created.createdLessonId
      }
      if (mode === 'upload' && file) {
        if (!savedId.current) throw new Error('No se pudo identificar la lección creada. Ábrela desde el listado para añadir el video.')
        setPhase(`Subiendo ${file.name}… No cierres esta ventana.`)
        abort.current = new AbortController()
        await upload.mutateAsync({ lessonId: savedId.current, file, signal: abort.current.signal })
      } else if (mode === 'none' && lesson?.video && savedId.current) await remove.mutateAsync(savedId.current)
      toast.success(mode === 'upload' && file ? 'Video recibido. Se está preparando para reproducir.' : lesson ? 'Lección actualizada' : 'Lección agregada')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof Error ? `${savedId.current ? 'La lección está guardada. ' : ''}${err.name === 'AbortError' ? 'Carga cancelada; puedes volver a intentarlo.' : err.message}` : 'No se pudo guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
      setPhase('')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) { abort.current?.abort(); onClose() } }}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lesson ? 'Editar lección' : 'Nueva lección'}</DialogTitle>
          <DialogDescription>Solo quienes se inscriben en el curso ven el contenido.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {!!sections?.length && <div className="space-y-1.5"><Label htmlFor="lf-module">Módulo</Label><select id="lf-module" className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm" value={sectionId} onChange={e => setSectionId(e.target.value)}><option value="">Sin módulo</option>{sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>}
          <div className="space-y-1.5">
            <Label htmlFor="lf-title">Título</Label>
            <Input id="lf-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
            {errors.title && <p className="text-sm text-fur-red-500">{errors.title}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-content">Contenido</Label>
            <Textarea id="lf-content" className="min-h-40" value={content} onChange={(e) => setContent(e.target.value)} aria-invalid={!!errors.content} />
            {errors.content && <p className="text-sm text-fur-red-500">{errors.content}</p>}
          </div>
          <fieldset className="space-y-2 rounded-lg border border-border p-3" disabled={busy}>
            <legend className="px-1 text-sm font-medium">Origen del video</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {([['none', 'Sin video'], ['external', 'Enlace externo'], ['upload', 'Subir archivo']] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="lesson-video-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />{label}</label>)}
            </div>
            {mode === 'upload' && <div className="space-y-2">
              {lesson?.video && <p className="text-xs text-muted-foreground">Actual: {lesson.video.originalName} · {lesson.video.status === 'READY' ? 'Listo' : lesson.video.status === 'FAILED' ? 'Error de preparación' : 'Preparando'}</p>}
              <Label htmlFor="lf-file">Archivo de video</Label>
              <Input id="lf-file" type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} aria-invalid={!!errors.file} />
              <p className="text-xs text-muted-foreground">MP4, MOV o WebM. El archivo se guarda de forma privada y se prepara para reproducir dentro del curso. La duración se detecta al procesarlo.</p>
              {errors.file && <p role="alert" className="text-sm text-destructive">{errors.file}</p>}
            </div>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'external' &&
            <div className="space-y-1.5">
              <Label htmlFor="lf-video">Video (enlace)</Label>
              <Input id="lf-video" className="h-10" placeholder="https://…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} aria-invalid={!!errors.videoUrl} />
              {errors.videoUrl && <p className="text-sm text-fur-red-500">{errors.videoUrl}</p>}
              <p className="text-xs text-muted-foreground">YouTube, Vimeo o enlace directo a un video. Otros sitios se abrirán como enlace externo.</p>
            </div>}
            <div className="space-y-1.5">
              <Label htmlFor="lf-min">Duración (minutos)</Label>
              <Input id="lf-min" type="number" min={0} max={1440} className="h-10" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={!!errors.durationMinutes} />
              {errors.durationMinutes && <p className="text-sm text-fur-red-500">{errors.durationMinutes}</p>}
            </div>
          </div>
          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>
          {phase && <p role="status" className="text-sm text-muted-foreground">{phase}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => busy ? abort.current?.abort() : onClose()}>
              {busy ? 'Cancelar carga' : 'Cancelar'}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : lesson ? 'Guardar cambios' : 'Agregar lección'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
