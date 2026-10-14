import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type StageMaster = {
  id: string
  code: string
  name: string
  sequenceDefault: number
  description: string | null
  stageGroup: string
  colorToken: string | null
  /** Ruta (relativa a la API) de la imagen del layout de la etapa; usar con `apiUrl`. null = sin imagen. */
  layoutImageUrl: string | null
}

export type NetworkMaster = {
  id: string
  code: string
  name: string
  description: string | null
  icon: string | null
  colorToken: string | null
  /** Ruta (relativa a la API) de la imagen de la red; usar con `apiUrl`. null = sin imagen. */
  layoutImageUrl: string | null
}

export type HealthStatus = {
  status: 'ok' | 'degraded'
  service: string
  database: 'up' | 'down'
  timestamp: string
}

// Catálogos globales: no dependen de la planta, por eso no llevan la clave ['plant'].
export const useStageCatalog = () =>
  useQuery({ queryKey: ['catalog', 'stages'], queryFn: () => api<StageMaster[]>('/stages/catalog'), staleTime: 5 * 60_000 })

export const useNetworkCatalog = () =>
  useQuery({ queryKey: ['catalog', 'networks'], queryFn: () => api<NetworkMaster[]>('/networks/catalog'), staleTime: 5 * 60_000 })

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => api<HealthStatus>('/health'), refetchInterval: 30_000, retry: false })
