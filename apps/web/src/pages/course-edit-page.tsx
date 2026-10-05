import { ArrowDown, ArrowUp, Eye, LockKeyhole, Pencil, Plus, SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { CourseFormDialog } from '@/components/lms/course-form-dialog'
import { LessonFormDialog } from '@/components/lms/lesson-form-dialog'
import { StageTags } from '@/components/organizations/org-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { useCourse, useDeleteLesson, useRoster, useUpdateCourse, useUpdateLesson, type CourseStatus, type Lesson } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { COURSE_STATUS_LABELS, formatDuration, levelLabel } from '@/lib/lms'
import { useUrlFilters } from '@/lib/use-url-filters'

const TABS = [
  ['lessons', 'Lecciones'],
  ['students', 'Alumnado'],
] as const

const errorText = (err: unknown) => (err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo completar la acción')

/** Editor del curso: datos generales, estado, lecciones (alta, orden, edición) y alumnado. */
export function CourseEditPage() {
  const { id } = useParams()
  const { user, status } = useAuth()
  const { params, setParam } = useUrlFilters()
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'lessons') as (typeof TABS)[number][0]
  const { data: course, isLoading, isError, error, refetch } = useCourse(id)
  const updateCourse = useUpdateCourse(id ?? '')
  const updateLesson = useUpdateLesson(id ?? '')
  const deleteLesson = useDeleteLesson(id ?? '')
  const roster = useRoster(id, !!course?.canManage && tab === 'students')
  const [editing, setEditing] = useState(false)
  const [lesson, setLesson] = useState<Lesson | 'new' | null>(null)

  if (status !== 'loading' && !user) {
    return <EmptyState icon={LockKeyhole} title="Inicia sesión" description="Necesitas una sesión para editar cursos." action={<Button asChild><Link to="/login">Iniciar sesión</Link></Button>} />
  }
  if (error instanceof ApiError && error.status === 404) {
    return <EmptyState icon={SearchX} title="Curso no encontrado" description="No existe o no tienes acceso a él." action={<Button asChild variant="secondary"><Link to="/courses">Ver cursos</Link></Button>} />
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !course || status === 'loading') return <Skeleton className="h-64" aria-busy="true" />
  if (!course.canManage) {
    return <EmptyState icon={LockKeyhole} title="Sin acceso a la edición" description="Solo los miembros de la organización propietaria y el administrador del ecosistema editan este curso." action={<Button asChild variant="secondary"><Link to={`/courses/${course.id}`}>Ver curso</Link></Button>} />
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action()
      toast.success(ok)
    } catch (err) {
      toast.error(errorText(err))
    }
  }
  const setStatus = (next: CourseStatus, ok: string) => run(() => updateCourse.mutateAsync({ status: next }), ok)

  return (
    <>
      <PageHeader
        title={course.title}
        description={`${course.owner.name} · ${levelLabel(course.level)} · ${formatDuration(course.durationMinutes)} · ${course.lessons.length} lecciones`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={course.status === 'PUBLISHED' ? 'default' : 'outline'}>{COURSE_STATUS_LABELS[course.status]}</Badge>
            {course.status !== 'PUBLISHED' && (
              <Button onClick={() => void setStatus('PUBLISHED', 'Curso publicado')} disabled={updateCourse.isPending}>
                <Eye /> Publicar
              </Button>
            )}
            {course.status === 'PUBLISHED' && (
              <Button variant="secondary" onClick={() => void setStatus('ARCHIVED', 'Curso archivado')} disabled={updateCourse.isPending}>
                Archivar
              </Button>
            )}
            {course.status === 'PUBLISHED' && (
              <Button variant="ghost" onClick={() => void setStatus('DRAFT', 'Curso pasado a borrador')} disabled={updateCourse.isPending}>
                Pasar a borrador
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil /> Datos del curso
            </Button>
            <Button asChild variant="ghost">
              <Link to={`/courses/${course.id}`}>Vista del alumno</Link>
            </Button>
          </div>
        }
      />
      <div className="mb-4 space-y-2">
        {course.description && <p className="text-sm">{course.description}</p>}
        <StageTags stages={course.stages} max={20} />
        <p className="text-xs text-fur-gray-600">
          {course.certificate ? 'Emite certificado.' : 'No emite certificado.'} Instructor: {course.instructorName ?? '—'}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParam({ tab: v }, true)}>
        <div className="mb-4 overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {tab === 'lessons' && (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setLesson('new')}>
              <Plus /> Nueva lección
            </Button>
          </div>
          {course.lessons.length === 0 ? (
            <EmptyState icon={Plus} title="Aún no hay lecciones" description="Agrega al menos una lección para poder publicar el curso." action={<Button onClick={() => setLesson('new')}>Nueva lección</Button>} />
          ) : (
            <ol className="divide-y divide-border rounded-lg border border-border bg-card">
              {course.lessons.map((l, i) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 p-3">
                  <span className="fur-code w-6 text-fur-gray-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.title}</p>
                    <p className="text-xs text-fur-gray-600">{formatDuration(l.durationMinutes)}{l.videoUrl ? ' · con video' : ''}</p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Subir ${l.title}`} disabled={i === 0 || updateLesson.isPending} onClick={() => void run(() => updateLesson.mutateAsync({ id: l.id, position: i - 1 }), 'Lección movida')}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Bajar ${l.title}`} disabled={i === course.lessons.length - 1 || updateLesson.isPending} onClick={() => void run(() => updateLesson.mutateAsync({ id: l.id, position: i + 1 }), 'Lección movida')}>
                    <ArrowDown />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Editar ${l.title}`} onClick={() => setLesson(l)}>
                    <Pencil /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Eliminar ${l.title}`} disabled={deleteLesson.isPending} onClick={() => void run(() => deleteLesson.mutateAsync(l.id), 'Lección eliminada')}>
                    <Trash2 /> Eliminar
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {tab === 'students' &&
        (roster.isError ? (
          <ErrorState onRetry={() => void roster.refetch()} />
        ) : roster.isLoading || !roster.data ? (
          <Skeleton className="h-32" aria-busy="true" />
        ) : roster.data.total === 0 ? (
          <EmptyState icon={Eye} title="Aún no hay inscritos" description="Cuando alguien se inscriba, verás aquí su avance." />
        ) : (
          <>
            <p className="mb-3 text-sm">
              {roster.data.total} inscritos · {roster.data.completed} completaron
            </p>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Avance</TableHead>
                    <TableHead>Desde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-fur-gray-600">{r.email}</div>
                      </TableCell>
                      <TableCell>{r.status === 'COMPLETED' ? 'Completado' : r.status === 'DROPPED' ? 'Abandonado' : 'En curso'}</TableCell>
                      <TableCell className="text-right">{Math.round(r.progressPercent)} %</TableCell>
                      <TableCell>{formatDate(r.startedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ))}

      {editing && <CourseFormDialog course={course} onClose={() => setEditing(false)} />}
      {lesson && <LessonFormDialog courseId={course.id} lesson={lesson === 'new' ? undefined : lesson} onClose={() => setLesson(null)} />}
    </>
  )
}
