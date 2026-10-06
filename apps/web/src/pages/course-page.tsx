import { Award, CheckCircle2, Circle, ExternalLink, LockKeyhole, Pencil, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { Progress } from '@/components/lms/course-bits'
import { PageHeader } from '@/components/layout/page-header'
import { StageTags, VerifiedBadge } from '@/components/organizations/org-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useCourse, useDrop, useEnroll, useLessonProgress, type CourseDetail } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { coursePriceText, formatDuration, levelLabel } from '@/lib/lms'

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'No se pudo completar la acción')

function Study({ course }: { course: CourseDetail }) {
  const progress = useLessonProgress(course.id)
  const enrolled = course.myEnrollment && course.myEnrollment.status !== 'DROPPED' ? course.myEnrollment : null
  const canRead = !!enrolled || course.canManage
  // La primera lección pendiente es la que se abre por defecto; el resto se elige del temario.
  const firstPending = course.lessons.find((l) => !l.completed) ?? course.lessons[0]
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const lesson = course.lessons.find((l) => l.id === selectedId) ?? firstPending
  const completed = enrolled?.status === 'COMPLETED'

  async function toggle(done: boolean) {
    if (!lesson) return
    try {
      const result = await progress.mutateAsync({ lessonId: lesson.id, done })
      if (done && result.status === 'COMPLETED') toast.success('¡Curso completado!')
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <nav aria-label="Temario" className="space-y-2">
        <h2 className="text-base font-semibold text-fur-navy-900">Temario</h2>
        <ol className="divide-y divide-border rounded-lg border border-border bg-card">
          {course.lessons.map((l, i) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setSelectedId(l.id)}
                aria-current={lesson?.id === l.id ? 'true' : undefined}
                className={`flex w-full items-start gap-2 p-3 text-left text-sm hover:bg-muted ${lesson?.id === l.id ? 'bg-muted font-medium' : ''}`}
              >
                {l.completed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-fur-green-500" aria-label="Completada" /> : <Circle className="mt-0.5 size-4 shrink-0 text-fur-gray-500" aria-label="Pendiente" />}
                <span className="min-w-0 flex-1">
                  {i + 1}. {l.title}
                  <span className="block text-xs font-normal text-fur-gray-600">{formatDuration(l.durationMinutes)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby="lesson-title" className="space-y-4 rounded-lg border border-border bg-card p-5">
        {lesson ? (
          <>
            <h2 id="lesson-title" className="text-xl font-semibold text-fur-navy-900">
              {lesson.title}
            </h2>
            {canRead ? (
              <>
                {lesson.content ? <p className="text-sm whitespace-pre-wrap">{lesson.content}</p> : <p className="text-sm text-fur-gray-600">Esta lección no tiene texto.</p>}
                {lesson.videoUrl && (
                  <Button asChild variant="secondary" size="sm">
                    <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer nofollow">
                      <ExternalLink /> Ver video
                    </a>
                  </Button>
                )}
                {enrolled && (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    {lesson.completed ? (
                      <Button size="sm" variant="secondary" disabled={progress.isPending || completed} onClick={() => void toggle(false)} title={completed ? 'El curso ya está completado' : undefined}>
                        Deshacer
                      </Button>
                    ) : (
                      <Button size="sm" disabled={progress.isPending} onClick={() => void toggle(true)}>
                        <CheckCircle2 /> Marcar como completada
                      </Button>
                    )}
                    {lesson.completed && <Badge variant="outline">Completada</Badge>}
                  </div>
                )}
              </>
            ) : (
              <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                <LockKeyhole className="size-4" aria-hidden /> El contenido de las lecciones está disponible al inscribirte en el curso.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-fur-gray-600">Este curso aún no tiene lecciones.</p>
        )}
      </section>
    </div>
  )
}

/** Curso: ficha pública con temario; al inscribirse, el contenido, el avance y el certificado. */
export function CoursePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: course, isLoading, isError, error, refetch } = useCourse(id)
  const enroll = useEnroll(id ?? '')
  const drop = useDrop(id ?? '')

  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={SearchX}
        title="Curso no disponible"
        description="El curso no existe, no está publicado o no es visible para tu cuenta."
        action={
          <Button asChild variant="secondary">
            <Link to="/courses">Ver cursos</Link>
          </Button>
        }
      />
    )
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !course) return <Skeleton className="h-64" aria-busy="true" />

  const mine = course.myEnrollment && course.myEnrollment.status !== 'DROPPED' ? course.myEnrollment : null
  const takeable = course.status === 'PUBLISHED' && course.lessons.length > 0

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action()
      toast.success(ok)
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <>
      <PageHeader
        title={course.title}
        description={course.description ?? undefined}
        actions={
          course.canManage && (
            <Button asChild variant="secondary">
              <Link to={`/courses/${course.id}/edit`}>
                <Pencil /> Editar curso
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{levelLabel(course.level)}</Badge>
          {course.certificate && (
            <Badge variant="outline" className="gap-1">
              <Award aria-hidden /> Emite certificado
            </Badge>
          )}
          {course.status !== 'PUBLISHED' && <Badge variant="outline">{course.status === 'DRAFT' ? 'Borrador (no visible al público)' : 'Archivado'}</Badge>}
          <Badge variant={course.price > 0 ? 'default' : 'outline'} aria-label={`Precio: ${coursePriceText(course.price, course.currency)}`}>
            {coursePriceText(course.price, course.currency)}
          </Badge>
          <span className="text-sm text-fur-gray-600">
            {formatDuration(course.durationMinutes)} · {course.lessons.length} {course.lessons.length === 1 ? 'lección' : 'lecciones'}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fur-gray-600">Instructor:</span> {course.instructorName ?? '—'} <span className="text-fur-gray-600">· Ofrece:</span> {course.owner.name}
          <VerifiedBadge verified={course.owner.type !== 'ECOSYSTEM' && course.owner.verified} />
        </p>
        <StageTags stages={course.stages} max={20} />

        {mine ? (
          <div className="max-w-md space-y-3 rounded-lg border border-border bg-card p-4">
            {mine.status === 'COMPLETED' ? (
              <p className="text-sm font-medium">Completaste este curso el {formatDateTime(mine.completedAt)}.</p>
            ) : (
              <Progress percent={mine.progressPercent} label="Tu progreso en el curso" />
            )}
            <div className="flex flex-wrap gap-2">
              {mine.certificateCode && (
                <Button asChild size="sm">
                  <Link to={`/certificates/${mine.certificateCode}`}>
                    <Award /> Ver mi certificado
                  </Link>
                </Button>
              )}
              {mine.status === 'ENROLLED' && (
                <Button size="sm" variant="ghost" disabled={drop.isPending} onClick={() => void run(() => drop.mutateAsync(), 'Abandonaste el curso; tu avance se conserva')}>
                  Abandonar curso
                </Button>
              )}
            </div>
          </div>
        ) : takeable ? (
          user ? (
            <Button disabled={enroll.isPending} onClick={() => void run(() => enroll.mutateAsync(), 'Te inscribiste en el curso')}>
              {enroll.isPending ? 'Inscribiendo…' : course.myEnrollment?.status === 'DROPPED' ? 'Retomar curso' : 'Inscribirme'}
            </Button>
          ) : (
            <p className="text-sm text-fur-gray-600">
              <Link to="/login" className="underline underline-offset-2">
                Inicia sesión
              </Link>{' '}
              para inscribirte y ver el contenido de las lecciones.
            </p>
          )
        ) : null}
      </div>

      <Study course={course} />
    </>
  )
}
