import { Activity, ClipboardList, Gauge, Package, ShoppingCart, Wallet, Warehouse, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertList } from '@/components/dashboard/alert-list'
import { KpiCard } from '@/components/industrial/kpi-card'
import { useBudgetSummary } from '@/features/budget/use-budget'
import { useInventoryDashboard } from '@/features/inventory/use-inventory'
import { useMaintenanceDashboard } from '@/features/maintenance/use-maintenance'
import { usePlantProcess } from '@/features/process/use-process'
import { useProcurementSummary } from '@/features/procurement/use-procurement'
import { plantAlerts } from '@/lib/alerts'
import { formatMoney, formatPct } from '@/lib/format'

type Probe = { isLoading: boolean; isError: boolean; refetch: () => unknown }

/** Tarjeta de KPI que lleva al módulo (toda la tarjeta es el enlace, con foco visible). */
function KpiLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&:hover>*]:shadow-md">
      {children}
    </Link>
  )
}

/**
 * Resumen operacional y alertas de la planta (arquitectura §35.2, design.md §21/§23).
 * Cada bloque se pide solo si el usuario tiene el permiso del módulo y falla por separado: un módulo caído
 * no tumba el tablero, y lo que no se puede ver no se muestra ni se cuenta como "cero".
 */
export function PlantOverview({ slug, permissions }: { slug: string; permissions: string[] }) {
  const can = (p: string) => permissions.includes(p)
  const process = usePlantProcess(slug)
  const maintenance = useMaintenanceDashboard(slug, can('maintenance.read'))
  const inventory = useInventoryDashboard(slug, can('inventory.read'))
  const procurement = useProcurementSummary(slug, can('procurement.read'))
  const budget = useBudgetSummary(slug, can('budget.read'))

  const totals = process.data?.totals ?? null // null = no visible para quien consulta
  const probes: Array<[boolean, Probe]> = [
    [can('maintenance.read'), maintenance],
    [can('inventory.read'), inventory],
    [can('procurement.read'), procurement],
    [can('budget.read'), budget],
  ]
  const queries = probes.filter(([allowed]) => allowed).map(([, q]) => q)

  // Sin ningún indicador visible (p. ej. visitante) el resumen no tiene nada que mostrar.
  if (!totals && queries.length === 0) return null

  const loading = queries.some((q) => q.isLoading) || (process.isLoading && queries.length === 0)
  const failed = queries.filter((q) => q.isError)
  const base = `/plants/${slug}`

  const alerts = plantAlerts({
    slug,
    attentionAssets: totals?.attention ?? null,
    maintenance: maintenance.data ?? null,
    inventory: inventory.data ?? null,
    procurement: procurement.data ?? null,
    budget: budget.data ?? null,
  })

  return (
    <section aria-labelledby="overview-title" className="mb-8 space-y-6">
      <div>
        <h2 id="overview-title" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
          <Gauge className="size-5" /> Resumen operacional
        </h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Cargando indicadores">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {totals && (
              <KpiLink to={`${base}/assets`}>
                <KpiCard
                  title="Activos en etapas"
                  value={totals.assets}
                  icon={Package}
                  tone={totals.attention > 0 ? 'warning' : 'default'}
                  hint={totals.attention > 0 ? `${totals.attention} requieren atención` : 'Ninguno requiere atención'}
                />
              </KpiLink>
            )}
            <KpiCard title="Disponibilidad" value={null} icon={Activity} hint="Requiere registro de fallas y paros: aún no disponible" />
            {maintenance.data && (
              <KpiLink to={`${base}/maintenance`}>
                <KpiCard
                  title="Órdenes de trabajo abiertas"
                  value={maintenance.data.open}
                  icon={Wrench}
                  tone={maintenance.data.overdue > 0 ? 'danger' : 'default'}
                  hint={`${maintenance.data.overdue} vencidas · ${maintenance.data.backlog} en backlog`}
                />
              </KpiLink>
            )}
            {inventory.data && (
              <KpiLink to={`${base}/inventory`}>
                <KpiCard
                  title="Valor del inventario"
                  value={formatMoney(inventory.data.stockValue, inventory.data.currency)}
                  icon={Warehouse}
                  tone={inventory.data.criticalLowCount > 0 ? 'danger' : inventory.data.lowStockCount > 0 ? 'warning' : 'default'}
                  hint={`${inventory.data.lowStockCount} bajo mínimo (${inventory.data.criticalLowCount} críticos)`}
                />
              </KpiLink>
            )}
            {procurement.data && (
              <KpiLink to={`${base}/maintenance?tab=requisitions`}>
                <KpiCard title="Requisiciones por aprobar" value={procurement.data.pendingApproval} icon={ShoppingCart} hint={`${procurement.data.openRfqs} RFQ abiertos · ${procurement.data.awaitingReceipt} por recibir`} />
              </KpiLink>
            )}
            {budget.data && (
              <KpiLink to={`${base}/budgets`}>
                <KpiCard
                  title="Presupuesto aprobado"
                  value={formatMoney(budget.data.approvedTotal, budget.data.baseCurrency)}
                  icon={Wallet}
                  hint={budget.data.progressPct === null ? 'Aún no hay presupuestos aprobados' : `Avance ${formatPct(budget.data.progressPct)}`}
                />
              </KpiLink>
            )}
          </div>
        )}
        {failed.length > 0 && (
          <p role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-fur-red-500 bg-fur-red-500/10 px-4 py-2 text-sm">
            No se pudieron cargar {failed.length === 1 ? 'un indicador' : `${failed.length} indicadores`}; las alertas pueden estar incompletas.
            <Button size="sm" variant="secondary" onClick={() => failed.forEach((q) => void q.refetch())}>
              Reintentar
            </Button>
          </p>
        )}
      </div>

      <div>
        <h2 id="alerts-title" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
          <ClipboardList className="size-5" /> Alertas
        </h2>
        {loading ? <Skeleton className="h-16" aria-busy="true" /> : <AlertList alerts={alerts} emptyText={failed.length > 0 ? 'Sin alertas en los indicadores disponibles.' : 'Sin alertas activas.'} />}
      </div>
    </section>
  )
}
