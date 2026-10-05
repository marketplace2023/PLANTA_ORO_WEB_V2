import { LockKeyhole, Pencil, Plus, Power, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { MembersPanel } from '@/components/organizations/members-panel'
import { AdminControlsDialog, EditProfileDialog } from '@/components/organizations/org-profile-dialogs'
import { Rating, StageTags, VerifiedBadge } from '@/components/organizations/org-bits'
import { Certs } from '@/components/organizations/provider-card'
import { ServiceFormDialog } from '@/components/organizations/service-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { useContractor, useUpdateService, type ContractorService } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'
import { contractorAvailabilityLabel, ORG_STATUS_LABELS, specialtyLabel } from '@/lib/organizations'
import { useUrlFilters } from '@/lib/use-url-filters'

const TABS = [
  ['services', 'Servicios'],
  ['profile', 'Perfil'],
  ['members', 'Miembros'],
] as const

function ServiceItem({ contractorId, service, onEdit }: { contractorId: string; service: ContractorService; onEdit: (s: ContractorService) => void }) {
  const update = useUpdateService(contractorId)
  const active = service.status === 'ACTIVE'
  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-fur-navy-900">{service.name}</h3>
        <Badge variant="secondary">{specialtyLabel(service.serviceType)}</Badge>
        {!active && <Badge variant="outline">Inactivo</Badge>}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" aria-label={`Editar ${service.name}`} onClick={() => onEdit(service)}>
            <Pencil /> Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${active ? 'Desactivar' : 'Activar'} ${service.name}`}
            disabled={update.isPending}
            onClick={() =>
              update.mutateAsync({ id: service.id, status: active ? 'INACTIVE' : 'ACTIVE' }).then(
                () => toast.success(active ? 'Servicio desactivado' : 'Servicio activado'),
                (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar'),
              )
            }
          >
            <Power /> {active ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      </div>
      {service.description && <p className="text-sm">{service.description}</p>}
      <StageTags stages={service.stages} max={8} />
    </li>
  )
}

/** Panel del contratista (design.md §25): servicios, disponibilidad y miembros. */
export function ContractorManagePage() {
  const { id } = useParams()
  const { user, status } = useAuth()
  const { params, setParam } = useUrlFilters()
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'services') as (typeof TABS)[number][0]
  const contractor = useContractor(id)
  const [editing, setEditing] = useState<ContractorService | 'new' | null>(null)
  const [dialog, setDialog] = useState<'profile' | 'admin' | null>(null)

  if (status !== 'loading' && !user) {
    return (
      <>
        <PageHeader title="Mi organización" />
        <EmptyState icon={LockKeyhole} title="Inicia sesión" description="Necesitas una sesión para gestionar tu organización." action={<Button asChild><Link to="/login">Iniciar sesión</Link></Button>} />
      </>
    )
  }
  if (contractor.isLoading || status === 'loading') return <Skeleton className="h-64" aria-busy="true" />
  if (contractor.error instanceof ApiError && contractor.error.status === 404) {
    return <EmptyState icon={LockKeyhole} title="Contratista no encontrado" description="No existe o no tienes acceso a él." action={<Button asChild variant="secondary"><Link to="/professionals">Ver servicios profesionales</Link></Button>} />
  }
  if (contractor.isError || !contractor.data) return <ErrorState onRetry={() => void contractor.refetch()} />
  const c = contractor.data
  if (!c.canManage) {
    return <EmptyState icon={LockKeyhole} title="Sin acceso a la gestión" description="Solo los miembros de la organización y el administrador del ecosistema pueden gestionarla." action={<Button asChild variant="secondary"><Link to={`/professionals?contractor=${c.id}`}>Ver ficha pública</Link></Button>} />
  }
  const isAdmin = !!user?.isGlobalAdmin

  return (
    <>
      <PageHeader
        title={c.organizationName}
        description="Gestión de tu organización como contratista."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadge verified={c.verified} />
            <Badge variant="outline">{ORG_STATUS_LABELS[c.status]}</Badge>
            <Badge variant="outline">{contractorAvailabilityLabel(c.availability)}</Badge>
            <Button asChild variant="secondary">
              <Link to={`/professionals?contractor=${c.id}`}>Ver ficha pública</Link>
            </Button>
          </div>
        }
      />
      {c.status !== 'ACTIVE' && (
        <p role="status" className="mb-4 rounded-lg border border-fur-orange-500 bg-fur-orange-500/10 p-3 text-sm">
          {c.status === 'PENDING' ? 'Tu solicitud está pendiente de aprobación: todavía no apareces en el ecosistema ni puedes publicar servicios.' : 'La organización está suspendida: no es visible y no se puede editar. Contacta al administrador del ecosistema.'}
        </p>
      )}

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

      {tab === 'services' && (
        <>
          <div className="mb-4 flex justify-end">
            <Button disabled={c.status !== 'ACTIVE'} onClick={() => setEditing('new')} title={c.status === 'ACTIVE' ? undefined : 'Disponible cuando la organización esté activa'}>
              <Plus /> Nuevo servicio
            </Button>
          </div>
          {c.services.length === 0 ? (
            <EmptyState icon={Pencil} title="Aún no tienes servicios" description="Publica los servicios que prestas y las etapas del proceso que atiendes." />
          ) : (
            <ul className="space-y-3">
              {c.services.map((s) => (
                <ServiceItem key={s.id} contractorId={c.id} service={s} onEdit={setEditing} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'profile' && (
        <div className="space-y-5 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog('profile')} disabled={c.status === 'SUSPENDED' && !isAdmin}>
              <Pencil /> Editar perfil y disponibilidad
            </Button>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setDialog('admin')}>
                <ShieldCheck /> Administrar (estado, verificación, rating)
              </Button>
            )}
          </div>
          {c.description && <p className="text-sm whitespace-pre-wrap">{c.description}</p>}
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Identificación tributaria</dt>
              <dd className="text-sm">{c.taxId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Rating</dt>
              <dd><Rating rating={c.rating} /></dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Correo de contacto</dt>
              <dd className="text-sm">{c.contactEmail ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Disponibilidad</dt>
              <dd className="text-sm">{contractorAvailabilityLabel(c.availability)}</dd>
            </div>
          </dl>
          <Certs items={c.certifications} />
        </div>
      )}

      {tab === 'members' && <MembersPanel kind="contractors" id={c.id} canEdit={c.myRole === 'OWNER' || isAdmin} />}

      {editing && <ServiceFormDialog contractorId={c.id} service={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {dialog === 'profile' && <EditProfileDialog kind="contractor" org={c} onClose={() => setDialog(null)} />}
      {dialog === 'admin' && <AdminControlsDialog kind="contractor" org={c} onClose={() => setDialog(null)} />}
    </>
  )
}
