import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type EcosystemDashboard = {
  generatedAt: string
  plants: { total: number; byStatus: Record<string, number>; byVisibility: Record<string, number> }
  users: { total: number; byStatus: Record<string, number>; globalAdmins: number; activeLast30Days: number }
  access: { roles: number; permissions: number; assignments: number }
  catalog: { families: number; types: number; manufacturers: number; models: number }
  masters: { stages: number; networks: number }
  organizations: { providers: { total: number; pending: number }; contractors: { total: number; pending: number } }
  courses: { published: number }
  audit: {
    last24Hours: number
    last7Days: number
    recent: Array<{ id: string; occurredAt: string; module: string; entityType: string; action: string; actor: string | null }>
  }
  health: { database: 'up' | 'down'; latencyMs: number }
  /** null = aún no hay integraciones externas (no disponible; no es cero). */
  integrations: null
}

export const useEcosystemDashboard = (enabled: boolean) =>
  useQuery({ queryKey: ['ecosystem', 'dashboard'], queryFn: () => api<EcosystemDashboard>('/admin/dashboard'), enabled, refetchInterval: 60_000 })
