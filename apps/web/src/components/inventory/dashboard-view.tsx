import { AlertTriangle, ArrowDownUp, Boxes, Hammer, PackageCheck, Siren, Wallet, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PermissionGate } from '@/components/base/permission-gate'
import { ErrorState } from '@/components/base/error-state'
import { KpiCard } from '@/components/industrial/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useInventoryDashboard, type InventoryDashboard } from '@/features/inventory/use-inventory'
import { formatMoney, formatQuantity } from '@/lib/format'
import { StockFlags } from './item-badges'
import { MovementsTable } from './movements-table'

function Content({ d, slug, onOpenItem }: { d: InventoryDashboard; slug: string; onOpenItem: (id: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard title="Valor del stock" value={formatMoney(d.stockValue, d.currency)} icon={Wallet} hint="Existencias × costo promedio" />
        <KpiCard title="Ítems activos" value={d.itemCount} icon={Boxes} />
        <KpiCard title="Bajo mínimo" value={d.lowStockCount} icon={AlertTriangle} tone={d.lowStockCount > 0 ? 'warning' : 'default'} />
        <KpiCard title="Críticos bajo mínimo" value={d.criticalLowCount} icon={Siren} tone={d.criticalLowCount > 0 ? 'danger' : 'default'} />
        <KpiCard title="Movimientos (30 días)" value={d.movementsLast30Days} icon={ArrowDownUp} hint={`${d.receiptsLast30Days} ingresos · ${d.issuesLast30Days} salidas`} />
        <KpiCard title="Activos en stock" value={d.assetsInStock} icon={PackageCheck} hint="Equipos de repuesto disponibles" />
        <KpiCard title="Activos en reparación" value={d.assetsInRepair} icon={Hammer} />
        <KpiCard title="Reservas" value={d.reservations} icon={Wrench} hint="Llegan con la planificación de órdenes (próximamente)" />
      </div>

      <section aria-labelledby="low-title">
        <h3 id="low-title" className="mb-3 flex items-center gap-2 text-lg font-semibold text-fur-navy-900">
          <AlertTriangle className="size-5" /> Ítems bajo mínimo
          <PermissionGate permission="procurement.create">
            <Link to={`/plants/${slug}/maintenance?tab=requisitions&suggest=1`} className="ml-auto text-sm font-normal underline-offset-2 hover:underline">
              Crear requisición de reposición
            </Link>
          </PermissionGate>
        </h3>
        {d.lowStock.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-fur-gray-600">Todos los ítems están por encima de su mínimo.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {d.lowStock.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onOpenItem(i.id)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-muted">
                  <span className="fur-code">{i.sku}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                  <StockFlags belowMin={false} isCritical={i.isCritical} />
                  <span className="text-sm text-fur-red-500">
                    {formatQuantity(i.onHand)} de {formatQuantity(i.minStock)} {i.uom} · faltan {formatQuantity(i.deficit)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="recent-title" className="text-lg font-semibold text-fur-navy-900">
            Movimientos recientes
          </h3>
          <Link to={`/plants/${slug}/inventory?tab=movements`} className="text-sm underline-offset-2 hover:underline">
            Ver todos
          </Link>
        </div>
        {d.recentMovements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-fur-gray-600">Aún no hay movimientos.</p>
        ) : (
          <MovementsTable slug={slug} movements={d.recentMovements} onOpenItem={onOpenItem} />
        )}
      </section>
    </div>
  )
}

export function DashboardView({ slug, onOpenItem }: { slug: string; onOpenItem: (id: string) => void }) {
  const { data, isLoading, isError, refetch } = useInventoryDashboard(slug)
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Cargando indicadores">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }
  return <Content d={data} slug={slug} onOpenItem={onOpenItem} />
}
