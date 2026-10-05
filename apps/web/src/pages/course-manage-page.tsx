import { LockKeyhole, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { CourseFormDialog } from '@/components/lms/course-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { useManagedCourses, type OwnerType } from '@/features/lms/use-lms'
import { ApiError } from '@/lib/api'
import { COURSE_STATUS_LABELS, formatDuration, levelLabel } from '@/lib/lms'
import { useUrlFilters } from '@/lib/use-url-filters'

/** `owner=ecosystem` | `provider:<id>` | `contractor:<id>` → propietario de los cursos a gestionar. */
function parseOwner(value: string | null): { ownerType: OwnerType; ownerId?: string } | null {
  if (value === 'ecosystem') return { ownerType: 'ECOSYSTEM' }
  const m = /^(provider|contractor):([0-9a-f-]{36})$/i.exec(value ?? '')
  return m ? { ownerType: m[1].toLowerCase() === 'provider' ? 'PROVIDER' : 'CONTRACTOR', ownerId: m[2] } : null
}

/** Cursos de una organización (o del ecosistema): todos los estados, con inscritos, y alta de cursos nuevos. */
export function CourseManagePage() {
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const { params } = useUrlFilters()
  const owner = parseOwner(params.get('owner'))
  const courses = useManagedCourses(user ? owner : null)
  const [creating, setCreating] = useState(false)

  if (status !== 'loading' && !user) {
    return (
      <>
        <PageHeader title="Gestión de cursos" />
        <EmptyState icon={LockKeyhole} title="Inicia sesión" description="Necesitas una sesión para gestionar cursos." action={<Button asChild><Link to="/login">Iniciar sesión</Link></Button>} />
      </>
    )
  }
  if (!owner) return <EmptyState icon={LockKeyhole} title="Organización no indicada" description="Entra desde Cursos → el acceso de tu organización." action={<Button asChild variant="secondary"><Link to="/courses">Ver cursos</Link></Button>} />
  if (courses.error instanceof ApiError && courses.error.status === 403) {
    return <EmptyState icon={LockKeyhole} title="Sin acceso" description="Solo los miembros de la organización y el administrador del ecosistema gestionan sus cursos." action={<Button asChild variant="secondary"><Link to="/courses">Ver cursos</Link></Button>} />
  }
  if (courses.isError) return <ErrorState onRetry={() => void courses.refetch()} />

  const items = courses.data?.items ?? []
  return (
    <>
      <PageHeader
        title="Gestión de cursos"
        description={owner.ownerType === 'ECOSYSTEM' ? 'Cursos del Ecosistema FUR.' : 'Cursos de tu organización.'}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo curso
          </Button>
        }
      />
      {courses.isLoading ? (
        <Skeleton className="h-40" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState icon={Plus} title="Aún no hay cursos" description="Crea un curso, agrégale lecciones y etapas, y publícalo." action={<Button onClick={() => setCreating(true)}>Nuevo curso</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Curso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead className="text-right">Lecciones</TableHead>
                <TableHead className="text-right">Duración</TableHead>
                <TableHead className="text-right">Inscritos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link to={`/courses/${c.id}/edit`} className="underline-offset-2 hover:underline">
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === 'PUBLISHED' ? 'default' : 'outline'}>{COURSE_STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  <TableCell>{levelLabel(c.level)}</TableCell>
                  <TableCell className="text-right">{c.lessonCount}</TableCell>
                  <TableCell className="text-right">{formatDuration(c.durationMinutes)}</TableCell>
                  <TableCell className="text-right">{c.enrolledCount ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {creating && <CourseFormDialog owner={owner} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/courses/${c.id}/edit`)} />}
    </>
  )
}
