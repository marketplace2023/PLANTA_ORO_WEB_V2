import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@/features/assets/use-assets'
import { api, jsonBody } from '@/lib/api'
import type { ItemType, LocationType, MovementType } from '@/lib/inventory'

export type InventoryItem = {
  id: string
  sku: string
  name: string
  description: string | null
  itemType: ItemType
  uom: string
  minStock: number
  maxStock: number | null
  isCritical: boolean
  unitCost: number | null
  status: 'ACTIVE' | 'INACTIVE'
  assetModelId: string | null
  onHand: number
  belowMin: boolean
  /** Existencias × costo promedio; null si el ítem no tiene costo cargado. */
  value: number | null
}

export type StockLine = { locationId: string; locationCode: string; locationName: string; warehouseCode: string; warehouseName: string; quantity: number }

export type Movement = {
  id: string
  item: { id: string; sku: string; name: string; uom: string }
  type: MovementType
  quantity: number
  unitCost: number | null
  referenceType: string
  referenceId: string | null
  note: string | null
  performedAt: string
  from: string | null
  to: string | null
  performedBy: string | null
}

export type InventoryItemDetail = InventoryItem & {
  model: { id: string; name: string } | null
  stock: StockLine[]
  recentMovements: Movement[]
}

export type Warehouse = { id: string; code: string; name: string; status: 'ACTIVE' | 'INACTIVE' }

export type StorageLocation = {
  id: string
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  parentId: string | null
  code: string
  name: string
  locationType: LocationType
  status: 'ACTIVE' | 'INACTIVE'
}

export type LowStockLine = { id: string; sku: string; name: string; uom: string; onHand: number; minStock: number; isCritical: boolean; deficit: number }

export type InventoryDashboard = {
  currency: string
  itemCount: number
  stockValue: number
  lowStockCount: number
  criticalLowCount: number
  movementsLast30Days: number
  receiptsLast30Days: number
  issuesLast30Days: number
  assetsInStock: number
  assetsInRepair: number
  /** Las reservas llegan con la planificación de OT/requisiciones: null = no disponible. */
  reservations: number | null
  lowStock: LowStockLine[]
  recentMovements: Movement[]
}

export type ItemFilters = { search?: string; type?: string; critical?: string; low?: string; warehouseId?: string; status?: string; sort?: string; dir?: string; page?: string }
export type MovementFilters = { itemId?: string; type?: string; referenceType?: string; from?: string; to?: string; page?: string }

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

const base = (slug: string | undefined) => `/plants/${slug}/inventory`

// Todo cuelga de ['plant', slug, 'inventory', …] para invalidarse al cambiar de planta.
export const useInventoryDashboard = (slug: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['plant', slug, 'inventory', 'dashboard'], queryFn: () => api<InventoryDashboard>(`${base(slug)}/dashboard`), enabled: !!slug && enabled })

export const useItems = (slug: string | undefined, filters: ItemFilters, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'inventory', 'items', filters, pageSize],
    queryFn: () => api<Page<InventoryItem>>(`${base(slug)}/items${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })

export const useItem = (slug: string | undefined, id: string | undefined) =>
  useQuery({
    queryKey: ['plant', slug, 'inventory', 'item', id],
    queryFn: () => api<InventoryItemDetail>(`${base(slug)}/items/${id}`),
    enabled: !!slug && !!id,
    retry: false,
  })

export const useMovements = (slug: string | undefined, filters: MovementFilters, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'inventory', 'movements', filters, pageSize],
    queryFn: () => api<Page<Movement>>(`${base(slug)}/movements${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })

export const useWarehouses = (slug: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['plant', slug, 'inventory', 'warehouses'], queryFn: () => api<Warehouse[]>(`${base(slug)}/warehouses`), enabled: !!slug && enabled })

export const useLocations = (slug: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['plant', slug, 'inventory', 'locations'], queryFn: () => api<StorageLocation[]>(`${base(slug)}/locations`), enabled: !!slug && enabled })

/** Un movimiento cambia saldos, KPIs, listas y también el costo de las órdenes y la FUR de los activos. */
function useInvalidateInventory(slug: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'inventory'] })
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'maintenance'] })
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'asset'] })
  }
}

export type ItemInput = {
  sku: string
  name: string
  description?: string
  itemType: ItemType
  uom: string
  minStock: number
  maxStock?: number
  isCritical: boolean
  unitCost?: number
}

export function useCreateItem(slug: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({ mutationFn: (input: ItemInput) => api<InventoryItemDetail>(`${base(slug)}/items`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export type ItemPatch = Partial<Omit<ItemInput, 'sku' | 'uom' | 'description' | 'maxStock' | 'unitCost'>> & {
  description?: string | null
  maxStock?: number | null
  unitCost?: number | null
  status?: 'ACTIVE' | 'INACTIVE'
}

export function useUpdateItem(slug: string, id: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({ mutationFn: (input: ItemPatch) => api<InventoryItemDetail>(`${base(slug)}/items/${id}`, { method: 'PATCH', ...jsonBody(input) }), onSuccess: invalidate })
}

export type MovementInput =
  | { kind: 'receipt'; itemId: string; locationId: string; quantity: number; unitCost?: number; note?: string }
  | { kind: 'issue'; itemId: string; locationId: string; quantity: number; note?: string }
  | { kind: 'transfer'; itemId: string; fromLocationId: string; toLocationId: string; quantity: number; note?: string }
  | { kind: 'adjust'; itemId: string; locationId: string; newQuantity: number; reason: string }

export function useMove(slug: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({
    mutationFn: ({ kind, ...body }: MovementInput) => api<{ movementId: string }>(`${base(slug)}/movements/${kind}`, { method: 'POST', ...jsonBody(body) }),
    onSuccess: invalidate,
  })
}

export function useCreateWarehouse(slug: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({ mutationFn: (input: { code: string; name: string }) => api<Warehouse>(`${base(slug)}/warehouses`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export function useUpdateWarehouse(slug: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; status?: 'ACTIVE' | 'INACTIVE' }) => api<Warehouse>(`${base(slug)}/warehouses/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useCreateLocation(slug: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({
    mutationFn: (input: { warehouseId: string; parentId?: string; code: string; name: string; locationType: LocationType }) =>
      api<StorageLocation>(`${base(slug)}/locations`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useUpdateLocation(slug: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; locationType?: LocationType; status?: 'ACTIVE' | 'INACTIVE' }) =>
      api<StorageLocation>(`${base(slug)}/locations/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

// ----- Repuestos de una orden de trabajo -----

export type WorkOrderPart = {
  id: string
  item: { id: string; sku: string; name: string; uom: string }
  location: string | null
  quantity: number
  unitCost: number | null
  lineCost: number | null
  createdAt: string
  createdBy: string | null
}
export type WorkOrderParts = { parts: WorkOrderPart[]; partsCost: number; hasUncosted: boolean }

export function useAddWorkOrderPart(slug: string, workOrderId: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({
    mutationFn: (input: { itemId: string; locationId: string; quantity: number; note?: string }) =>
      api<WorkOrderParts>(`/plants/${slug}/maintenance/work-orders/${workOrderId}/parts`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useReturnWorkOrderPart(slug: string, workOrderId: string) {
  const invalidate = useInvalidateInventory(slug)
  return useMutation({
    mutationFn: (partId: string) => api<WorkOrderParts>(`/plants/${slug}/maintenance/work-orders/${workOrderId}/parts/${partId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}
