import { Archive, Eye, LockKeyhole, Pencil, Plus, ShieldCheck, Star, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { KpiCard } from '@/components/industrial/kpi-card'
import { PageHeader } from '@/components/layout/page-header'
import { CoverageDialog } from '@/components/organizations/coverage-dialog'
import { ListingFormDialog } from '@/components/organizations/listing-form-dialog'
import { MembersPanel } from '@/components/organizations/members-panel'
import { ProviderRfqsPanel } from '@/components/organizations/provider-rfqs-panel'
import { AdminControlsDialog, EditProfileDialog } from '@/components/organizations/org-profile-dialogs'
import { Certs } from '@/components/organizations/provider-card'
import { Rating, StageTags, VerifiedBadge } from '@/components/organizations/org-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { useProvider, useProviderDashboard, useProviderListings, useUpdateListing, type Listing } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'
import { LISTING_STATUS_LABELS, ORG_STATUS_LABELS, priceText } from '@/lib/organizations'
import { useUrlFilters } from '@/lib/use-url-filters'

const TABS = [
  ['dashboard', 'Panel'],
  ['products', 'Productos'],
  ['rfqs', 'Cotizaciones'],
  ['profile', 'Perfil'],
  ['members', 'Miembros'],
] as const

function Statusbar({ status }: { status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' }) {
  if (status === 'ACTIVE') return null
  return (
    <p role="status" className="mb-4 rounded-lg border border-fur-orange-500 bg-fur-orange-500/10 p-3 text-sm">
      {status === 'PENDING' ? 'Tu solicitud está pendiente de aprobación: todavía no apareces en el ecosistema ni puedes publicar productos.' : 'La organización está suspendida: no es visible y no se puede editar. Contacta al administrador del ecosistema.'}
    </p>
  )
}

function ListingRow({ providerId, listing, isAdmin, onEdit }: { providerId: string; listing: Listing; isAdmin: boolean; onEdit: (l: Listing) => void }) {
  const update = useUpdateListing(providerId)
  const run = (patch: Parameters<typeof update.mutateAsync>[0], ok: string) =>
    update.mutateAsync(patch).then(
      () => toast.success(ok),
      (err) => toast.error(err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo actualizar'),
    )
  const draftLike = listing.status !== 'ACTIVE'
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{listing.title}</div>
        <div className="text-xs text-fur-gray-600">{listing.family.name}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap">{priceText(listing.price, listing.currency)}</TableCell>
      <TableCell>
        <Badge variant={listing.status === 'ACTIVE' ? 'default' : 'outline'}>{LISTING_STATUS_LABELS[listing.status]}</Badge>
        {listing.isFeatured && <Badge className="ml-1.5">Destacado</Badge>}
      </TableCell>
      <TableCell>
        <StageTags stages={listing.stages} max={2} />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" aria-label={`Editar ${listing.title}`} onClick={() => onEdit(listing)}>
          <Pencil /> Editar
        </Button>
        {draftLike ? (
          <Button size="sm" variant="ghost" aria-label={`Publicar ${listing.title}`} disabled={update.isPending} onClick={() => void run({ id: listing.id, status: 'ACTIVE' }, 'Producto publicado')}>
            <Eye /> Publicar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" aria-label={`Pasar a borrador ${listing.title}`} disabled={update.isPending} onClick={() => void run({ id: listing.id, status: 'DRAFT' }, 'Producto pasado a borrador')}>
            <Undo2 /> Despublicar
          </Button>
        )}
        {listing.status !== 'ARCHIVED' && (
          <Button size="sm" variant="ghost" aria-label={`Archivar ${listing.title}`} disabled={update.isPending} onClick={() => void run({ id: listing.id, status: 'ARCHIVED' }, 'Producto archivado')}>
            <Archive /> Archivar
          </Button>
        )}
        {isAdmin && (
          <Button size="sm" variant="ghost" aria-label={`${listing.isFeatured ? 'Quitar destacado de' : 'Destacar'} ${listing.title}`} disabled={update.isPending} onClick={() => void run({ id: listing.id, isFeatured: !listing.isFeatured }, listing.isFeatured ? 'Ya no es destacado' : 'Producto destacado')}>
            <Star /> {listing.isFeatured ? 'Quitar destacado' : 'Destacar'}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

/** Panel del proveedor (design.md §24): productos, perfil y miembros de su organización. */
export function ProviderManagePage() {
  const { id } = useParams()
  const { user, status } = useAuth()
  const { params, setParam } = useUrlFilters()
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'dashboard') as (typeof TABS)[number][0]
  const provider = useProvider(id)
  const dashboard = useProviderDashboard(provider.data?.canManage ? id : undefined)
  const [listingStatus, setListingStatus] = useState<string>('ALL')
  const listings = useProviderListings(provider.data?.canManage && tab === 'products' ? id : undefined, { status: listingStatus === 'ALL' ? undefined : listingStatus }, 50)
  const [editing, setEditing] = useState<Listing | 'new' | null>(null)
  const [dialog, setDialog] = useState<'profile' | 'coverage' | 'admin' | null>(null)

  if (status !== 'loading' && !user) {
    return (
      <>
        <PageHeader title="Mi organización" />
        <EmptyState icon={LockKeyhole} title="Inicia sesión" description="Necesitas una sesión para gestionar tu organización." action={<Button asChild><Link to="/login">Iniciar sesión</Link></Button>} />
      </>
    )
  }
  if (provider.isLoading || status === 'loading') return <Skeleton className="h-64" aria-busy="true" />
  if (provider.error instanceof ApiError && provider.error.status === 404) {
    return <EmptyState icon={LockKeyhole} title="Proveedor no encontrado" description="No existe o no tienes acceso a él." action={<Button asChild variant="secondary"><Link to="/providers">Ver proveedores</Link></Button>} />
  }
  if (provider.isError || !provider.data) return <ErrorState onRetry={() => void provider.refetch()} />
  const p = provider.data
  if (!p.canManage) {
    return <EmptyState icon={LockKeyhole} title="Sin acceso a la gestión" description="Solo los miembros de la organización y el administrador del ecosistema pueden gestionarla." action={<Button asChild variant="secondary"><Link to={`/providers?provider=${p.id}`}>Ver ficha pública</Link></Button>} />
  }
  const isAdmin = !!user?.isGlobalAdmin
  const canPublish = p.status === 'ACTIVE'

  return (
    <>
      <PageHeader
        title={p.organizationName}
        description="Gestión de tu organización como proveedor."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadge verified={p.verified} />
            <Badge variant="outline">{ORG_STATUS_LABELS[p.status]}</Badge>
            <Button asChild variant="secondary">
              <Link to={`/providers?provider=${p.id}`}>Ver ficha pública</Link>
            </Button>
          </div>
        }
      />
      <Statusbar status={p.status} />

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

      {tab === 'dashboard' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <KpiCard title="Productos publicados" value={dashboard.data?.listingsActive ?? null} icon={Eye} />
          <KpiCard title="Borradores" value={dashboard.data?.listingsDraft ?? null} icon={Pencil} />
          <KpiCard title="Archivados" value={dashboard.data?.listingsArchived ?? null} icon={Archive} />
          <KpiCard title="Destacados" value={dashboard.data?.featured ?? null} icon={Star} />
          <KpiCard title="Precios «a cotizar»" value={dashboard.data?.onRequestPricing ?? null} icon={ShieldCheck} />
          <KpiCard title="Pedidos" value={null} icon={ShieldCheck} hint="Llegan con las órdenes de compra (próximamente)" />
        </div>
      )}

      {tab === 'products' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="group" aria-label="Filtrar por estado">
              {['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED'].map((s) => (
                <Button key={s} size="sm" variant={listingStatus === s ? 'default' : 'secondary'} onClick={() => setListingStatus(s)}>
                  {s === 'ALL' ? 'Todos' : LISTING_STATUS_LABELS[s as keyof typeof LISTING_STATUS_LABELS]}
                </Button>
              ))}
            </div>
            <Button disabled={!canPublish} onClick={() => setEditing('new')} title={canPublish ? undefined : 'Disponible cuando la organización esté activa'}>
              <Plus /> Nuevo producto
            </Button>
          </div>
          {listings.isError ? (
            <ErrorState onRetry={() => void listings.refetch()} />
          ) : listings.isLoading || !listings.data ? (
            <Skeleton className="h-40" aria-busy="true" />
          ) : listings.data.total === 0 ? (
            <EmptyState icon={Eye} title="Aún no tienes productos" description="Crea un producto como borrador, asígnale etapas y publícalo en el marketplace." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Etapas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listings.data.items.map((l) => (
                    <ListingRow key={l.id} providerId={p.id} listing={l} isAdmin={isAdmin} onEdit={setEditing} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {tab === 'rfqs' && (canPublish ? <ProviderRfqsPanel providerId={p.id} /> : <EmptyState icon={LockKeyhole} title="Cotizaciones no disponibles" description="Podrás recibir y responder solicitudes de cotización cuando la organización esté activa." />)}

      {tab === 'profile' && (
        <div className="space-y-5 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog('profile')} disabled={p.status === 'SUSPENDED' && !isAdmin}>
              <Pencil /> Editar perfil
            </Button>
            <Button variant="secondary" onClick={() => setDialog('coverage')} disabled={p.status === 'SUSPENDED' && !isAdmin}>
              Etapas y familias
            </Button>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setDialog('admin')}>
                <ShieldCheck /> Administrar (estado, verificación, rating)
              </Button>
            )}
          </div>
          {p.description && <p className="text-sm whitespace-pre-wrap">{p.description}</p>}
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Identificación tributaria</dt>
              <dd className="text-sm">{p.taxId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Rating</dt>
              <dd><Rating rating={p.rating} /></dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Correo de contacto</dt>
              <dd className="text-sm">{p.contactEmail ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Sitio web</dt>
              <dd className="text-sm">{p.website ?? '—'}</dd>
            </div>
          </dl>
          <Certs items={p.certifications} />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-fur-navy-900">Etapas que atiendes</h3>
            <StageTags stages={p.stages} max={20} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-fur-navy-900">Familias</h3>
            <p className="text-sm">{p.families.length ? p.families.map((f) => f.name).join(', ') : '—'}</p>
          </div>
        </div>
      )}

      {tab === 'members' && <MembersPanel kind="providers" id={p.id} canEdit={p.myRole === 'OWNER' || isAdmin} />}

      {editing && <ListingFormDialog providerId={p.id} listing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {dialog === 'profile' && <EditProfileDialog kind="provider" org={p} onClose={() => setDialog(null)} />}
      {dialog === 'coverage' && <CoverageDialog provider={p} onClose={() => setDialog(null)} />}
      {dialog === 'admin' && <AdminControlsDialog kind="provider" org={p} onClose={() => setDialog(null)} />}
    </>
  )
}
