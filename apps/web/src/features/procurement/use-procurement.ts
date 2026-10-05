import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@/features/assets/use-assets'
import { api, jsonBody } from '@/lib/api'
import type { RequisitionStatus } from '@/lib/procurement'

export type RequisitionItem = {
  id: string
  code: string
  status: RequisitionStatus
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  neededBy: string | null
  justification: string
  decisionNote: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  requestedBy: { id: string; name: string } | null
  asset: { id: string; tag: string; name: string } | null
  workOrder: { id: string; code: string } | null
  stage: { code: string; name: string } | null
  estimatedTotal: number
  lineCount: number
}

export type RequisitionLine = {
  id: string
  item: { id: string; sku: string } | null
  description: string
  quantity: number
  uom: string
  estimatedPrice: number | null
  lineTotal: number | null
  receivedQuantity: number
}

export type Quote = {
  id: string
  providerId: string
  providerName: string
  currency: string
  totalAmount: number
  deliveryDays: number
  conditions: string | null
  status: 'SUBMITTED' | 'AWARDED' | 'REJECTED' | 'WITHDRAWN'
  updatedAt: string
}

export type Rfq = {
  id: string
  code: string
  status: 'OPEN' | 'AWARDED' | 'CANCELLED'
  deadlineAt: string
  expired: boolean
  invited: Array<{ id: string; name: string; verified: boolean }>
  quotes: Quote[]
}

export type RequisitionDetail = RequisitionItem & {
  lines: RequisitionLine[]
  history: Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; changedAt: string; changedBy: string | null }>
  rfq: Rfq | null
}

export type ProcurementSummary = { byStatus: Partial<Record<RequisitionStatus, number>>; pendingApproval: number; openRfqs: number; awaitingReceipt: number }
export type Suggestion = { itemId: string; sku: string; description: string; uom: string; onHand: number; suggestedQuantity: number }

export type RequisitionFilters = { status?: string; priority?: string; assetId?: string; mine?: string; search?: string; sort?: string; dir?: string; page?: string }

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
const base = (slug: string | undefined) => `/plants/${slug}/procurement`

// Todo cuelga de ['plant', slug, 'procurement', …] para invalidarse al cambiar de planta.
export const useRequisitions = (slug: string | undefined, filters: RequisitionFilters, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: ['plant', slug, 'procurement', 'list', filters, pageSize],
    queryFn: () => api<Page<RequisitionItem>>(`${base(slug)}/requisitions${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })

export const useRequisition = (slug: string | undefined, id: string | undefined) =>
  useQuery({ queryKey: ['plant', slug, 'procurement', 'one', id], queryFn: () => api<RequisitionDetail>(`${base(slug)}/requisitions/${id}`), enabled: !!slug && !!id, retry: false })

export const useProcurementSummary = (slug: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['plant', slug, 'procurement', 'summary'], queryFn: () => api<ProcurementSummary>(`${base(slug)}/summary`), enabled: !!slug && enabled })

export const useSuggestions = (slug: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['plant', slug, 'procurement', 'suggestions'], queryFn: () => api<Suggestion[]>(`${base(slug)}/suggestions`), enabled: !!slug && enabled })

/** Una recepción cambia también stock y KPIs de inventario. */
function useInvalidate(slug: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'procurement'] })
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'inventory'] })
  }
}

export type LineInput = { itemId?: string; description: string; quantity: number; uom?: string; estimatedPrice?: number }
export type RequisitionInput = {
  justification: string
  priority: RequisitionItem['priority']
  neededBy?: string
  stageCode?: string
  assetId?: string
  workOrderId?: string
  lines: LineInput[]
}

export function useCreateRequisition(slug: string) {
  const invalidate = useInvalidate(slug)
  return useMutation({ mutationFn: (input: RequisitionInput) => api<RequisitionDetail>(`${base(slug)}/requisitions`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export type RequisitionPatch = Partial<Omit<RequisitionInput, 'neededBy' | 'stageCode' | 'assetId' | 'workOrderId'>> & { neededBy?: string | null; stageCode?: string | null; assetId?: string | null; workOrderId?: string | null }

export function useUpdateRequisition(slug: string, id: string) {
  const invalidate = useInvalidate(slug)
  return useMutation({ mutationFn: (input: RequisitionPatch) => api<RequisitionDetail>(`${base(slug)}/requisitions/${id}`, { method: 'PATCH', ...jsonBody(input) }), onSuccess: invalidate })
}

export type ActionInput =
  | { action: 'submit' }
  | { action: 'approve'; note?: string }
  | { action: 'reject'; note: string }
  | { action: 'cancel'; note: string }
  | { action: 'award'; quoteId: string }
  | { action: 'rfq'; providerIds: string[]; deadlineAt: string }
  | { action: 'receive'; lines: Array<{ lineId: string; quantity: number; locationId?: string; unitCost?: number }>; note?: string }

export function useRequisitionAction(slug: string, id: string) {
  const invalidate = useInvalidate(slug)
  return useMutation({
    mutationFn: ({ action, ...body }: ActionInput) => api<RequisitionDetail>(`${base(slug)}/requisitions/${id}/${action}`, { method: 'POST', ...jsonBody(body) }),
    onSuccess: invalidate,
  })
}

export function useCancelRfq(slug: string, id: string) {
  const invalidate = useInvalidate(slug)
  return useMutation({ mutationFn: () => api<RequisitionDetail>(`${base(slug)}/requisitions/${id}/rfq`, { method: 'DELETE' }), onSuccess: invalidate })
}

// ----- Lado del proveedor -----
export type ProviderRfq = {
  id: string
  code: string
  status: 'OPEN' | 'AWARDED' | 'CANCELLED'
  deadlineAt: string
  acceptsQuotes: boolean
  priority: string
  neededBy: string | null
  plant: { name: string; countryCode: string | null }
  lines: Array<{ id: string; description: string; quantity: number; uom: string }>
  myQuote: { id: string; currency: string; totalAmount: number; deliveryDays: number; conditions: string | null; status: Quote['status'] } | null
}

export const useProviderRfqs = (providerId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['org', 'provider', providerId, 'rfqs'], queryFn: () => api<ProviderRfq[]>(`/providers/${providerId}/rfqs`), enabled: !!providerId && enabled })

export function useSubmitQuote(providerId: string, rfqId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { currency: string; totalAmount: number; deliveryDays: number; conditions?: string }) => api<ProviderRfq>(`/providers/${providerId}/rfqs/${rfqId}/quote`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org', 'provider', providerId, 'rfqs'] }),
  })
}

export function useWithdrawQuote(providerId: string, rfqId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<ProviderRfq>(`/providers/${providerId}/rfqs/${rfqId}/quote`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org', 'provider', providerId, 'rfqs'] }),
  })
}
