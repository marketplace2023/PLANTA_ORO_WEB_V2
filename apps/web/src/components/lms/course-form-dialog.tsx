import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { CheckGroup } from '@/components/organizations/check-group'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useCreateCourse, useUpdateCourse, type CourseDetail, type CourseLevel, type OwnerType } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'
import { LEVEL_LABELS, LEVELS } from '@/lib/lms'

type Props = {
  /** Si se pasa un curso, se edita; si no, se crea uno nuevo del propietario indicado. */
  course?: CourseDetail
  owner?: { ownerType: OwnerType; ownerId?: string }
  onClose: () => void
  onSaved?: (course: CourseDetail) => void
}

/** Datos generales del curso. La duración no se edita: es la suma de sus lecciones. */
export function CourseFormDialog({ course, owner, onClose, onSaved }: Props) {
  const create = useCreateCourse()
  const update = useUpdateCourse(course?.id ?? '')
  const stages = useStageCatalog()
  const [title, setTitle] = useState(course?.title ?? '')
  const [description, setDescription] = useState(course?.description ?? '')
  const [level, setLevel] = useState<CourseLevel>(course?.level ?? 'BASIC')
  const [instructor, setInstructor] = useState(course?.instructorName ?? '')
  const [certificate, setCertificate] = useState(course?.certificate ?? false)
  const [stageCodes, setStageCodes] = useState(course?.stages.map((s) => s.code) ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Requerido'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      const saved = course
        ? await update.mutateAsync({ title: title.trim(), description: description.trim() || null, level, instructorName: instructor.trim() || null, certificate, stageCodes })
        : await create.mutateAsync({ ...owner!, title: title.trim(), description: description.trim() || undefined, level, instructorName: instructor.trim() || undefined, certificate, stageCodes })
      toast.success(course ? 'Curso actualizado' : 'Curso creado como borrador')
      onSaved?.(saved)
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
          <DialogTitle>{course ? 'Editar curso' : 'Nuevo curso'}</DialogTitle>
          <DialogDescription>Se crea como borrador; agrega lecciones y etapas y luego publícalo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cf-title">Título</Label>
            <Input id="cf-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
            {errors.title && <p className="text-sm text-fur-red-500">{errors.title}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-desc">Descripción</Label>
            <Textarea id="cf-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-level">Nivel</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as CourseLevel)}>
                <SelectTrigger id="cf-level" className="h-10 w-full" aria-label="Nivel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-inst">Instructor</Label>
              <Input id="cf-inst" className="h-10" value={instructor} onChange={(e) => setInstructor(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={certificate} onCheckedChange={(on) => setCertificate(on === true)} />
            Emite certificado verificable al completarlo
          </label>
          <CheckGroup
            legend="Etapas del proceso a las que apunta"
            options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
            value={stageCodes}
            onChange={setStageCodes}
            error={errors.stageCodes}
            help="Para publicar el curso necesitas al menos una etapa."
          />
          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : course ? 'Guardar cambios' : 'Crear curso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
