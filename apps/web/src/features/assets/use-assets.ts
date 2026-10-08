import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, jsonBody } from '@/lib/api'
import type { AssetCriticality, AssetStatus } from '@/lib/assets'
import type { DocumentItem } from '@/features/documents/use-documents'
import type { WorkOrderItem } from '@/features/maintenance/use-maintenance'

export type NetworkRef = { code: string; name: string; colorToken: string | null }

export type AssetItem = {
  id: string
  furCode: string
  tag: string
  name: string
  status: AssetStatus
  criticality: AssetCriticality
  location: string | null
  isPublic: boolean
  updatedAt: string
  stage: { code: string; name: string; group: string } | null
  model: { id: string; name: string }
  type: { code: string; name: string }
  family: { code: string; name: string }
  manufacturer: string | null
  networks: NetworkRef[]
}

/** Detalle: los campos internos solo llegan a quien tiene asset.read. */
export type AssetDetail = AssetItem & {
  specifications: Record<string, unknown>
  installationDate: string | null
  commissionDate: string | null
  createdAt: string
  serialNumber?: string | null
  parentAssetId?: string | null
  metadata?: Record<string, unknown>
  technicalData?: Record<string, unknown>
}

export type StatusHistoryEntry = {
  id: string
  oldStatus: string | null
  newStatus: string
  reason: string | null
  changedAt: string
  changedBy: string | null
}

export type AssetFur = {
  asset: AssetDetail
  plant: { id: string; name: string; slug: string; code: string }
  stage: AssetItem['stage']
  networks: NetworkRef[]
  documents: DocumentItem[]
  /** Vacío si quien consulta no tiene maintenance.read. */
  maintenance: {
    openWorkOrders?: number
    overdueWorkOrders?: number
    lastMaintenanceAt?: string | null
    nextMaintenanceAt?: string | null
    recent?: WorkOrderItem[]
    /** Costo acumulado de repuestos de sus órdenes no canceladas (moneda de la planta). */
    partsCost?: number
    /** Mano de obra, equipos, transporte, servicios y otros de sus órdenes no canceladas. */
    otherCost?: number
    totalCost?: number
    currency?: string
  }
  /** Vacío si quien consulta no tiene inventory.read. */
  inventory: {
    compatibleItems?: Array<{ id: string; sku: string; name: string; uom: string; onHand: number; minStock: number; isCritical: boolean; belowMin: boolean }>
    partsUsed?: Array<{ id: string; sku: string; name: string; uom: string; quantity: number; cost: number }>
  }
  telemetry: Record<string, unknown>
  kpis: unknown[]
  history: StatusHistoryEntry[]
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number }

/** Filtros del listado; viven en la URL (design.md §13), por eso son todos strings. */
export type AssetFilters = {
  search?: string
  stage?: string
  network?: string
  family?: string
  status?: string
  criticality?: string
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

// Todo cuelga de ['plant', slug, …] para invalidarse al cambiar de planta.
export const useAssets = (slug: string | undefined, filters: AssetFilters, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'assets', filters, pageSize],
    queryFn: () => api<Page<AssetItem>>(`/plants/${slug}/assets${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })

export const useAssetFur = (slug: string | undefined, assetId: string | undefined) =>
  useQuery({
    queryKey: ['plant', slug, 'asset', assetId],
    queryFn: () => api<AssetFur>(`/plants/${slug}/assets/${assetId}/fur`),
    enabled: !!slug && !!assetId,
    retry: false,
  })

export type AssetInput = {
  tag: string
  name: string
  assetModelId: string
  stageCode?: string | null
  serialNumber?: string | null
  status?: AssetStatus
  statusReason?: string
  criticality?: AssetCriticality
  location?: string | null
  isPublic?: boolean
  networkCodes?: string[]
}

export function useCreateAsset(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssetInput) => api<AssetDetail>(`/plants/${slug}/assets`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug, 'assets'] }),
  })
}

export function useUpdateAsset(slug: string, assetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<AssetInput>) => api<AssetDetail>(`/plants/${slug}/assets/${assetId}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'assets'] })
      void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'asset', assetId] })
    },
  })
}

export function useDecommissionAsset(slug: string, assetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>(`/plants/${slug}/assets/${assetId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'assets'] })
      void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'asset', assetId] })
    },
  })
}

// ---------- Catálogo global ----------

export type CatalogFamily = { id: string; code: string; name: string; icon: string | null }
export type CatalogModel = {
  id: string
  modelName: string
  status: string
  specifications: Record<string, unknown>
  technicalData: Record<string, unknown>
  /** Ruta (relativa a la API) de la foto del modelo; usar con `apiUrl`. null = sin foto. */
  imageUrl: string | null
  /** `stageCodes` / `networkCodes`: etapas (D01…) y redes (FUR-PTE…) donde se usa el tipo; vacío = sin asignar. */
  type: { id: string; code: string; name: string; stageCodes: string[]; networkCodes: string[] }
  family: { id: string; code: string; name: string; icon: string | null }
  manufacturer: { id: string; name: string; countryCode: string | null } | null
}
export type CatalogManufacturer = { id: string; name: string; countryCode: string | null }

export const useCatalogFamilies = () =>
  useQuery({ queryKey: ['catalog', 'families'], queryFn: () => api<CatalogFamily[]>('/catalog/families'), staleTime: 5 * 60_000 })

export const useCatalogManufacturers = () =>
  useQuery({ queryKey: ['catalog', 'manufacturers'], queryFn: () => api<CatalogManufacturer[]>('/catalog/manufacturers'), staleTime: 5 * 60_000 })

export type CatalogFilters = { stage?: string; network?: string; family?: string; manufacturerId?: string; search?: string; page?: string; status?: 'ACTIVE' | 'INACTIVE' | 'ALL' }

export const useCatalogModels = (filters: CatalogFilters, pageSize = 24) =>
  useQuery({
    queryKey: ['catalog', 'models', filters, pageSize],
    queryFn: () => api<Page<CatalogModel>>(`/catalog/assets${toQuery({ ...filters, pageSize })}`),
    placeholderData: keepPreviousData,
  })
