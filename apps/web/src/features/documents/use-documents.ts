import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiBlob, formBody, jsonBody } from '@/lib/api'
import type { DocumentType, DocumentVisibility } from '@/lib/documents'
import type { Page } from '@/features/assets/use-assets'

export type DocumentItem = {
  id: string
  title: string
  documentType: DocumentType
  visibility: DocumentVisibility
  status: 'ACTIVE' | 'ARCHIVED'
  currentVersion: number
  createdAt: string
  updatedAt: string
  file: { originalName: string; mimeType: string; sizeBytes: number }
  assets: Array<{ id: string; tag: string; name: string }>
  stages: Array<{ code: string; name: string }>
}

export type DocumentVersion = {
  version: number
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  isCurrent: boolean
  // Solo para personal con document.read:
  checksum?: string
  note?: string | null
  uploadedBy?: string | null
}

export type DocumentDetail = DocumentItem & { createdBy?: string | null; versions: DocumentVersion[] }

/** Filtros del listado; viven en la URL (design.md §13), por eso son strings. */
export type DocumentFilters = { type?: string; assetId?: string; stage?: string; search?: string; status?: string; page?: string; sort?: string; dir?: string }

const toQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

// Todo cuelga de ['plant', slug, …] para invalidarse al cambiar de planta.
export const useDocuments = (slug: string | undefined, filters: DocumentFilters, pageSize = 25) =>
  useQuery({
    queryKey: ['plant', slug, 'documents', filters, pageSize],
    queryFn: () => api<Page<DocumentItem>>(`/plants/${slug}/documents${toQuery({ ...filters, pageSize })}`),
    enabled: !!slug,
    placeholderData: keepPreviousData,
  })

export const useDocument = (slug: string | undefined, id: string | undefined) =>
  useQuery({
    queryKey: ['plant', slug, 'document', id],
    queryFn: () => api<DocumentDetail>(`/plants/${slug}/documents/${id}`),
    enabled: !!slug && !!id,
    retry: false,
  })

/** Descarga (o vista previa) como Blob autenticado. */
export const fetchDocumentBlob = (slug: string, id: string, opts: { version?: number; inline?: boolean } = {}) =>
  apiBlob(`/plants/${slug}/documents/${id}/download${toQuery({ inline: opts.inline ? 1 : undefined, version: opts.version })}`)

/** Blob de la vista previa; se cachea por documento y versión. */
export const useDocumentPreview = (slug: string, id: string, version: number, enabled: boolean) =>
  useQuery({
    queryKey: ['plant', slug, 'document', id, 'preview', version],
    queryFn: () => fetchDocumentBlob(slug, id, { version, inline: true }),
    enabled,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  })

export type UploadInput = {
  file: File
  title: string
  documentType: DocumentType
  visibility: DocumentVisibility
  assetIds: string[]
  stageCodes: string[]
  note?: string
}

function useInvalidateDocuments(slug: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'documents'] })
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'document'] })
    // La pestaña Documentos de la ficha FUR cuelga de la ficha del activo.
    void queryClient.invalidateQueries({ queryKey: ['plant', slug, 'asset'] })
  }
}

export function useUploadDocument(slug: string) {
  const invalidate = useInvalidateDocuments(slug)
  return useMutation({
    mutationFn: (input: UploadInput) =>
      api<DocumentDetail>(
        `/plants/${slug}/documents`,
        {
          method: 'POST',
          ...formBody(
            {
              title: input.title,
              documentType: input.documentType,
              visibility: input.visibility,
              assetIds: input.assetIds.join(','),
              stageCodes: input.stageCodes.join(','),
              note: input.note,
            },
            input.file,
          ),
        },
      ),
    onSuccess: invalidate,
  })
}

export function useAddDocumentVersion(slug: string, id: string) {
  const invalidate = useInvalidateDocuments(slug)
  return useMutation({
    mutationFn: ({ file, note }: { file: File; note?: string }) =>
      api<DocumentDetail>(`/plants/${slug}/documents/${id}/versions`, { method: 'POST', ...formBody({ note }, file) }),
    onSuccess: invalidate,
  })
}

export type UpdateDocumentInput = { title?: string; documentType?: DocumentType; visibility?: DocumentVisibility; assetIds?: string[]; stageCodes?: string[] }

export function useUpdateDocument(slug: string, id: string) {
  const invalidate = useInvalidateDocuments(slug)
  return useMutation({
    mutationFn: (input: UpdateDocumentInput) => api<DocumentDetail>(`/plants/${slug}/documents/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: invalidate,
  })
}

export function useArchiveDocument(slug: string, id: string) {
  const invalidate = useInvalidateDocuments(slug)
  return useMutation({
    mutationFn: () => api<void>(`/plants/${slug}/documents/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}
