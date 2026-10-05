import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@/features/assets/use-assets'
import { api, jsonBody } from '@/lib/api'
import type { WorkOrderPart } from '@/features/inventory/use-inventory'
import type { CostKind, WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@/lib/maintenance'

export type WorkOrderItem = {
  id: string
  code: string
  type: WorkOrderType
  priority: WorkOrderPriority
  status: WorkOrderStatus
  title: string
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  createdAt: string
  updatedAt: string
  overdue: boolean
  planId: string | null
  asset: { id: string; tag: string; name: string; status: string; criticality: string }
  requestedBy: string | null
  assignedTo: { id: string; name: string } | null
  nextStatuses: WorkOrderStatus[]
}

export type WorkOrderHistoryEntry = {
  id: string
  fromStatus: string | null
  toStatus: string
  note: string | null
  changedAt: string
  changedBy: string | null
}

export type WorkOrderCost = {
  id: string
  kind: CostKind
  description: string
  /** Recurso del libro de precios de Presupuestos del que salió el costo (null = costo manual). */
  resource: { id: string; code: string; unit: string } | null
  quantity: number
  unitCost: number
  lineCost: number
  createdAt: string
  createdBy: string | null
}
export type WorkOrderCosts = { costs: WorkOrderCost[]; otherCost: number }

export type WorkOrderDetail = WorkOrderItem & {
  description: string | null
  completionNotes: string | null
  closedAt: string | null
  history: WorkOrderHistoryEntry[]
  parts: WorkOrderPart[]
  /** Costo de los repuestos con costo cargado, en la moneda de la planta. */
  partsCost: number
  partsHaveUncosted: boolean
  /** Mano de obra, equipos, transporte, servicios y otros (todo menos repuestos). */
  costs: WorkOrderCost[]
  otherCost: number
  totalCost: number
  currency: string
}

export type Assignee = { id: string; name: string; roles: string[] }

export type MaintenanceDashboard = {
  open: number
  backlog: number
  inProgress: number
  overdue: number
  completedLast30Days: number
  byStatus: Partial<Record<WorkOrderStatus, number>>
  openByType: Partial<Record<WorkOrderType, number>>
  mttrHours: number | null
  preventiveCompliancePct: number | null
  /** Costo de repuestos de las órdenes terminadas en los últimos 30 días. */
  partsCostLast30Days: number
  otherCostLast30Days: number
  totalCostLast30Days: number
  currency: string
  /** Requiere registro de fallas: siempre null por ahora. */
  mtbfHours: number | null
  overdueWorkOrders: WorkOrderItem[]
}

export type MaintenancePlan = {
  id: string
  name: string
  description: string | null
  planType: 'PREVENTIVE' | 'PREDICTIVE' | 'CONDITION'
  priority: WorkOrderPriority
  frequencyValue: number
  frequencyUnit: 'DAYS' | 'WEEKS' | 'MONTHS'
  nextDueAt: string
  lastGeneratedAt: string | null
  status: 'ACTIVE' | 'PAUSED'
  overdue: boolean
  asset: { id: string; tag: string; name: string }
}

export type WorkOrderFilters = {
  status?: string
  type?: string
  priority?: string
  assignedTo?: string
  overdue?: string
  search?: string
  assetId?: string
  sort?: string
  dir?: string
  page?: string
}

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

const base = (slug: string | undefined) => `/plants/${slug}/maintenance`

// Todo cuelga de ['plant', slug, 'maintenance', …] para invalidarse al cambiar de planta.
export const useWorkOrders = (slug: string | undefined, filters: WorkOrderFilters, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'maintenance', 'orders', filters, pageSize],
    queryFn: () => api<Page<WorkOrderItem>>(`${base(slug)}/work-orders${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })

export const useWorkOrder = (slug: string | undefined, id: string | undefined) =>
  useQuery({
    queryKey: ['plant', slug, 'maintenance', 'order', id],
    queryFn: () => api<WorkOrderDetail>(`${base(slug)}/work-orders/${id}`),
    enabled: !!slug && !!id,
    retry: false,
  })

export const useMaintenanceDashboard = (slug: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'maintenance', 'dashboard'],
    queryFn: () => api<MaintenanceDashboard>(`${base(slug)}/dashboard`),
    enabled: !!slug && enabled,
  })

/** Costos acumulados de un activo (pestaña Costos de la FUR): por categoría, mes, tipo de orden y orden. */
export type AssetCosts = {
  currency: string
  totals: { parts: number; labor: number; equipment: number; transport: number; service: number; other: number; total: number; partsWithoutCost: number }
  byMonth: Array<{ month: string; parts: number; other: number; total: number }>
  /** Costos anteriores a los últimos 12 meses (no se pierden del total). */
  beforeWindow: number
  byType: Array<{ type: WorkOrderType; orders: number; total: number }>
  orderCount: number
  orders: Array<{ id: string; code: string; title: string; type: WorkOrderType; status: WorkOrderStatus; parts: number; other: number; total: number }>
}

export const useAssetCosts = (slug: string | undefined, assetId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'maintenance', 'asset-costs', assetId],
    queryFn: () => api<AssetCosts>(`${base(slug)}/assets/${assetId}/costs`),
    enabled: !!slug && !!assetId && enabled,
  })

export const useAssignees = (slug: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'maintenance', 'assignees'],
    queryFn: () => api<Assignee[]>(`${base(slug)}/assignees`),
    enabled: !!slug && enabled,
    staleTime: 60_000,
  })

export const usePlans = (slug: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'maintenance', 'plans'],
    queryFn: () => api<Page<MaintenancePlan>>(`${base(slug)}/plans?pageSize=100`),
    enabled: !!slug && enabled,
  })

/** Cualquier cambio de mantenimiento puede alterar listas, KPIs, planes y la FUR de los activos. */
function useInvalidateMaintenance(slug: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'maintenance'] })
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'asset'] })
  }
}

export type WorkOrderInput = {
  assetId: string
  title: string
  description?: string
  type: WorkOrderType
  priority: WorkOrderPriority
  plannedEnd?: string
}

export function useCreateWorkOrder(slug: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: (input: WorkOrderInput) => api<WorkOrderDetail>(`${base(slug)}/work-orders`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export type WorkOrderPatch = Partial<Omit<WorkOrderInput, 'assetId' | 'plannedEnd' | 'description'>> & {
  description?: string | null
  plannedEnd?: string | null
  assignedTo?: string | null
}

export function useUpdateWorkOrder(slug: string, id: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: (input: WorkOrderPatch) => api<WorkOrderDetail>(`${base(slug)}/work-orders/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export type CostInput = { kind: CostKind; quantity: number; resourceId?: string; description?: string; unitCost?: number }

export function useAddWorkOrderCost(slug: string, id: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: (input: CostInput) => api<WorkOrderCosts>(`${base(slug)}/work-orders/${id}/costs`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useRemoveWorkOrderCost(slug: string, id: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: (costId: string) => api<WorkOrderCosts>(`${base(slug)}/work-orders/${id}/costs/${costId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export type TransitionInput = { to: WorkOrderStatus; note?: string; assignedTo?: string; completionNotes?: string }

export function useTransitionWorkOrder(slug: string, id: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: (input: TransitionInput) => api<WorkOrderDetail>(`${base(slug)}/work-orders/${id}/transition`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export type PlanInput = {
  assetId: string
  name: string
  description?: string
  planType: MaintenancePlan['planType']
  priority: WorkOrderPriority
  frequencyValue: number
  frequencyUnit: MaintenancePlan['frequencyUnit']
  firstDueAt: string
}

export function useCreatePlan(slug: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: (input: PlanInput) => api<MaintenancePlan>(`${base(slug)}/plans`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useUpdatePlan(slug: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<Pick<MaintenancePlan, 'name' | 'priority' | 'frequencyValue' | 'frequencyUnit' | 'status'>> & { nextDueAt?: string }) =>
      api<MaintenancePlan>(`${base(slug)}/plans/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useGeneratePlan(slug: string) {
  const invalidate = useInvalidateMaintenance(slug)
  return useMutation({
    mutationFn: (id: string) => api<WorkOrderDetail>(`${base(slug)}/plans/${id}/generate`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}
