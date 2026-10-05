import { Award, GraduationCap, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { Progress } from '@/components/lms/course-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useMyLearning } from '@/features/lms/use-lms'
import { formatDate } from '@/lib/format'
import { formatDuration, levelLabel } from '@/lib/lms'

/** Mi aprendizaje: cursos en los que estoy inscrito, con avance y certificados. */
export function MyLearningPage() {
  const { user, status } = useAuth()
  const mine = useMyLearning(!!user)

  if (status !== 'loading' && !user) {
    return (
      <>
        <PageHeader title="Mi aprendizaje" />
        <EmptyState icon={LockKeyhole} title="Inicia sesión" description="Necesitas una sesión para ver tus cursos." action={<Button asChild><Link to="/login">Iniciar sesión</Link></Button>} />
      </>
    )
  }
  const items = mine.data ?? []
  const active = items.filter((i) => i.status === 'ENROLLED')
  const done = items.filter((i) => i.status === 'COMPLETED')

  return (
    <>
      <PageHeader title="Mi aprendizaje" description="Tus cursos en progreso y completados." actions={<Button asChild variant="secondary"><Link to="/courses">Explorar cursos</Link></Button>} />
      {mine.isError ? (
        <ErrorState onRetry={() => void mine.refetch()} />
      ) : mine.isLoading ? (
        <Skeleton className="h-40" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Aún no estás inscrito en ningún curso" description="Explora el catálogo y filtra por la etapa del proceso en la que trabajas." action={<Button asChild><Link to="/courses">Explorar cursos</Link></Button>} />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="ml-active">
            <h2 id="ml-active" className="mb-3 text-lg font-semibold text-fur-navy-900">
              En progreso ({active.length})
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-fur-gray-600">No tienes cursos en progreso.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.map((i) => (
                  <li key={i.id} className="space-y-2 rounded-lg border border-border bg-card p-4">
                    <h3 className="font-semibold text-fur-navy-900">
                      <Link to={`/courses/${i.course.id}`} className="underline-offset-2 hover:underline">
                        {i.course.title}
                      </Link>
                    </h3>
                    <p className="text-xs text-fur-gray-600">
                      {levelLabel(i.course.level)} · {formatDuration(i.course.durationMinutes)} · desde {formatDate(i.startedAt)}
                    </p>
                    {i.course.status === 'ARCHIVED' && <Badge variant="outline">Archivado: puedes terminarlo</Badge>}
                    <Progress percent={i.progressPercent} label={`Progreso en ${i.course.title}`} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="ml-done">
            <h2 id="ml-done" className="mb-3 text-lg font-semibold text-fur-navy-900">
              Completados ({done.length})
            </h2>
            {done.length === 0 ? (
              <p className="text-sm text-fur-gray-600">Aún no completaste ningún curso.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {done.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                    <Link to={`/courses/${i.course.id}`} className="min-w-0 flex-1 font-medium underline-offset-2 hover:underline">
                      {i.course.title}
                    </Link>
                    <span className="text-sm text-fur-gray-600">Completado el {formatDate(i.completedAt)}</span>
                    {i.certificateCode && (
                      <Button asChild size="sm" variant="secondary">
                        <Link to={`/certificates/${i.certificateCode}`}>
                          <Award /> Certificado
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  )
}
