import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@/features/assets/use-assets'
import { api, jsonBody } from '@/lib/api'
import type { ResourceType } from '@/lib/budget'

export type Breakdown = Record<ResourceType, number>
export type Totals = { direct: number; overhead: number; utility: number; subtotal: number; tax: number; total: number }
export type Rates = { overheadPct: number; utilityPct: number; taxPct: number }
export type Adjustments = Partial<Record<ResourceType, number>>

export type Summary = {
  baseCurrency: string
  budgetsByStatus: Partial<Record<'DRAFT' | 'APPROVED' | 'CLOSED', number>>
  budgetCount: number
  approvedDirect: number
  approvedTotal: number
  executedDirect: number
  executedTotal: number
  progressPct: number | null
  priceDriftDirect: number
  apuCount: number
  resourceCount: number
}

export type Resource = { id: string; code: string; name: string; resourceType: ResourceType; unit: string; unitPrice: number; currency: string; status: 'ACTIVE' | 'INACTIVE'; sourceItemId: string | null; updatedAt: string }
export type PriceHistoryRow = { id: string; unitPrice: number; currency: string; note: string | null; changedAt: string; changedBy: string | null }
export type ExchangeRates = { baseCurrency: string; rates: Array<{ currency: string; rate: number; updatedAt: string }> }

export type ApuSummary = { id: string; code: string; name: string; unit: string; status: 'ACTIVE' | 'INACTIVE'; yieldValue: number; lineCount: number; unitPrice: number | null; missingRates: string[] }
export type ApuLine = {
  id: string
  resourceId: string
  code: string
  name: string
  type: ResourceType
  unit: string
  unitPrice: number
  currency: string
  quantity: number
  wastePct: number
  resourceStatus: string
  subtotal: number | null
}
export type ApuDetail = {
  id: string
  code: string
  name: string
  unit: string
  description: string | null
  yieldValue: number
  hoursPerDay: number
  status: 'ACTIVE' | 'INACTIVE'
  baseCurrency: string
  missingRates: string[]
  lines: ApuLine[]
  directCost: number | null
  breakdown: Breakdown | null
  usedInBudgets: number
}

export type Project = { id: string; code: string; name: string; description: string | null; status: 'ACTIVE' | 'CLOSED'; budgets: number }
export type BudgetStatus = 'DRAFT' | 'APPROVED' | 'CLOSED'
export type BudgetSummary = {
  id: string
  code: string
  name: string
  status: BudgetStatus
  project: { id: string; code: string; name: string }
  itemCount: number
  total: number
  direct: number
  incomplete: boolean
  approvedAt: string | null
  createdAt: string
}

export type BudgetItem = {
  id: string
  code: string
  description: string
  unit: string
  quantity: number
  unitPrice: number | null
  amount: number | null
  missingRates: string[]
  apu: { id: string; code: string; name: string }
}
export type Chapter = { id: string; code: string; name: string; position: number; subtotal: number; items: BudgetItem[] }
export type BudgetDetail = {
  id: string
  code: string
  name: string
  status: BudgetStatus
  project: { id: string; code: string; name: string }
  baseCurrency: string
  rates: Rates
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
  totals: Totals & { incomplete: boolean }
  chapters: Chapter[]
}

export type Scenario = { id: string; name: string; adjustments: Adjustments; createdAt: string }
export type Analysis = {
  baseCurrency: string
  base: Totals
  scenarios: Array<{ id: string; name: string; adjustments: Adjustments; totals: Totals; change: number; changePct: number | null }>
  sensitivity: { base: number; rows: Array<{ type: ResourceType; deltaPct: number; total: number; change: number; changePct: number | null }> }
}
export type Deviations = {
  baseCurrency: string
  impactDirect: number
  impactTotal: number
  itemsAffected: number
  items: Array<{ itemId: string; code: string; description: string; unit: string; quantity: number; frozenUnitPrice: number | null; currentUnitPrice: number | null; diff: number | null; diffPct: number | null; impact: number | null }>
}

export type ValuationRow = { id: string; number: number; periodStart: string; periodEnd: string; status: 'DRAFT' | 'APPROVED'; approvedAt: string | null; direct: number; total: number; lineCount: number }
export type ValuationList = { budgetStatus: BudgetStatus; progressPct: number | null; executedDirect: number; executedTotal: number; items: ValuationRow[] }
export type ValuationDetail = {
  id: string
  number: number
  periodStart: string
  periodEnd: string
  status: 'DRAFT' | 'APPROVED'
  note: string | null
  approvedAt: string | null
  lines: Array<{ itemId: string; code: string; description: string; unit: string; contractQuantity: number; previousQuantity: number; quantity: number; cumulativeQuantity: number; unitPrice: number | null; amount: number | null }>
  totals: Totals
}

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
const base = (slug: string | undefined) => `/plants/${slug}/budgets`

// Todo cuelga de ['plant', slug, 'budget', …]: un cambio de precios afecta APU, borradores, análisis y tablero.
const key = (slug: string | undefined, ...rest: unknown[]) => ['plant', slug, 'budget', ...rest]

export const useBudgetSummary = (slug: string | undefined, enabled = true) => useQuery({ queryKey: key(slug, 'summary'), queryFn: () => api<Summary>(`${base(slug)}/summary`), enabled: !!slug && enabled })

export const useResources = (slug: string | undefined, filters: { type?: string; status?: string; search?: string; page?: string }, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: key(slug, 'resources', filters, pageSize),
    queryFn: () => api<Page<Resource> & { baseCurrency: string }>(`${base(slug)}/resources${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })
export const usePriceHistory = (slug: string | undefined, id: string | undefined) => useQuery({ queryKey: key(slug, 'history', id), queryFn: () => api<PriceHistoryRow[]>(`${base(slug)}/resources/${id}/history`), enabled: !!slug && !!id })
export const useExchangeRates = (slug: string | undefined) => useQuery({ queryKey: key(slug, 'rates'), queryFn: () => api<ExchangeRates>(`${base(slug)}/exchange-rates`), enabled: !!slug })

export const useApus = (slug: string | undefined, filters: { status?: string; search?: string; page?: string }, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: key(slug, 'apus', filters, pageSize),
    queryFn: () => api<Page<ApuSummary> & { baseCurrency: string }>(`${base(slug)}/apus${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })
export const useApu = (slug: string | undefined, id: string | undefined) => useQuery({ queryKey: key(slug, 'apu', id), queryFn: () => api<ApuDetail>(`${base(slug)}/apus/${id}`), enabled: !!slug && !!id, retry: false })

export const useProjects = (slug: string | undefined) => useQuery({ queryKey: key(slug, 'projects'), queryFn: () => api<Project[]>(`${base(slug)}/projects`), enabled: !!slug })
export const useBudgets = (slug: string | undefined, filters: { status?: string; projectId?: string; search?: string; page?: string }, pageSize = 25, enabled = true) =>
  useQuery({
    queryKey: key(slug, 'list', filters, pageSize),
    queryFn: () => api<Page<BudgetSummary> & { baseCurrency: string }>(`${base(slug)}${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
  })
export const useBudget = (slug: string | undefined, id: string | undefined) => useQuery({ queryKey: key(slug, 'one', id), queryFn: () => api<BudgetDetail>(`${base(slug)}/${id}`), enabled: !!slug && !!id, retry: false })
export const useScenarios = (slug: string | undefined, id: string | undefined, enabled = true) => useQuery({ queryKey: key(slug, 'scenarios', id), queryFn: () => api<Scenario[]>(`${base(slug)}/${id}/scenarios`), enabled: !!slug && !!id && enabled })
export const useAnalysis = (slug: string | undefined, id: string | undefined, enabled = true) => useQuery({ queryKey: key(slug, 'analysis', id), queryFn: () => api<Analysis>(`${base(slug)}/${id}/analysis`), enabled: !!slug && !!id && enabled, retry: false })
export const useDeviations = (slug: string | undefined, id: string | undefined, enabled = true) => useQuery({ queryKey: key(slug, 'deviations', id), queryFn: () => api<Deviations>(`${base(slug)}/${id}/deviations`), enabled: !!slug && !!id && enabled, retry: false })
export const useValuations = (slug: string | undefined, id: string | undefined, enabled = true) => useQuery({ queryKey: key(slug, 'valuations', id), queryFn: () => api<ValuationList>(`${base(slug)}/${id}/valuations`), enabled: !!slug && !!id && enabled })
export const useValuation = (slug: string | undefined, id: string | undefined, vid: string | undefined) => useQuery({ queryKey: key(slug, 'valuation', id, vid), queryFn: () => api<ValuationDetail>(`${base(slug)}/${id}/valuations/${vid}`), enabled: !!slug && !!id && !!vid, retry: false })

function useInvalidate(slug: string) {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'budget'] })
}
const useMutate = <TIn, TOut>(slug: string, fn: (input: TIn) => Promise<TOut>) => {
  const invalidate = useInvalidate(slug)
  return useMutation({ mutationFn: fn, onSuccess: invalidate })
}

// ----- Recursos y tipos de cambio -----
export type ResourceInput = { code: string; name: string; resourceType: ResourceType; unit: string; unitPrice: number; currency?: string }
export type ResourcePatch = { name?: string; unitPrice?: number; currency?: string; status?: 'ACTIVE' | 'INACTIVE'; note?: string }
export const useCreateResource = (slug: string) => useMutate(slug, (input: ResourceInput) => api<Resource>(`${base(slug)}/resources`, { method: 'POST', ...jsonBody(input) }))
export const useUpdateResource = (slug: string) => useMutate(slug, ({ id, ...input }: { id: string } & ResourcePatch) => api<Resource>(`${base(slug)}/resources/${id}`, { method: 'PATCH', ...jsonBody(input) }))
export const useImportInventory = (slug: string) => useMutate(slug, (input: { itemId: string; resourceType: 'MATERIAL' | 'EQUIPMENT' | 'TRANSPORT'; code?: string }) => api<Resource>(`${base(slug)}/resources/import-inventory`, { method: 'POST', ...jsonBody(input) }))
export const useSetRate = (slug: string) => useMutate(slug, (input: { currency: string; rate: number }) => api<ExchangeRates>(`${base(slug)}/exchange-rates`, { method: 'PUT', ...jsonBody(input) }))
export const useDeleteRate = (slug: string) => useMutate(slug, (currency: string) => api<ExchangeRates>(`${base(slug)}/exchange-rates/${currency}`, { method: 'DELETE' }))

// ----- APU -----
export type ApuInput = { code: string; name: string; unit: string; description?: string; yieldValue: number; hoursPerDay: number }
export type ApuPatch = { name?: string; description?: string | null; yieldValue?: number; hoursPerDay?: number; status?: 'ACTIVE' | 'INACTIVE' }
export const useCreateApu = (slug: string) => useMutate(slug, (input: ApuInput) => api<ApuDetail>(`${base(slug)}/apus`, { method: 'POST', ...jsonBody(input) }))
export const useUpdateApu = (slug: string, id: string) => useMutate(slug, (input: ApuPatch) => api<ApuDetail>(`${base(slug)}/apus/${id}`, { method: 'PATCH', ...jsonBody(input) }))
export const useAddApuLine = (slug: string, id: string) => useMutate(slug, (input: { resourceId: string; quantity: number; wastePct: number }) => api<ApuDetail>(`${base(slug)}/apus/${id}/lines`, { method: 'POST', ...jsonBody(input) }))
export const useUpdateApuLine = (slug: string, id: string) => useMutate(slug, ({ lineId, ...input }: { lineId: string; quantity?: number; wastePct?: number }) => api<ApuDetail>(`${base(slug)}/apus/${id}/lines/${lineId}`, { method: 'PATCH', ...jsonBody(input) }))
export const useDeleteApuLine = (slug: string, id: string) => useMutate(slug, (lineId: string) => api<ApuDetail>(`${base(slug)}/apus/${id}/lines/${lineId}`, { method: 'DELETE' }))

// ----- Proyectos y presupuestos -----
export const useCreateProject = (slug: string) => useMutate(slug, (input: { code: string; name: string; description?: string }) => api<Project>(`${base(slug)}/projects`, { method: 'POST', ...jsonBody(input) }))
export type BudgetInput = { projectId: string; name: string; overheadPct: number; utilityPct: number; taxPct: number }
export const useCreateBudget = (slug: string) => useMutate(slug, (input: BudgetInput) => api<BudgetDetail>(base(slug), { method: 'POST', ...jsonBody(input) }))
export const useUpdateBudget = (slug: string, id: string) => useMutate(slug, (input: Partial<Omit<BudgetInput, 'projectId'>>) => api<BudgetDetail>(`${base(slug)}/${id}`, { method: 'PATCH', ...jsonBody(input) }))
export const useAddChapter = (slug: string, id: string) => useMutate(slug, (input: { code: string; name: string }) => api<BudgetDetail>(`${base(slug)}/${id}/chapters`, { method: 'POST', ...jsonBody(input) }))
export const useUpdateChapter = (slug: string, id: string) => useMutate(slug, ({ chapterId, ...input }: { chapterId: string; name?: string; position?: number }) => api<BudgetDetail>(`${base(slug)}/${id}/chapters/${chapterId}`, { method: 'PATCH', ...jsonBody(input) }))
export const useDeleteChapter = (slug: string, id: string) => useMutate(slug, (chapterId: string) => api<BudgetDetail>(`${base(slug)}/${id}/chapters/${chapterId}`, { method: 'DELETE' }))
export const useAddItem = (slug: string, id: string) => useMutate(slug, (input: { chapterId: string; apuId: string; code: string; description?: string; quantity: number }) => api<BudgetDetail>(`${base(slug)}/${id}/items`, { method: 'POST', ...jsonBody(input) }))
export const useUpdateItem = (slug: string, id: string) =>
  useMutate(slug, ({ itemId, ...input }: { itemId: string; apuId?: string; chapterId?: string; description?: string; quantity?: number }) => api<BudgetDetail>(`${base(slug)}/${id}/items/${itemId}`, { method: 'PATCH', ...jsonBody(input) }))
export const useDeleteItem = (slug: string, id: string) => useMutate(slug, (itemId: string) => api<BudgetDetail>(`${base(slug)}/${id}/items/${itemId}`, { method: 'DELETE' }))
export const useBudgetAction = (slug: string, id: string) => useMutate(slug, (action: 'approve' | 'close' | 'duplicate') => api<BudgetDetail>(`${base(slug)}/${id}/${action}`, { method: 'POST' }))

// ----- Escenarios y valorizaciones -----
export const useCreateScenario = (slug: string, id: string) => useMutate(slug, (input: { name: string; adjustments: Adjustments }) => api<Scenario>(`${base(slug)}/${id}/scenarios`, { method: 'POST', ...jsonBody(input) }))
export const useDeleteScenario = (slug: string, id: string) => useMutate(slug, (scenarioId: string) => api<void>(`${base(slug)}/${id}/scenarios/${scenarioId}`, { method: 'DELETE' }))
export type ValuationInput = { periodStart: string; periodEnd: string; note?: string; lines: Array<{ itemId: string; quantity: number }> }
export const useCreateValuation = (slug: string, id: string) => useMutate(slug, (input: ValuationInput) => api<ValuationDetail>(`${base(slug)}/${id}/valuations`, { method: 'POST', ...jsonBody(input) }))
export const useUpdateValuation = (slug: string, id: string) => useMutate(slug, ({ vid, ...input }: { vid: string } & ValuationInput) => api<ValuationDetail>(`${base(slug)}/${id}/valuations/${vid}`, { method: 'PATCH', ...jsonBody(input) }))
export const useDeleteValuation = (slug: string, id: string) => useMutate(slug, (vid: string) => api<void>(`${base(slug)}/${id}/valuations/${vid}`, { method: 'DELETE' }))
export const useApproveValuation = (slug: string, id: string) => useMutate(slug, (vid: string) => api<ValuationDetail>(`${base(slug)}/${id}/valuations/${vid}/approve`, { method: 'POST' }))
