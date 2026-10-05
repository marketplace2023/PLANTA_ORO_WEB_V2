import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@/features/assets/use-assets'
import { api, jsonBody } from '@/lib/api'

export type Tag = { code: string; name: string }
export type OrgStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'
export type Availability = 'IN_STOCK' | 'ON_REQUEST' | 'OUT_OF_STOCK'
export type ContractorAvailability = 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE'
export type ListingStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type Provider = {
  id: string
  organizationName: string
  countryCode: string
  city: string | null
  description: string | null
  logoUrl: string | null
  certifications: string[]
  status: OrgStatus
  verified: boolean
  /** null = sin calificaciones (no se inventa un valor). */
  rating: number | null
  website: string | null
  /** null para anónimos: el correo de contacto solo se muestra con sesión. */
  contactEmail: string | null
  stages: Tag[]
  families: Tag[]
  activeListings: number
}
export type ProviderDetail = Provider & { taxId: string | null; canManage: boolean; myRole: string | null }
export type MyProvider = Provider & { myRole: string }

export type Listing = {
  id: string
  title: string
  description: string | null
  price: number | null
  currency: string
  availability: Availability
  stockText: string | null
  imageUrl: string | null
  status: ListingStatus
  isFeatured: boolean
  createdAt: string
  updatedAt: string
  family: Tag
  type: Tag | null
  model: { id: string; name: string; manufacturer: { id: string; name: string } | null } | null
  provider: { id: string; name: string; verified: boolean; rating: number | null; countryCode: string }
  stages: Tag[]
}

export type Contractor = {
  id: string
  organizationName: string
  countryCode: string
  city: string | null
  description: string | null
  logoUrl: string | null
  certifications: string[]
  availability: ContractorAvailability
  status: OrgStatus
  verified: boolean
  rating: number | null
  website: string | null
  contactEmail: string | null
  stages: Tag[]
  specialties: string[]
}
export type ContractorService = { id: string; name: string; description: string | null; serviceType: string; status: 'ACTIVE' | 'INACTIVE'; stages: Tag[] }
export type ContractorDetail = Contractor & { taxId: string | null; canManage: boolean; myRole: string | null; services: ContractorService[] }
export type MyContractor = Contractor & { myRole: string }

export type ServiceItem = {
  id: string
  name: string
  description: string | null
  serviceType: string
  stages: Tag[]
  contractor: { id: string; name: string; verified: boolean; rating: number | null; availability: ContractorAvailability; city: string | null; countryCode: string; certifications: string[] }
}

export type OrgMember = { userId: string; email: string; firstName: string; lastName: string; role: 'OWNER' | 'MEMBER'; createdAt: string }
export type ProviderDashboard = { listingsActive: number; listingsDraft: number; listingsArchived: number; featured: number; onRequestPricing: number }

export type Filters = Record<string, string | undefined>

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

// Todo cuelga de ['org', …]: son datos globales (no dependen de la planta) y se invalidan juntos al editar.
export const useListings = (filters: Filters, pageSize = 12) =>
  useQuery({
    queryKey: ['org', 'listings', filters, pageSize],
    queryFn: () => api<Page<Listing>>(`/marketplace/listings${toQuery({ ...filters, pageSize })}`),
    placeholderData: keepPreviousData,
  })

export const useListing = (id: string | undefined) =>
  useQuery({ queryKey: ['org', 'listing', id], queryFn: () => api<Listing>(`/marketplace/listings/${id}`), enabled: !!id, retry: false })

export const useProviders = (filters: Filters, pageSize = 12) =>
  useQuery({
    queryKey: ['org', 'providers', filters, pageSize],
    queryFn: () => api<Page<Provider>>(`/providers${toQuery({ ...filters, pageSize })}`),
    placeholderData: keepPreviousData,
  })

export const useProvider = (id: string | undefined) =>
  useQuery({ queryKey: ['org', 'provider', id], queryFn: () => api<ProviderDetail>(`/providers/${id}`), enabled: !!id, retry: false })

export const useMyProviders = (enabled: boolean) =>
  useQuery({ queryKey: ['org', 'mine', 'providers'], queryFn: () => api<MyProvider[]>('/providers/mine'), enabled, staleTime: 60_000 })

export const useProviderDashboard = (id: string | undefined) =>
  useQuery({ queryKey: ['org', 'provider', id, 'dashboard'], queryFn: () => api<ProviderDashboard>(`/providers/${id}/dashboard`), enabled: !!id })

export const useProviderListings = (id: string | undefined, filters: Filters, pageSize = 25) =>
  useQuery({
    queryKey: ['org', 'provider', id, 'listings', filters, pageSize],
    queryFn: () => api<Page<Listing>>(`/providers/${id}/listings${toQuery({ ...filters, pageSize })}`),
    enabled: !!id,
    placeholderData: keepPreviousData,
  })

export const useContractors = (filters: Filters, pageSize = 12) =>
  useQuery({
    queryKey: ['org', 'contractors', filters, pageSize],
    queryFn: () => api<Page<Contractor>>(`/contractors${toQuery({ ...filters, pageSize })}`),
    placeholderData: keepPreviousData,
  })

export const useContractor = (id: string | undefined) =>
  useQuery({ queryKey: ['org', 'contractor', id], queryFn: () => api<ContractorDetail>(`/contractors/${id}`), enabled: !!id, retry: false })

export const useMyContractors = (enabled: boolean) =>
  useQuery({ queryKey: ['org', 'mine', 'contractors'], queryFn: () => api<MyContractor[]>('/contractors/mine'), enabled, staleTime: 60_000 })

export const useServices = (filters: Filters, pageSize = 12) =>
  useQuery({
    queryKey: ['org', 'services', filters, pageSize],
    queryFn: () => api<Page<ServiceItem>>(`/professional-services${toQuery({ ...filters, pageSize })}`),
    placeholderData: keepPreviousData,
  })

export const useSpecialties = () => useQuery({ queryKey: ['org', 'specialties'], queryFn: () => api<string[]>('/professional-services/specialties'), staleTime: 5 * 60_000 })

export const useMembers = (kind: 'providers' | 'contractors', id: string | undefined) =>
  useQuery({ queryKey: ['org', kind, id, 'members'], queryFn: () => api<OrgMember[]>(`/${kind}/${id}/members`), enabled: !!id, retry: false })

function useInvalidateOrgs() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['org'] })
}

// ----- Proveedores -----
export type ProviderInput = {
  organizationName: string
  taxId?: string
  countryCode: string
  city?: string
  description?: string
  website?: string
  contactEmail?: string
  certifications?: string[]
  stageCodes?: string[]
  familyCodes?: string[]
  ownerEmail?: string
}

export function useCreateProvider() {
  const invalidate = useInvalidateOrgs()
  return useMutation({ mutationFn: (input: ProviderInput) => api<ProviderDetail>('/providers', { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export type ProviderPatch = Partial<Omit<ProviderInput, 'ownerEmail' | 'taxId' | 'city' | 'description' | 'website' | 'contactEmail'>> & {
  taxId?: string | null
  city?: string | null
  description?: string | null
  website?: string | null
  contactEmail?: string | null
  status?: OrgStatus
  verified?: boolean
  rating?: number | null
}

export function useUpdateProvider(id: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({ mutationFn: (input: ProviderPatch) => api<ProviderDetail>(`/providers/${id}`, { method: 'PATCH', ...jsonBody(input) }), onSuccess: invalidate })
}

export type ListingInput = {
  title: string
  description?: string
  price?: number
  currency?: string
  availability?: Availability
  stockText?: string
  stageCodes?: string[]
  assetModelId?: string
  assetFamilyCode?: string
}
export type ListingPatch = Partial<Omit<ListingInput, 'description' | 'price' | 'stockText' | 'assetModelId'>> & {
  description?: string | null
  price?: number | null
  stockText?: string | null
  assetModelId?: string | null
  status?: ListingStatus
  isFeatured?: boolean
}

export function useCreateListing(providerId: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({ mutationFn: (input: ListingInput) => api<Listing>(`/providers/${providerId}/listings`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export function useUpdateListing(providerId: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ListingPatch) => api<Listing>(`/providers/${providerId}/listings/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

// ----- Contratistas -----
export type ContractorInput = Omit<ProviderInput, 'stageCodes' | 'familyCodes'> & { availability?: ContractorAvailability }
export type ContractorPatch = Omit<ProviderPatch, 'stageCodes' | 'familyCodes'> & { availability?: ContractorAvailability }

export function useCreateContractor() {
  const invalidate = useInvalidateOrgs()
  return useMutation({ mutationFn: (input: ContractorInput) => api<ContractorDetail>('/contractors', { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export function useUpdateContractor(id: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({ mutationFn: (input: ContractorPatch) => api<ContractorDetail>(`/contractors/${id}`, { method: 'PATCH', ...jsonBody(input) }), onSuccess: invalidate })
}

export type ServiceInput = { name: string; description?: string; serviceType: string; stageCodes?: string[] }

export function useCreateService(contractorId: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({ mutationFn: (input: ServiceInput) => api<ContractorDetail>(`/contractors/${contractorId}/services`, { method: 'POST', ...jsonBody(input) }), onSuccess: invalidate })
}

export function useUpdateService(contractorId: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<ServiceInput> & { status?: 'ACTIVE' | 'INACTIVE' }) =>
      api<ContractorDetail>(`/contractors/${contractorId}/services/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

// ----- Miembros (proveedores y contratistas) -----
export function useAddMember(kind: 'providers' | 'contractors', id: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: (input: { email: string; role: 'OWNER' | 'MEMBER' }) => api<OrgMember[]>(`/${kind}/${id}/members`, { method: 'POST', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useRemoveMember(kind: 'providers' | 'contractors', id: string) {
  const invalidate = useInvalidateOrgs()
  return useMutation({ mutationFn: (userId: string) => api<void>(`/${kind}/${id}/members/${userId}`, { method: 'DELETE' }), onSuccess: invalidate })
}
