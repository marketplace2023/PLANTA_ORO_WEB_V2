import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, jsonBody } from '@/lib/api'

export type Member = {
  id: string
  userId: string
  email: string
  firstName: string
  lastName: string
  roleCode: string
  roleName: string
  status: string
  startsAt: string | null
  endsAt: string | null
}

export type AssignableRole = { code: string; name: string; scope: string }

const base = (slug: string) => `/plants/${slug}`

// Cuelgan de ['plant', slug, …] para invalidarse al cambiar de planta.
export const useMembers = (slug: string, enabled = true) =>
  useQuery({ queryKey: ['plant', slug, 'members'], queryFn: () => api<Member[]>(`${base(slug)}/members`), enabled })

export const useAssignableRoles = (slug: string, enabled = true) =>
  useQuery({ queryKey: ['plant', slug, 'members', 'roles'], queryFn: () => api<AssignableRole[]>(`${base(slug)}/members/roles`), enabled, staleTime: 5 * 60_000 })

export function useAssignMember(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; roleCode: string }) => api<Member>(`${base(slug)}/members`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug, 'members'] }),
  })
}

export function useRemoveMember(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) => api<void>(`${base(slug)}/members/${assignmentId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug, 'members'] }),
  })
}

export type StageChange = { sequence?: number; nameOverride?: string | null; isEnabled?: boolean; isPublic?: boolean; mapPosition?: { x: number; y: number } | null }

/** Habilitar una etapa del catálogo en la planta (o volver a habilitarla). */
export function useEnableStage(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { stageCode: string; sequence?: number; nameOverride?: string | null; isPublic?: boolean }) =>
      api(`${base(slug)}/stages`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug] }),
  })
}

export function useUpdateStage(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & StageChange) => api(`${base(slug)}/stages/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug] }),
  })
}

export function useEnableNetwork(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { networkCode: string; isPublic?: boolean }) => api(`${base(slug)}/networks`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug] }),
  })
}

export function useUpdateNetwork(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; isEnabled?: boolean; isPublic?: boolean }) => api(`${base(slug)}/networks/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant', slug] }),
  })
}
