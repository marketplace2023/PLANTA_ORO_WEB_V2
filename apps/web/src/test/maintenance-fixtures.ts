import type { AssetCosts, MaintenanceDashboard, MaintenancePlan, WorkOrderDetail, WorkOrderItem } from '@/features/maintenance/use-maintenance'

const MONTHS_12 = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']

/** Costos de un activo: wo1 (correctivo terminado) y wo2 (preventivo en ejecución); todo el costo cae en el último mes. */
export const assetCosts = (over: Partial<AssetCosts> = {}): AssetCosts => ({
  currency: 'USD',
  totals: { parts: 100, labor: 45, equipment: 54, transport: 0, service: 300, other: 10, total: 509, partsWithoutCost: 0 },
  byMonth: [...MONTHS_12.map((month) => ({ month, parts: 0, other: 0, total: 0 })), { month: '2026-10', parts: 100, other: 409, total: 509 }],
  beforeWindow: 0,
  byType: [
    { type: 'CORRECTIVE', orders: 1, total: 499 },
    { type: 'PREVENTIVE', orders: 1, total: 10 },
  ],
  orderCount: 2,
  orders: [
    { id: 'w1', code: 'OT-2026-00001', title: 'Cambio de rodamiento', type: 'CORRECTIVE', status: 'COMPLETED', parts: 100, other: 399, total: 499 },
    { id: 'w2', code: 'OT-2026-00002', title: 'Inspección mensual', type: 'PREVENTIVE', status: 'IN_PROGRESS', parts: 0, other: 10, total: 10 },
  ],
  ...over,
})

export const wo = (over: Partial<WorkOrderItem> = {}): WorkOrderItem => ({
  id: 'w1',
  code: 'OT-2026-00001',
  type: 'CORRECTIVE',
  priority: 'HIGH',
  status: 'REQUESTED',
  title: 'Vibración alta en el molino',
  plannedStart: null,
  plannedEnd: '2026-10-20T15:00:00.000Z',
  actualStart: null,
  actualEnd: null,
  createdAt: '2026-10-01T18:00:00.000Z',
  updatedAt: '2026-10-01T18:00:00.000Z',
  overdue: false,
  planId: null,
  asset: { id: 'a1', tag: 'MB-301', name: 'Molino de bolas 1', status: 'OPERATIVE', criticality: 'CRITICAL' },
  requestedBy: 'Olga Operadora',
  assignedTo: null,
  nextStatuses: ['PLANNED', 'CANCELLED'],
  ...over,
})

export const woDetail = (over: Partial<WorkOrderDetail> = {}): WorkOrderDetail => ({
  ...wo(),
  description: 'Se siente en el piso de la nave',
  completionNotes: null,
  closedAt: null,
  history: [{ id: 'h1', fromStatus: null, toStatus: 'REQUESTED', note: 'Solicitud creada', changedAt: '2026-10-01T18:00:00.000Z', changedBy: 'Olga Operadora' }],
  parts: [],
  partsCost: 0,
  partsHaveUncosted: false,
  costs: [],
  otherCost: 0,
  totalCost: 0,
  currency: 'USD',
  ...over,
})

export const dashboard = (over: Partial<MaintenanceDashboard> = {}): MaintenanceDashboard => ({
  open: 5,
  backlog: 3,
  inProgress: 1,
  overdue: 2,
  completedLast30Days: 4,
  byStatus: { REQUESTED: 1, PLANNED: 1, ASSIGNED: 1, IN_PROGRESS: 1, ON_HOLD: 1, COMPLETED: 3, CLOSED: 2 },
  openByType: { CORRECTIVE: 3, PREVENTIVE: 1, PREDICTIVE: 1 },
  mttrHours: 3,
  preventiveCompliancePct: 33.3,
  partsCostLast30Days: 1250.5,
  otherCostLast30Days: 800,
  totalCostLast30Days: 2050.5,
  currency: 'USD',
  mtbfHours: null,
  overdueWorkOrders: [wo({ id: 'w9', code: 'OT-2026-00009', title: 'Cambio de aceite', overdue: true, plannedEnd: '2026-09-01T10:00:00.000Z', status: 'PLANNED', priority: 'URGENT' })],
  ...over,
})

export const plan = (over: Partial<MaintenancePlan> = {}): MaintenancePlan => ({
  id: 'p1',
  name: 'Lubricación mensual',
  description: null,
  planType: 'PREVENTIVE',
  priority: 'MEDIUM',
  frequencyValue: 1,
  frequencyUnit: 'MONTHS',
  nextDueAt: '2026-11-15T10:00:00.000Z',
  lastGeneratedAt: null,
  status: 'ACTIVE',
  overdue: false,
  asset: { id: 'a1', tag: 'MB-301', name: 'Molino de bolas 1' },
  ...over,
})

export const ASSIGNEES = [
  { id: 'u-tech', name: 'Tomás Técnico', roles: ['TECHNICIAN'] },
  { id: 'u-lead', name: 'Marta Mantenimiento', roles: ['MAINTENANCE_LEAD'] },
]
