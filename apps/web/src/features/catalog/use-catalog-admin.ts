import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, formBody, jsonBody } from '@/lib/api'

export type CatalogType = { id: string; code: string; name: string; familyCode: string; familyName: string }

export const useCatalogTypes = () => useQuery({ queryKey: ['catalog', 'types'], queryFn: () => api<CatalogType[]>('/catalog/types'), staleTime: 60_000 })

/** Cualquier cambio en el catálogo invalida todo lo que cuelga de ['catalog']. */
function useCatalogMutation<T, V>(fn: (v: V) => Promise<T>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog'] }) })
}

const send = <T>(method: 'POST' | 'PATCH', path: string, body: unknown) => api<T>(path, { method, ...jsonBody(body) })

export const useCreateFamily = () => useCatalogMutation((v: { code: string; name: string; description?: string; icon?: string }) => send('POST', '/catalog/families', v))
export const useUpdateFamily = () => useCatalogMutation(({ id, ...v }: { id: string; name?: string; description?: string | null; icon?: string | null }) => send('PATCH', `/catalog/families/${id}`, v))
export const useCreateType = () => useCatalogMutation((v: { familyCode: string; code: string; name: string; description?: string }) => send('POST', '/catalog/types', v))
export const useUpdateType = () => useCatalogMutation(({ id, ...v }: { id: string; name?: string; familyCode?: string; description?: string | null }) => send('PATCH', `/catalog/types/${id}`, v))
export const useCreateManufacturer = () => useCatalogMutation((v: { name: string; countryCode?: string; website?: string }) => send('POST', '/catalog/manufacturers', v))
export const useUpdateManufacturer = () => useCatalogMutation(({ id, ...v }: { id: string; name?: string; countryCode?: string | null; website?: string | null }) => send('PATCH', `/catalog/manufacturers/${id}`, v))
export const useCreateModel = () =>
  useCatalogMutation((v: { typeCode: string; manufacturerId?: string; modelName: string; specifications?: Record<string, unknown> }) => send<{ id: string }>('POST', '/catalog/models', v))
export const useUpdateModel = () =>
  useCatalogMutation(({ id, ...v }: { id: string; modelName?: string; manufacturerId?: string | null; specifications?: Record<string, unknown>; status?: 'ACTIVE' | 'INACTIVE' }) => send('PATCH', `/catalog/models/${id}`, v))

/** Foto del modelo (solo administrador). Reemplaza la anterior si ya había una. */
export const useUploadModelImage = () => useCatalogMutation(({ id, file }: { id: string; file: File }) => api<{ id: string; imageUrl: string }>(`/catalog/models/${id}/image`, { method: 'POST', ...formBody({}, file) }))
export const useRemoveModelImage = () => useCatalogMutation((id: string) => api<void>(`/catalog/models/${id}/image`, { method: 'DELETE' }))
