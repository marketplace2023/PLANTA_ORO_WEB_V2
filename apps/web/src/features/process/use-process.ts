import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, jsonBody } from '@/lib/api'

export type FlowType = 'MATERIAL' | 'SOLUTION' | 'WATER' | 'REAGENT'

export type ProcessStage = {
  id: string
  code: string
  name: string
  stageGroup: string
  colorToken: string | null
  sequence: number
  isPublic: boolean
  /** null = no visible para quien consulta (no es lo mismo que cero activos). */
  assetCount: number | null
  statusCounts: Record<string, number> | null
  criticalAssets: number | null
  attentionAssets: number | null
  openWorkOrders: number | null
}

export type StageConnection = { id: string; sourceStageId: string; targetStageId: string; flowType: FlowType; isReturnFlow: boolean }

export type ProcessOverview = {
  stages: ProcessStage[]
  connections: StageConnection[]
  totals: { assets: number; attention: number } | null
}

export type NetworkSummary = {
  id: string
  code: string
  name: string
  description: string | null
  icon: string | null
  colorToken: string | null
  isPublic: boolean
  assetCount: number | null
  statusCounts: Record<string, number> | null
  attentionAssets: number | null
}

export type NetworkDashboard = {
  network: Omit<NetworkSummary, 'assetCount' | 'statusCounts' | 'attentionAssets'>
  assets: {
    total: number
    byStatus: Record<string, number>
    byCriticality: Record<string, number>
    byStage: Array<{ code: string | null; name: string | null; count: number }>
    attention: Array<{ id: string; tag: string; name: string; status: string; criticality: string }>
  } | null
  workOrders?: { open: number; overdue: number } | null
}

// Todo cuelga de ['plant', slug, …] para invalidarse al cambiar de planta.
export const usePlantProcess = (slug: string | undefined) =>
  useQuery({ queryKey: ['plant', slug, 'process'], queryFn: () => api<ProcessOverview>(`/plants/${slug}/process`), enabled: !!slug })

export const useNetworkOverview = (slug: string | undefined) =>
  useQuery({ queryKey: ['plant', slug, 'network-overview'], queryFn: () => api<NetworkSummary[]>(`/plants/${slug}/network-overview`), enabled: !!slug })

export const useNetworkDashboard = (slug: string | undefined, code: string | undefined) =>
  useQuery({
    queryKey: ['plant', slug, 'network-overview', code],
    queryFn: () => api<NetworkDashboard>(`/plants/${slug}/network-overview/${code}`),
    enabled: !!slug && !!code,
    retry: false,
  })

export function useCreateConnection(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { sourceStageId: string; targetStageId: string; flowType: FlowType; isReturnFlow: boolean }) =>
      api<StageConnection>(`/plants/${slug}/process/connections`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug, 'process'] }),
  })
}

export function useDeleteConnection(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/plants/${slug}/process/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug, 'process'] }),
  })
}
