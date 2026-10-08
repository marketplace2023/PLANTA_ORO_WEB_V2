import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, jsonBody } from '@/lib/api'
import type { PlantSummary } from './plant-context'

/** Posición en porcentaje (0–100) sobre la imagen del mapa. */
export type MapPosition = { x: number; y: number }

export type PlantDetail = PlantSummary & {
  settings: { publicDashboard: boolean; publicProcesses: boolean; publicAssets: boolean; publicDocuments: boolean } | null
  /** Rol y permisos de quien consulta en esta planta. */
  access: { roles: string[]; permissions: string[] }
}

export type PlantStage = {
  id: string
  code: string
  name: string
  displayName: string
  stageGroup: string
  colorToken: string | null
  sequence: number
  isEnabled: boolean
  isPublic: boolean
  /** Posición de la etapa sobre el mapa de la planta (% del ancho y del alto de la imagen); null = sin ubicar. */
  mapPosition: MapPosition | null
}

export type PlantNetwork = {
  id: string
  code: string
  name: string
  colorToken: string | null
  isEnabled: boolean
  isPublic: boolean
}

// Todo lo que depende de la planta cuelga de la clave ['plant', slug, …] para invalidarse al cambiar de planta.
export const usePlantDetail = (slug: string | undefined) =>
  useQuery({
    queryKey: ['plant', slug, 'detail'],
    queryFn: () => api<PlantDetail>(`/plants/${slug}`),
    enabled: !!slug,
    retry: false,
  })

export const usePlantStages = (slug: string | undefined) =>
  useQuery({ queryKey: ['plant', slug, 'stages'], queryFn: () => api<PlantStage[]>(`/plants/${slug}/stages`), enabled: !!slug })

export const usePlantNetworks = (slug: string | undefined) =>
  useQuery({ queryKey: ['plant', slug, 'networks'], queryFn: () => api<PlantNetwork[]>(`/plants/${slug}/networks`), enabled: !!slug })

export type PlantInput = {
  code: string
  name: string
  description?: string
  visibility: PlantSummary['visibility']
}

export function useCreatePlant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PlantInput) => api<PlantSummary>('/plants', { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plants'] }),
  })
}

export function useUpdatePlant(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Omit<PlantInput, 'code'>>) =>
      api<PlantSummary>(`/plants/${slug}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plants'] })
      void queryClient.invalidateQueries({ queryKey: ['plant', slug] })
    },
  })
}
