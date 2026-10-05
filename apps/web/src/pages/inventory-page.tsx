import { LockKeyhole, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { DashboardView } from '@/components/inventory/dashboard-view'
import { ItemFormDialog } from '@/components/inventory/item-form-dialog'
import { ItemSheet } from '@/components/inventory/item-sheet'
import { MovementsView } from '@/components/inventory/movements-view'
import { StockView } from '@/components/inventory/stock-view'
import { WarehousesView } from '@/components/inventory/warehouses-view'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useInventoryDashboard } from '@/features/inventory/use-inventory'
import { usePlant } from '@/features/plant/plant-context'
import { usePlantOutlet } from './plant-route'

const TABS = [
  ['dashboard', 'Dashboard'],
  ['stock', 'Stock'],
  ['movements', 'Movimientos'],
  ['warehouses', 'Almacenes y ubicaciones'],
] as const
type Tab = (typeof TABS)[number][0]

/** WMS / Inventario de la planta (design.md §27). Es información interna: sin inventory.read no se muestra. */
export function InventoryPage() {
  const plant = usePlantOutlet()
  const { permissions } = usePlant()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const allowed = permissions.includes('inventory.read')
  const dashboard = useInventoryDashboard(plant.slug, allowed)

  const tab: Tab = TABS.find(([key]) => key === params.get('tab'))?.[0] ?? 'dashboard'
  const openId = params.get('item') ?? undefined
  const filters = Object.fromEntries([...params.entries()].filter(([k, v]) => v !== '' && !['tab', 'item'].includes(k)))

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
  const openItem = (id: string) => setParam({ item: id }, true)

  if (!allowed) {
    return (
      <>
        <PageHeader title="WMS / Inventario" />
        <EmptyState
          icon={LockKeyhole}
          title="Sin acceso al inventario"
          description="El stock, los almacenes y los movimientos son información interna de la planta. Solicita acceso a un administrador de planta."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="WMS / Inventario"
        description="Repuestos, consumibles y herramientas: existencias por ubicación, movimientos y alertas de stock."
        actions={
          <PermissionGate permission="inventory.create">
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nuevo ítem
            </Button>
          </PermissionGate>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(); n.set('tab', v); if (p.get('item')) n.set('item', p.get('item')!); return n }, { replace: true })}>
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

      {tab === 'dashboard' && <DashboardView slug={plant.slug} onOpenItem={openItem} />}
      {tab === 'stock' && <StockView slug={plant.slug} currency={dashboard.data?.currency ?? 'USD'} filters={filters} setFilters={setParam} onOpen={openItem} onCreate={() => setCreating(true)} />}
      {tab === 'movements' && <MovementsView slug={plant.slug} filters={filters} setFilters={setParam} onOpenItem={openItem} />}
      {tab === 'warehouses' && <WarehousesView slug={plant.slug} />}

      {openId && <ItemSheet slug={plant.slug} itemId={openId} currency={dashboard.data?.currency ?? 'USD'} onClose={() => setParam({ item: undefined }, true)} />}
      {creating && <ItemFormDialog slug={plant.slug} onClose={() => setCreating(false)} onSaved={openItem} />}
    </>
  )
}
