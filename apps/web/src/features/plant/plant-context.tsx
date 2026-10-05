import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useMatch } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { api } from '@/lib/api'

export type PlantSummary = {
  id: string
  code: string
  name: string
  slug: string
  description: string | null
  countryCode: string | null
  timezone: string
  status: string
  visibility: 'PUBLIC' | 'AUTHENTICATED' | 'PRIVATE'
  logoUrl: string | null
  heroImageUrl: string | null
}

// Docs/arquitectura §32: contexto global de planta.
export type PlantContextValue = {
  currentPlantId: string | null
  currentPlant: PlantSummary | null
  availablePlants: PlantSummary[]
  /** Permisos del usuario en la planta actual (vacío si es anónimo o consumidor sin asignación). */
  permissions: string[]
  roleCodes: string[]
  isLoadingPlants: boolean
  /** La lista de plantas no se pudo cargar (API o base de datos caída): distinto de "no hay plantas visibles". */
  plantsError?: boolean
  reloadPlants?: () => void
  selectPlant: (plantId: string | null) => void
}

const PlantContext = createContext<PlantContextValue | null>(null)

const STORAGE_KEY = 'fur.currentPlantId'

function readStoredPlantId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function PlantProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { status, user, access } = useAuth()
  const [storedPlantId, setStoredPlantId] = useState<string | null>(readStoredPlantId)

  // La clave incluye al usuario: cada identidad ve su propia lista de plantas visibles.
  const { data: availablePlants = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['plants', user?.id ?? 'anonymous'],
    queryFn: () => api<PlantSummary[]>('/plants'),
    enabled: status !== 'loading',
  })

  // La URL manda: /plants/:plantSlug/… fija la planta aunque no haya una guardada.
  const routeSlug = useMatch('/plants/:plantSlug/*')?.params.plantSlug
  const currentPlant =
    (routeSlug
      ? availablePlants.find((p) => p.slug === routeSlug)
      : availablePlants.find((p) => p.id === storedPlantId)) ?? null

  const plantAccess = currentPlant ? access.find((a) => a.plantId === currentPlant.id) : undefined

  const selectPlant = useCallback(
    (plantId: string | null) => {
      setStoredPlantId(plantId)
      try {
        if (plantId) localStorage.setItem(STORAGE_KEY, plantId)
        else localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* almacenamiento no disponible */
      }
      // Cambiar de planta invalida todos los datos dependientes de planta (§32).
      void queryClient.invalidateQueries({ queryKey: ['plant'] })
    },
    [queryClient],
  )

  const value = useMemo<PlantContextValue>(
    () => ({
      currentPlantId: currentPlant?.id ?? null,
      currentPlant,
      availablePlants,
      permissions: plantAccess?.permissions ?? [],
      roleCodes: plantAccess?.roles ?? [],
      isLoadingPlants: isLoading,
      plantsError: isError && availablePlants.length === 0,
      reloadPlants: () => void refetch(),
      selectPlant,
    }),
    [currentPlant, availablePlants, plantAccess, isLoading, isError, refetch, selectPlant],
  )

  return <PlantContext.Provider value={value}>{children}</PlantContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlant() {
  const ctx = useContext(PlantContext)
  if (!ctx) throw new Error('usePlant debe usarse dentro de <PlantProvider>')
  return ctx
}
