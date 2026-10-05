import { ListChecks, LockKeyhole, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { PageHeader } from '@/components/layout/page-header'
import { DashboardView } from '@/components/maintenance/dashboard-view'
import { KanbanView } from '@/components/maintenance/kanban-view'
import { OrdersView } from '@/components/maintenance/orders-view'
import { PlansView } from '@/components/maintenance/plans-view'
import { WorkOrderFormDialog } from '@/components/maintenance/work-order-form-dialog'
import { WorkOrderSheet } from '@/components/maintenance/work-order-sheet'
import { RequisitionFormDialog } from '@/components/procurement/requisition-form-dialog'
import { RequisitionSheet } from '@/components/procurement/requisition-sheet'
import { RequisitionsView } from '@/components/procurement/requisitions-view'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlant } from '@/features/plant/plant-context'
import type { WorkOrderFilters } from '@/features/maintenance/use-maintenance'
import { useSuggestions, type LineInput, type Suggestion } from '@/features/procurement/use-procurement'
import { usePlantOutlet } from './plant-route'

const TABS = [
  ['dashboard', 'Dashboard', 'maintenance.read'],
  ['orders', 'Órdenes de trabajo', 'maintenance.read'],
  ['kanban', 'Kanban', 'maintenance.read'],
  ['plans', 'Planes', 'maintenance.read'],
  ['requisitions', 'Requisiciones', 'procurement.read'],
] as const
type Tab = (typeof TABS)[number][0]
const lowStockDefaults = (data: Suggestion[]) => ({
  justification: 'Reposición de ítems bajo mínimo',
  lines: data.map((d): LineInput => ({ itemId: d.itemId, description: d.description, quantity: d.suggestedQuantity, uom: d.uom })),
})

/** Parámetros que no son filtros de la lista: pestaña, paneles abiertos y datos de partida de una requisición nueva. */
const RESERVED = ['tab', 'wo', 'rq', 'new', 'forAsset', 'forWo', 'suggest']

/**
 * Mantenimiento (design.md §38) y sus requisiciones de compra. Información interna de la planta: cada pestaña
 * exige su permiso (maintenance.read / procurement.read) y sin ninguno de los dos la página no muestra nada.
 */
export function MaintenancePage() {
  const plant = usePlantOutlet()
  const { permissions } = usePlant()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)

  const available = TABS.filter(([, , permission]) => permissions.includes(permission))
  const tab: Tab = (available.find(([key]) => key === params.get('tab')) ?? available[0])?.[0] ?? 'dashboard'
  const openId = permissions.includes('maintenance.read') ? (params.get('wo') ?? undefined) : undefined
  const openRq = params.get('rq') ?? undefined
  const filters: WorkOrderFilters = Object.fromEntries([...params.entries()].filter(([k, v]) => v !== '' && !RESERVED.includes(k)))
  const [reqDefaults, setReqDefaults] = useState<{ assetId?: string; workOrderId?: string; justification?: string; lines?: LineInput[] } | null>(
    params.get('new') === '1' && permissions.includes('procurement.create') ? { assetId: params.get('forAsset') ?? undefined, workOrderId: params.get('forWo') ?? undefined } : null,
  )
  const suggestions = useSuggestions(plant.slug, false)

  const setParam = (updates: Record<string, string | undefined>, keepPage = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(updates)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )

  const openOrder = (id: string) => setParam({ wo: id }, true)

  async function fromLowStock() {
    const { data } = await suggestions.refetch()
    if (!data || data.length === 0) return void toast.info('No hay ítems bajo mínimo: nada que reponer.')
    setReqDefaults(lowStockDefaults(data))
  }

  // Enlace desde Inventario (?suggest=1): la requisición se arma sola con los ítems bajo mínimo, sin efectos ni estado extra.
  const wantsSuggestions = params.get('suggest') === '1' && permissions.includes('procurement.create')
  const linked = useSuggestions(plant.slug, wantsSuggestions)
  const linkedDefaults = wantsSuggestions && linked.data && linked.data.length > 0 ? lowStockDefaults(linked.data) : null
  const nothingToRestock = wantsSuggestions && linked.data?.length === 0

  if (available.length === 0) {
    return (
      <>
        <PageHeader title="Mantenimiento" />
        <EmptyState
          icon={LockKeyhole}
          title="Sin acceso a Mantenimiento"
          description="Las órdenes de trabajo y los planes son información interna de la planta. Solicita acceso a un administrador de planta."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Mantenimiento"
        description="Órdenes de trabajo, planes preventivos, indicadores y requisiciones de compra de la planta."
        actions={
          tab === 'requisitions' ? (
            <PermissionGate permission="procurement.create">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void fromLowStock()} disabled={suggestions.isFetching}>
                  <ListChecks /> Desde stock bajo mínimo
                </Button>
                <Button onClick={() => setReqDefaults({})}>
                  <Plus /> Nueva requisición
                </Button>
              </div>
            </PermissionGate>
          ) : (
            <PermissionGate permission="maintenance.create">
              <Button onClick={() => setCreating(true)}>
                <Plus /> Solicitar mantenimiento
              </Button>
            </PermissionGate>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(); n.set('tab', v); if (p.get('wo')) n.set('wo', p.get('wo')!); return n }, { replace: true })}>
        <div className="mb-4 overflow-x-auto">
          <TabsList className="w-max">
            {available.map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {tab === 'dashboard' && <DashboardView slug={plant.slug} onOpen={openOrder} />}
      {tab === 'orders' && <OrdersView slug={plant.slug} filters={filters} setFilters={setParam} onOpen={openOrder} onCreate={() => setCreating(true)} />}
      {tab === 'kanban' && <KanbanView slug={plant.slug} onOpen={openOrder} />}
      {tab === 'plans' && <PlansView slug={plant.slug} onOpenOrder={openOrder} />}
      {tab === 'requisitions' && <RequisitionsView slug={plant.slug} filters={filters} setFilters={setParam} onOpen={(id) => setParam({ rq: id }, true)} onCreate={() => setReqDefaults({})} />}

      {openId && <WorkOrderSheet slug={plant.slug} workOrderId={openId} onClose={() => setParam({ wo: undefined }, true)} />}
      {openRq && permissions.includes('procurement.read') && <RequisitionSheet slug={plant.slug} id={openRq} onClose={() => setParam({ rq: undefined }, true)} />}
      {nothingToRestock && (
        <p role="status" className="mb-4 rounded-lg border border-border bg-card p-3 text-sm">
          No hay ítems bajo mínimo: nada que reponer.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => setParam({ suggest: undefined }, true)}>
            Cerrar
          </button>
        </p>
      )}
      {(reqDefaults ?? linkedDefaults) && (
        <RequisitionFormDialog
          slug={plant.slug}
          defaults={reqDefaults ?? linkedDefaults ?? {}}
          onClose={() => {
            setReqDefaults(null)
            if (wantsSuggestions) setParam({ suggest: undefined }, true)
          }}
          onSaved={(r) => setParam({ tab: 'requisitions', rq: r.id, suggest: undefined }, true)}
        />
      )}
      {creating && <WorkOrderFormDialog open onOpenChange={setCreating} slug={plant.slug} onSaved={(wo) => openOrder(wo.id)} />}
    </>
  )
}
