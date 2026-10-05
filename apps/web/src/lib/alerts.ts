import type { InventoryDashboard } from '@/features/inventory/use-inventory'
import type { MaintenanceDashboard } from '@/features/maintenance/use-maintenance'
import type { ProcurementSummary } from '@/features/procurement/use-procurement'
import type { Summary as BudgetSummary } from '@/features/budget/use-budget'
import type { EcosystemDashboard } from '@/features/dashboard/use-dashboard'
import { formatMoney } from '@/lib/format'

export type AlertSeverity = 'danger' | 'warning' | 'info'
export type DashboardAlert = { id: string; severity: AlertSeverity; text: string; to: string }

export const SEVERITY_LABELS: Record<AlertSeverity, string> = { danger: 'Crítica', warning: 'Atención', info: 'Informativa' }
const ORDER: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const bySeverity = (alerts: DashboardAlert[]) => [...alerts].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])

export type PlantAlertInput = {
  slug: string
  /** Activos que requieren atención (estado crítico o en reparación); null/undefined = no disponible para quien consulta. */
  attentionAssets?: number | null
  maintenance?: MaintenanceDashboard | null
  inventory?: InventoryDashboard | null
  procurement?: ProcurementSummary | null
  budget?: BudgetSummary | null
}

/**
 * Alertas de una planta, derivadas SOLO de los indicadores que el usuario puede ver y que ya cargaron:
 * un dato ausente (sin permiso o con error) no genera alerta ni se interpreta como "todo bien".
 */
export function plantAlerts({ slug, attentionAssets, maintenance, inventory, procurement, budget }: PlantAlertInput): DashboardAlert[] {
  const p = `/plants/${slug}`
  const alerts: DashboardAlert[] = []

  if (maintenance && maintenance.overdue > 0) {
    alerts.push({ id: 'wo-overdue', severity: 'danger', text: `${plural(maintenance.overdue, 'orden de trabajo vencida', 'órdenes de trabajo vencidas')}`, to: `${p}/maintenance?tab=orders&overdue=1` })
  }
  if (inventory && inventory.criticalLowCount > 0) {
    alerts.push({ id: 'stock-critical', severity: 'danger', text: `${plural(inventory.criticalLowCount, 'repuesto crítico bajo el mínimo', 'repuestos críticos bajo el mínimo')}`, to: `${p}/inventory?tab=stock&low=1&critical=1` })
  }
  if (inventory && inventory.lowStockCount > inventory.criticalLowCount) {
    const n = inventory.lowStockCount - inventory.criticalLowCount
    alerts.push({ id: 'stock-low', severity: 'warning', text: `${plural(n, 'ítem bajo el mínimo', 'ítems bajo el mínimo')}`, to: `${p}/inventory?tab=stock&low=1` })
  }
  if (attentionAssets && attentionAssets > 0) {
    alerts.push({ id: 'assets-attention', severity: 'warning', text: `${plural(attentionAssets, 'activo requiere atención', 'activos requieren atención')} (críticos o en reparación)`, to: `${p}/assets` })
  }
  if (budget && budget.priceDriftDirect > 0) {
    alerts.push({
      id: 'budget-drift',
      severity: 'warning',
      text: `Los precios vigentes superan en ${formatMoney(budget.priceDriftDirect, budget.baseCurrency)} lo congelado en los presupuestos aprobados`,
      to: `${p}/budgets?tab=budgets&status=APPROVED`,
    })
  }
  if (procurement && procurement.pendingApproval > 0) {
    alerts.push({ id: 'rq-pending', severity: 'info', text: `${plural(procurement.pendingApproval, 'requisición por aprobar', 'requisiciones por aprobar')}`, to: `${p}/maintenance?tab=requisitions&status=SUBMITTED` })
  }
  if (procurement && procurement.awaitingReceipt > 0) {
    alerts.push({ id: 'rq-receipt', severity: 'info', text: `${plural(procurement.awaitingReceipt, 'pedido por recibir', 'pedidos por recibir')}`, to: `${p}/maintenance?tab=requisitions&status=ORDERED` })
  }
  return bySeverity(alerts)
}

/** Alertas del administrador del ecosistema (arquitectura §35.1). */
export function ecosystemAlerts(d: EcosystemDashboard): DashboardAlert[] {
  const alerts: DashboardAlert[] = []
  if (d.health.database === 'down') alerts.push({ id: 'db-down', severity: 'danger', text: 'La base de datos no responde', to: '/dashboards' })
  if (d.organizations.providers.pending > 0) {
    alerts.push({ id: 'providers-pending', severity: 'warning', text: `${plural(d.organizations.providers.pending, 'proveedor pendiente de aprobación', 'proveedores pendientes de aprobación')}`, to: '/providers' })
  }
  if (d.organizations.contractors.pending > 0) {
    alerts.push({ id: 'contractors-pending', severity: 'warning', text: `${plural(d.organizations.contractors.pending, 'contratista pendiente de aprobación', 'contratistas pendientes de aprobación')}`, to: '/professionals' })
  }
  return bySeverity(alerts)
}
