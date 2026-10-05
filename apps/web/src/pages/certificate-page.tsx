import { Award, SearchX } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useVerifyCertificate } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { formatDuration, levelLabel } from '@/lib/lms'

/** Verificación pública de un certificado por su código: confirma titular, curso, emisor y fecha (nada más). */
export function CertificatePage() {
  const { code } = useParams()
  const { data, isLoading, isError, error, refetch } = useVerifyCertificate(code)

  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={SearchX}
        title="Certificado no encontrado"
        description={`El código ${code ?? ''} no corresponde a ningún certificado emitido por el Ecosistema FUR.`}
        action={
          <Button asChild variant="secondary">
            <Link to="/courses">Ver cursos</Link>
          </Button>
        }
      />
    )
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !data) return <Skeleton className="h-64" aria-busy="true" />

  return (
    <article aria-labelledby="cert-title" className="mx-auto max-w-2xl space-y-4 rounded-xl border-2 border-fur-gold-400 bg-card p-8 text-center">
      <Award className="mx-auto size-12 text-fur-gold-400" aria-hidden />
      <p className="text-xs font-medium tracking-widest text-fur-gray-600 uppercase">Certificado de finalización · verificado</p>
      <p className="text-sm text-fur-gray-600">Se certifica que</p>
      <h1 id="cert-title" className="text-3xl text-fur-navy-900">
        {data.holder}
      </h1>
      <p className="text-sm text-fur-gray-600">completó el curso</p>
      <p className="text-xl font-semibold text-fur-navy-900">{data.course.title}</p>
      <p className="text-sm text-fur-gray-600">
        Nivel {levelLabel(data.course.level).toLowerCase()} · {formatDuration(data.course.durationMinutes)}
      </p>
      <dl className="mx-auto grid max-w-md gap-3 pt-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Emitido por</dt>
          <dd>{data.issuedBy}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Fecha</dt>
          <dd>{formatDate(data.completedAt)}</dd>
        </div>
      </dl>
      <p className="fur-code text-sm">{data.code}</p>
    </article>
  )
}
