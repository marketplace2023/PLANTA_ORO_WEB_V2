import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAddLesson, useUpdateLesson, type Lesson } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'

/** Alta o edición de una lección. El contenido es texto plano (no HTML) y el video, un enlace externo http(s). */
export function LessonFormDialog({ courseId, lesson, onClose }: { courseId: string; lesson?: Lesson; onClose: () => void }) {
  const add = useAddLesson(courseId)
  const update = useUpdateLesson(courseId)
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [content, setContent] = useState(lesson?.content ?? '')
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? '')
  const [minutes, setMinutes] = useState(String(lesson?.durationMinutes ?? 10))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Requerido'
    if (!Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 1440) next.durationMinutes = 'Minutos enteros entre 0 y 1440'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      if (lesson) await update.mutateAsync({ id: lesson.id, title: title.trim(), content: content.trim() || null, videoUrl: videoUrl.trim() || null, durationMinutes: Number(minutes) })
      else await add.mutateAsync({ title: title.trim(), content: content.trim() || undefined, videoUrl: videoUrl.trim() || undefined, durationMinutes: Number(minutes) })
      toast.success(lesson ? 'Lección actualizada' : 'Lección agregada')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lesson ? 'Editar lección' : 'Nueva lección'}</DialogTitle>
          <DialogDescription>Solo quienes se inscriben en el curso ven el contenido.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lf-video">Video (enlace)</Label>
              <Input id="lf-video" className="h-10" placeholder="https://…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} aria-invalid={!!errors.videoUrl} />
              {errors.videoUrl && <p className="text-sm text-fur-red-500">{errors.videoUrl}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-min">Duración (minutos)</Label>
              <Input id="lf-min" type="number" min={0} max={1440} className="h-10" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={!!errors.durationMinutes} />
              {errors.durationMinutes && <p className="text-sm text-fur-red-500">{errors.durationMinutes}</p>}
            </div>
          </div>
          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
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
