import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, jsonBody } from '@/lib/api'

export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type AccessRequest = {
  id: string
  status: AccessRequestStatus
  message: string | null
  decisionNote: string | null
  createdAt: string
  plantSlug: string
}

const KEY = ['plant-access-requests', 'mine'] as const

/** Solicitudes de acceso de la persona (todas las plantas). Solo con sesión. */
export const useMyAccessRequests = (enabled = true) =>
  useQuery({ queryKey: KEY, queryFn: () => api<AccessRequest[]>('/plant-access-requests/mine'), enabled })

export function useRequestAccess() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plant: string; message?: string }) => api<AccessRequest>('/plant-access-requests', { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}
