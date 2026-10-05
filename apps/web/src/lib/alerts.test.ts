import { describe, expect, it } from 'vitest'
import type { Summary } from '@/features/budget/use-budget'
import type { EcosystemDashboard } from '@/features/dashboard/use-dashboard'
import type { InventoryDashboard } from '@/features/inventory/use-inventory'
import type { MaintenanceDashboard } from '@/features/maintenance/use-maintenance'
import type { ProcurementSummary } from '@/features/procurement/use-procurement'
import { ecosystemAlerts, plantAlerts } from './alerts'

const maintenance = (over: Partial<MaintenanceDashboard> = {}) => ({ open: 3, backlog: 1, inProgress: 1, overdue: 0, ...over }) as MaintenanceDashboard
const inventory = (over: Partial<InventoryDashboard> = {}) => ({ lowStockCount: 0, criticalLowCount: 0, ...over }) as InventoryDashboard
const procurement = (over: Partial<ProcurementSummary> = {}): ProcurementSummary => ({ byStatus: {}, pendingApproval: 0, openRfqs: 0, awaitingReceipt: 0, ...over })
const budget = (over: Partial<Summary> = {}) => ({ baseCurrency: 'USD', priceDriftDirect: 0, ...over }) as Summary

describe('plantAlerts', () => {
  it('sin datos (sin permiso o con error) no hay alertas: ausente no es "todo bien" ni "todo mal"', () => {
    expect(plantAlerts({ slug: 'p' })).toEqual([])
    expect(plantAlerts({ slug: 'p', maintenance: null, inventory: null, procurement: null, budget: null, attentionAssets: null })).toEqual([])
  })

  it('con todo en orden tampoco hay alertas', () => {
    expect(plantAlerts({ slug: 'p', attentionAssets: 0, maintenance: maintenance(), inventory: inventory(), procurement: procurement(), budget: budget() })).toEqual([])
  })

  it('órdenes vencidas: crítica, con singular/plural y enlace filtrado', () => {
    const [one] = plantAlerts({ slug: 'rev', maintenance: maintenance({ overdue: 1 }) })
    expect(one).toMatchObject({ id: 'wo-overdue', severity: 'danger', text: '1 orden de trabajo vencida', to: '/plants/rev/maintenance?tab=orders&overdue=1' })
    expect(plantAlerts({ slug: 'rev', maintenance: maintenance({ overdue: 4 }) })[0].text).toBe('4 órdenes de trabajo vencidas')
  })

  it('stock: críticos son críticos; el resto bajo mínimo se cuenta aparte (sin duplicar los críticos)', () => {
    const alerts = plantAlerts({ slug: 'p', inventory: inventory({ lowStockCount: 5, criticalLowCount: 2 }) })
    expect(alerts.map((a) => [a.id, a.severity, a.text])).toEqual([
      ['stock-critical', 'danger', '2 repuestos críticos bajo el mínimo'],
      ['stock-low', 'warning', '3 ítems bajo el mínimo'],
    ])
    expect(alerts[0].to).toBe('/plants/p/inventory?tab=stock&low=1&critical=1')
    // si todos los bajo mínimo son críticos no aparece la de "ítems bajo el mínimo"
    expect(plantAlerts({ slug: 'p', inventory: inventory({ lowStockCount: 2, criticalLowCount: 2 }) }).map((a) => a.id)).toEqual(['stock-critical'])
  })

  it('activos que requieren atención', () => {
    expect(plantAlerts({ slug: 'p', attentionAssets: 1 })[0].text).toBe('1 activo requiere atención (críticos o en reparación)')
    expect(plantAlerts({ slug: 'p', attentionAssets: 3 })[0].text).toBe('3 activos requieren atención (críticos o en reparación)')
  })

  it('desviación de precios: solo si es POSITIVA (costo vigente por encima de lo congelado)', () => {
    const [a] = plantAlerts({ slug: 'p', budget: budget({ priceDriftDirect: 749.7 }) })
    expect(a).toMatchObject({ id: 'budget-drift', severity: 'warning', to: '/plants/p/budgets?tab=budgets&status=APPROVED' })
    expect(a.text).toContain('USD 749.70')
    expect(plantAlerts({ slug: 'p', budget: budget({ priceDriftDirect: -300 }) })).toEqual([])
  })

  it('compras: por aprobar y por recibir son informativas', () => {
    const alerts = plantAlerts({ slug: 'p', procurement: procurement({ pendingApproval: 2, awaitingReceipt: 1 }) })
    expect(alerts.map((a) => [a.severity, a.text])).toEqual([
      ['info', '2 requisiciones por aprobar'],
      ['info', '1 pedido por recibir'],
    ])
    expect(alerts[0].to).toBe('/plants/p/maintenance?tab=requisitions&status=SUBMITTED')
  })

  it('ordena por gravedad: críticas, luego atención, luego informativas', () => {
    const alerts = plantAlerts({
      slug: 'p',
      attentionAssets: 1,
      procurement: procurement({ pendingApproval: 1 }),
      maintenance: maintenance({ overdue: 2 }),
      inventory: inventory({ lowStockCount: 1, criticalLowCount: 0 }),
    })
    expect(alerts.map((a) => a.severity)).toEqual(['danger', 'warning', 'warning', 'info'])
  })
})

describe('ecosystemAlerts', () => {
  const eco = (over: Partial<EcosystemDashboard> = {}) =>
    ({ health: { database: 'up', latencyMs: 3 }, organizations: { providers: { total: 3, pending: 0 }, contractors: { total: 2, pending: 0 } }, ...over }) as EcosystemDashboard

  it('sin pendientes y con la base arriba no hay alertas', () => {
    expect(ecosystemAlerts(eco())).toEqual([])
  })

  it('base de datos caída es crítica y va primero; pendientes de aprobación son de atención', () => {
    const alerts = ecosystemAlerts(
      eco({ health: { database: 'down', latencyMs: 0 }, organizations: { providers: { total: 3, pending: 1 }, contractors: { total: 2, pending: 2 } } }),
    )
    expect(alerts.map((a) => [a.id, a.severity, a.text])).toEqual([
      ['db-down', 'danger', 'La base de datos no responde'],
      ['providers-pending', 'warning', '1 proveedor pendiente de aprobación'],
      ['contractors-pending', 'warning', '2 contratistas pendientes de aprobación'],
    ])
  })
})
