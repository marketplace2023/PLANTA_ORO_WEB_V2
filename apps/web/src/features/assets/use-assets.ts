import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, jsonBody } from '@/lib/api'
import type { AssetCriticality, AssetStatus } from '@/lib/assets'
import type { VariableType } from '@/lib/variable-value'
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
  /** Posición del activo sobre el mapa de la planta; null = sin ubicar. */
  mapPosition: { x: number; y: number } | null
  stage: { code: string; name: string; group: string } | null
  /** `imageUrl`: ruta (relativa a la API) de la foto del modelo; usar con `apiUrl`. null = sin foto. */
  model: { id: string; name: string; imageUrl: string | null }
  /** `description`: texto del tipo (p. ej. «Criba / parrilla de recepción de mineral ROM»); null si no tiene. */
  type: { code: string; name: string; description: string | null }
  family: { code: string; name: string }
  manufacturer: string | null
  networks: NetworkRef[]
}

/** Conteos de la planta (sin los dados de baja) para el geoportal. */
export type AssetsSummary = {
  total: number
  byStatus: Record<string, number>
  byCriticality: Record<string, number>
  /** Por código de etapa; los activos sin etapa solo cuentan en `total`. */
  byStage: Record<string, number>
  byNetwork: Record<string, number>
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

/** Conteos de la planta; con `network`, solo los activos de esa red (la vista de Procesos usa FUR-PROC). */
export const useAssetsSummary = (slug: string | undefined, network?: string) =>
  useQuery({
    queryKey: ['plant', slug, 'assets', 'summary', network ?? null],
    queryFn: () => api<AssetsSummary>(`/plants/${slug}/assets/summary${network ? `?network=${encodeURIComponent(network)}` : ''}`),
    enabled: !!slug,
  })

/** Variable de la ficha técnica de un modelo (dato del fabricante) y el valor registrado, si lo hay. */
export type ModelVariable = {
  id: string
  code: string
  label: string
  unit: string | null
  valueType: VariableType
  group: string | null
  isKey: boolean
  sortOrder: number
  /** Alcance: listas de códigos; vacía = aplica a todas (una variable puede compartirse entre varios equipos). */
  networkCodes: string[]
  stageCodes: string[]
  assetTypeCodes: string[]
  /** Valor propio del modelo (null si no registró uno). */
  value: unknown
  /** Valor general de la variable: lo que se muestra cuando el modelo no tiene uno propio. */
  defaultValue: unknown
}

/** Variables que aplican al tipo del modelo, con sus valores. El catálogo es público. */
export const useModelVariables = (modelId: string | undefined) =>
  useQuery({
    queryKey: ['catalog', 'model-variables', modelId],
    queryFn: () => api<ModelVariable[]>(`/catalog/models/${modelId}/variables`),
    enabled: !!modelId,
    staleTime: 60_000,
  })

export const useAssetFur =(slug: string | undefined, assetId: string | undefined) =>
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
  /** null quita la posición del mapa. */
  mapPosition?: { x: number; y: number } | null
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

/**
 * Reordena las tarjetas de activos: los ids ocupan, en ese orden, las posiciones que ya tenían (sirve con un subconjunto).
 * El cambio se ve al instante en las listas en caché y se revierte si el servidor lo rechaza.
 */
export function useReorderAssets(slug: string) {
  const queryClient = useQueryClient()
  const key = ['plant', slug, 'assets']
  return useMutation({
    mutationFn: (assetIds: string[]) => api<{ assetIds: string[] }>(`/plants/${slug}/assets/order`, { method: 'PUT', ...jsonBody({ assetIds }) }),
    onMutate: async (assetIds) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueriesData<Page<AssetItem>>({ queryKey: key })
      queryClient.setQueriesData<Page<AssetItem>>({ queryKey: key }, (page) => {
        if (!page || !Array.isArray(page.items)) return page
        const byId = new Map(page.items.map((a) => [a.id, a]))
        const moved = assetIds.filter((id) => byId.has(id))
        if (moved.length < 2) return page
        const queue = moved.map((id) => byId.get(id) as AssetItem)
        const inSet = new Set(moved)
        return { ...page, items: page.items.map((a) => (inSet.has(a.id) ? (queue.shift() as AssetItem) : a)) }
      })
      return { previous }
    },
    onError: (_e, _ids, ctx) => ctx?.previous.forEach(([k, data]) => queryClient.setQueryData(k, data)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

/** Coloca (o quita, con null) un activo en el mapa de la planta. El id va en cada llamada: se elige un activo distinto cada vez. */
export function useSetAssetMapPosition(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, position }: { id: string; position: { x: number; y: number } | null }) =>
      api<AssetDetail>(`/plants/${slug}/assets/${id}`, { method: 'PATCH', ...jsonBody({ mapPosition: position }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug] }),
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
  /**
   * `stageCodes` del modelo: las etapas donde realmente participa (las que declaró o, si no declaró, todas las de su tipo).
   * `type.stageCodes`: etapas posibles del tipo. Las redes son propias del modelo; vacío = sin asignar.
   */
  stageCodes: string[]
  /** `true` si el modelo no declaró etapas propias y hereda las del tipo. */
  stageInherited?: boolean
  networkCodes: string[]
  type: { id: string; code: string; name: string; description?: string | null; stageCodes: string[] }
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
