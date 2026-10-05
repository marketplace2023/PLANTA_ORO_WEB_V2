import { Archive, Boxes, Hourglass, LockKeyhole, Pencil, SearchX, Upload, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { AssetFormDialog } from '@/components/assets/asset-form-dialog'
import { StockFlags } from '@/components/inventory/item-badges'
import { AssetCostsView } from '@/components/maintenance/asset-costs-view'
import { WorkOrderStatusBadge } from '@/components/maintenance/work-order-badges'
import { WorkOrderFormDialog } from '@/components/maintenance/work-order-form-dialog'
import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog'
import { DownloadButton } from '@/components/documents/document-detail-sheet'
import { AssetStatusBadge } from '@/components/industrial/asset-badges'
import { FurHeader } from '@/components/industrial/fur-header'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAssetFur, useDecommissionAsset, type AssetFur } from '@/features/assets/use-assets'
import { useAssetCosts } from '@/features/maintenance/use-maintenance'
import { ApiError } from '@/lib/api'
import { formatBytes, iconForMime, typeLabel } from '@/lib/documents'
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format'
import { usePlantOutlet } from './plant-route'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">{label}</dt>
      <dd className="text-sm">{children ?? '—'}</dd>
    </div>
  )
}

function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return <EmptyState icon={Hourglass} title={`${title}: próximamente`} description={`Este módulo se habilitará en ${phase} del plan del ecosistema.`} />
}

function KeyValueTable({ data }: { data: Record<string, unknown> | undefined }) {
  const entries = Object.entries(data ?? {})
  if (entries.length === 0) return <p className="text-sm text-fur-gray-600">Sin datos registrados.</p>
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([k, v]) => (
        <Fact key={k} label={k}>
          <span className="fur-code font-normal">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </Fact>
      ))}
    </dl>
  )
}

function Summary({ fur }: { fur: AssetFur }) {
  const { asset } = fur
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label="Código FUR">
        <span className="fur-code">{asset.furCode}</span>
      </Fact>
      <Fact label="Familia">{asset.family.name}</Fact>
      <Fact label="Tipo">{asset.type.name}</Fact>
      <Fact label="Modelo">{asset.model.name}</Fact>
      <Fact label="Fabricante">{asset.manufacturer ?? '—'}</Fact>
      {'serialNumber' in asset && <Fact label="Número de serie">{asset.serialNumber ?? '—'}</Fact>}
      <Fact label="Ubicación">{asset.location ?? '—'}</Fact>
      <Fact label="Instalación">{formatDate(asset.installationDate)}</Fact>
      <Fact label="Puesta en marcha">{formatDate(asset.commissionDate)}</Fact>
      <Fact label="Redes relacionadas">
        {asset.networks.length === 0 ? (
          '—'
        ) : (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {asset.networks.map((n) => (
              <span key={n.code} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: n.colorToken ? `var(--${n.colorToken})` : undefined }} aria-hidden />
                <span className="fur-code">{n.code}</span>
              </span>
            ))}
          </span>
        )}
      </Fact>
      <Fact label="Visibilidad">{asset.isPublic ? 'Pública' : 'Interna'}</Fact>
      <Fact label="Registrado">{formatDateTime(asset.createdAt)}</Fact>
    </dl>
  )
}

function History({ fur }: { fur: AssetFur }) {
  if (fur.history.length === 0) {
    return <p className="text-sm text-fur-gray-600">El historial solo está disponible para el personal de la planta.</p>
  }
  return (
    <ol className="space-y-4 border-l-2 border-border pl-5">
      {fur.history.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full border-2 border-card bg-fur-navy-800" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {h.oldStatus ? (
              <>
                <AssetStatusBadge status={h.oldStatus} /> <span aria-label="cambió a">→</span>
              </>
            ) : (
              <span className="text-fur-gray-600">Alta:</span>
            )}
            <AssetStatusBadge status={h.newStatus} />
          </div>
          {h.reason && <p className="mt-1 text-sm">{h.reason}</p>}
          <p className="mt-0.5 text-xs text-fur-gray-600">
            {formatDateTime(h.changedAt)}
            {h.changedBy && ` · ${h.changedBy}`}
          </p>
        </li>
      ))}
    </ol>
  )
}

/** Documentos vinculados al activo (los de la planta que lo referencian), con descarga directa. */
function DocumentsTab({ fur, slug }: { fur: AssetFur; slug: string }) {
  const [uploading, setUploading] = useState(false)
  const docs = fur.documents
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fur-gray-600">
          {docs.length === 0 ? 'Este activo no tiene documentos vinculados.' : `${docs.length} documento(s) vinculado(s)`}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/plants/${slug}/documents?assetId=${fur.asset.id}`}>Ver en Documentos</Link>
          </Button>
          <PermissionGate permission="document.upload">
            <Button size="sm" onClick={() => setUploading(true)}>
              <Upload /> Subir documento
            </Button>
          </PermissionGate>
        </div>
      </div>
      {docs.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((d) => {
            const Icon = iconForMime(d.file.mimeType)
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                <Icon className="size-5 shrink-0 text-fur-navy-800" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Link to={`/plants/${slug}/documents?doc=${d.id}`} className="font-medium text-fur-navy-900 underline-offset-2 hover:underline">
                    {d.title}
                  </Link>
                  <p className="text-xs text-fur-gray-600">
                    {typeLabel(d.documentType)} · <span className="fur-code">v{d.currentVersion}</span> · {formatBytes(d.file.sizeBytes)}
                  </p>
                </div>
                <DownloadButton slug={slug} id={d.id} fileName={d.file.originalName} variant="ghost" />
              </li>
            )
          })}
        </ul>
      )}
      {uploading && <DocumentUploadDialog open onOpenChange={setUploading} plantSlug={slug} defaultAssetId={fur.asset.id} />}
    </div>
  )
}

/** Mantenimiento del activo: último/próximo, órdenes abiertas y recientes. Solo con maintenance.read. */
function MaintenanceTab({ fur, slug }: { fur: AssetFur; slug: string }) {
  const [requesting, setRequesting] = useState(false)
  const m = fur.maintenance
  const hasAccess = m.openWorkOrders !== undefined

  if (!hasAccess) {
    return <EmptyState icon={LockKeyhole} title="Sin acceso a Mantenimiento" description="El historial de mantenimiento es información interna de la planta." />
  }

  return (
    <div className="space-y-5">
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Último mantenimiento">{formatDate(m.lastMaintenanceAt)}</Fact>
        <Fact label="Próximo mantenimiento">{formatDate(m.nextMaintenanceAt)}</Fact>
        <Fact label="Órdenes abiertas">{m.openWorkOrders}</Fact>
        <Fact label="Órdenes atrasadas">
          <span className={m.overdueWorkOrders ? 'font-semibold text-fur-red-500' : undefined}>{m.overdueWorkOrders}</span>
        </Fact>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-fur-navy-900">
          <Wrench className="size-4" /> Órdenes recientes
        </h3>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/plants/${slug}/maintenance?tab=orders&assetId=${fur.asset.id}`}>Ver todas</Link>
          </Button>
          <PermissionGate permission="maintenance.create">
            <Button size="sm" onClick={() => setRequesting(true)}>
              Solicitar mantenimiento
            </Button>
          </PermissionGate>
        </div>
      </div>

      {(m.recent ?? []).length === 0 ? (
        <p className="text-sm text-fur-gray-600">Este activo no tiene órdenes de trabajo.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {m.recent!.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 p-3">
              <Link to={`/plants/${slug}/maintenance?tab=orders&wo=${o.id}`} className="fur-code text-fur-navy-900 underline-offset-2 hover:underline">
                {o.code}
              </Link>
              <span className="min-w-0 flex-1 truncate">{o.title}</span>
              <WorkOrderStatusBadge status={o.status} />
              {o.overdue && <span className="text-xs text-fur-red-500">Atrasada</span>}
            </li>
          ))}
        </ul>
      )}

      {requesting && <WorkOrderFormDialog open onOpenChange={setRequesting} slug={slug} defaultAssetId={fur.asset.id} />}
    </div>
  )
}

/** Inventario del activo: repuestos del mismo modelo del catálogo y lo que ya consumió. Solo con inventory.read. */
function InventoryTab({ fur, slug }: { fur: AssetFur; slug: string }) {
  const inv = fur.inventory
  if (inv.compatibleItems === undefined) {
    return <EmptyState icon={LockKeyhole} title="Sin acceso al Inventario" description="El stock de repuestos es información interna de la planta." />
  }
  const currency = fur.maintenance.currency ?? 'USD'
  const used = inv.partsUsed ?? []

  return (
    <div className="space-y-6">
      <p className="text-sm text-fur-gray-600">
        Se muestran los ítems de inventario vinculados al modelo de este activo. La lista de materiales (BOM) detallada por equipo se habilitará más adelante.
      </p>

      <section aria-labelledby="compat-title">
        <h3 id="compat-title" className="mb-2 flex items-center gap-2 text-base font-semibold text-fur-navy-900">
          <Boxes className="size-4" /> Repuestos compatibles
        </h3>
        {inv.compatibleItems.length === 0 ? (
          <p className="text-sm text-fur-gray-600">No hay ítems de inventario vinculados al modelo de este activo.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {inv.compatibleItems.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                <Link to={`/plants/${slug}/inventory?tab=stock&item=${i.id}`} className="fur-code text-fur-navy-900 underline-offset-2 hover:underline">
                  {i.sku}
                </Link>
                <span className="min-w-0 flex-1 truncate">{i.name}</span>
                <StockFlags belowMin={i.belowMin} isCritical={i.isCritical} />
                <span className={i.belowMin ? 'text-sm font-semibold text-fur-red-500' : 'text-sm'}>
                  {formatQuantity(i.onHand)} / mín. {formatQuantity(i.minStock)} {i.uom}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="used-title">
        <h3 id="used-title" className="mb-2 text-base font-semibold text-fur-navy-900">
          Repuestos consumidos en sus órdenes
        </h3>
        {used.length === 0 ? (
          <p className="text-sm text-fur-gray-600">Este activo aún no ha consumido repuestos.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {used.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="fur-code">{u.sku}</span>
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="text-sm">
                  {formatQuantity(u.quantity)} {u.uom}
                </span>
                <span className="text-sm text-fur-gray-600">{formatMoney(u.cost, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Costos del activo: repuestos de inventario + mano de obra, equipos, transporte y servicios de sus órdenes. */
function CostsTab({ fur }: { fur: AssetFur }) {
  const allowed = fur.maintenance.partsCost !== undefined // el backend omite el bloque si no tienes maintenance.read
  const costs = useAssetCosts(fur.plant.slug, fur.asset.id, allowed)
  if (!allowed) {
    return <EmptyState icon={LockKeyhole} title="Sin acceso a Costos" description="Los costos de mantenimiento son información interna de la planta." />
  }
  if (costs.isError) return <ErrorState onRetry={() => void costs.refetch()} />
  if (costs.isLoading || !costs.data) return <Skeleton className="h-48" aria-busy="true" aria-label="Cargando costos" />
  return <AssetCostsView slug={fur.plant.slug} data={costs.data} />
}

/** Baja lógica: el activo y su historial se conservan. */
function DecommissionDialog({ slug, assetId, tag, onClose, onDone }: { slug: string; assetId: string; tag: string; onClose: () => void; onDone: () => void }) {
  const decommission = useDecommissionAsset(slug, assetId)
  const [error, setError] = useState<string>()

  async function confirm() {
    setError(undefined)
    try {
      await decommission.mutateAsync()
      toast.success(`${tag} dado de baja`)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'No tienes permiso para dar de baja activos.' : 'No se pudo dar de baja el activo.')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dar de baja {tag}?</DialogTitle>
          <DialogDescription>
            El activo dejará de aparecer en los listados y no podrá modificarse. Su historial se conserva.
          </DialogDescription>
        </DialogHeader>
        <div role="alert" aria-live="polite">
          {error && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={decommission.isPending}>
            {decommission.isPending ? 'Procesando…' : 'Dar de baja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AssetFurPage() {
  const plant = usePlantOutlet()
  const { assetId } = useParams()
  const navigate = useNavigate()
  const { data: fur, isLoading, error, refetch } = useAssetFur(plant.slug, assetId)
  const [editing, setEditing] = useState(false)
  const [decommissioning, setDecommissioning] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-80" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={SearchX}
        title="Activo no encontrado"
        description="El activo no existe, o no es visible para tu cuenta."
        action={
          <Button asChild variant="secondary">
            <Link to={`/plants/${plant.slug}/assets`}>Volver a Activos Físicos</Link>
          </Button>
        }
      />
    )
  }
  if (error || !fur) return <ErrorState onRetry={() => void refetch()} />

  const { asset } = fur
  const decommissioned = asset.status === 'DECOMMISSIONED'

  return (
    <>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/plants/${plant.slug}/dashboard`}>Planta {plant.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/plants/${plant.slug}/assets`}>Activos</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {fur.stage && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={`/plants/${plant.slug}/assets?stage=${fur.stage.code}`}>{fur.stage.name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="fur-code">{asset.tag}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <FurHeader
        fur={fur}
        actions={
          !decommissioned && (
            <>
              <PermissionGate permission="asset.update">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil /> Editar
                </Button>
              </PermissionGate>
              <PermissionGate permission="asset.delete">
                <Button variant="ghost" onClick={() => setDecommissioning(true)}>
                  <Archive /> Dar de baja
                </Button>
              </PermissionGate>
            </>
          )
        }
      />

      <Tabs defaultValue="summary">
        <div className="mb-4 overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="summary">Resumen</TabsTrigger>
            <TabsTrigger value="specs">Datos técnicos</TabsTrigger>
            <TabsTrigger value="maintenance">Mantenimiento</TabsTrigger>
            <TabsTrigger value="inventory">Inventario / BOM</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
            <TabsTrigger value="telemetry">Telemetría</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="costs">Costos</TabsTrigger>
            <TabsTrigger value="kpis">KPIs</TabsTrigger>
          </TabsList>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <TabsContent value="summary">
            <Summary fur={fur} />
          </TabsContent>
          <TabsContent value="specs" className="space-y-6">
            <section>
              <h2 className="mb-3 text-lg text-fur-navy-900">Especificaciones del modelo</h2>
              <KeyValueTable data={asset.specifications} />
            </section>
            {asset.technicalData && (
              <section>
                <h2 className="mb-3 text-lg text-fur-navy-900">Datos técnicos</h2>
                <KeyValueTable data={asset.technicalData} />
              </section>
            )}
          </TabsContent>
          <TabsContent value="maintenance">
            <MaintenanceTab fur={fur} slug={plant.slug} />
          </TabsContent>
          <TabsContent value="inventory">
            <InventoryTab fur={fur} slug={plant.slug} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab fur={fur} slug={plant.slug} />
          </TabsContent>
          <TabsContent value="telemetry">
            <ComingSoon title="Telemetría" phase="la Fase 3" />
          </TabsContent>
          <TabsContent value="history">
            <History fur={fur} />
          </TabsContent>
          <TabsContent value="costs">
            <CostsTab fur={fur} />
          </TabsContent>
          <TabsContent value="kpis">
            <ComingSoon title="KPIs" phase="la Fase 3" />
          </TabsContent>
        </div>
      </Tabs>

      {editing && <AssetFormDialog open onOpenChange={setEditing} plantSlug={plant.slug} asset={asset} />}
      {decommissioning && (
        <DecommissionDialog
          slug={plant.slug}
          assetId={asset.id}
          tag={asset.tag}
          onClose={() => setDecommissioning(false)}
          onDone={() => navigate(`/plants/${plant.slug}/assets`)}
        />
      )}
    </>
  )
}
