import { Eye, FileText, FolderOpen, Lock, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { DocumentDetailSheet } from '@/components/documents/document-detail-sheet'
import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAssets } from '@/features/assets/use-assets'
import { useDocuments, type DocumentFilters } from '@/features/documents/use-documents'
import { usePlantStages } from '@/features/plant/use-plant-data'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, DOCUMENT_VISIBILITY_LABELS, formatBytes, iconForMime, typeLabel } from '@/lib/documents'
import { formatDate } from '@/lib/format'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'
import { usePlantOutlet } from './plant-route'

const PAGE_SIZE = 25

/** Documentos de la planta (design.md §40): categorías · listado · vista previa · metadatos · versiones. */
export function DocumentsPage() {
  const plant = usePlantOutlet()
  const [params, setParams] = useSearchParams()
  const [uploading, setUploading] = useState(false)

  const openDoc = params.get('doc') ?? undefined
  const filters: DocumentFilters = Object.fromEntries([...params.entries()].filter(([k, v]) => v !== '' && k !== 'doc'))
  const page = Math.max(1, Number(filters.page) || 1)

  const setParam = (updates: Record<string, string | undefined>, keepPage = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(updates)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced !== (params.get('search') ?? '')) setParam({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const docs = useDocuments(plant.slug, filters, PAGE_SIZE)
  const stages = usePlantStages(plant.slug)
  const assets = useAssets(plant.slug, {}, 100)

  const chips: Chip[] = [
    filters.type && { key: 'type', label: 'Tipo', value: typeLabel(filters.type) },
    filters.stage && { key: 'stage', label: 'Etapa', value: filters.stage },
    filters.assetId && { key: 'assetId', label: 'Activo', value: assets.data?.items.find((a) => a.id === filters.assetId)?.tag ?? '…' },
    filters.status === 'ARCHIVED' && { key: 'status', label: 'Estado', value: 'Archivados' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)

  const clearAll = () => {
    setSearchText('')
    setParam({ type: undefined, stage: undefined, assetId: undefined, status: undefined, search: undefined })
  }

  const data = docs.data

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Manuales, planos, procedimientos y certificados de la planta, con control de versiones."
        actions={
          <PermissionGate permission="document.upload">
            <Button onClick={() => setUploading(true)}>
              <Plus /> Subir documento
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        {/* Categorías (carpetas por tipo) */}
        <nav aria-label="Categorías de documentos" className="hidden lg:block">
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => setParam({ type: undefined })}
                aria-current={!filters.type ? 'true' : undefined}
                className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted', !filters.type && 'bg-fur-gold-500/15 font-semibold text-fur-navy-900')}
              >
                <FolderOpen className="size-4" /> Todos
              </button>
            </li>
            {DOCUMENT_TYPES.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => setParam({ type: t })}
                  aria-current={filters.type === t ? 'true' : undefined}
                  className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted', filters.type === t && 'bg-fur-gold-500/15 font-semibold text-fur-navy-900')}
                >
                  <FolderOpen className="size-4 text-fur-gray-500" /> {DOCUMENT_TYPE_LABELS[t]}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1 space-y-1">
                <label htmlFor="doc-search" className="text-xs text-fur-gray-600">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
                  <Input id="doc-search" type="search" className="h-10 pl-9" placeholder="Título o nombre de archivo…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
                </div>
              </div>
              <div className="lg:hidden">
                <FilterSelect
                  label="Tipo"
                  value={filters.type ?? ''}
                  onChange={(v) => setParam({ type: v || undefined })}
                  options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }))}
                />
              </div>
              <FilterSelect
                label="Etapa"
                value={filters.stage ?? ''}
                onChange={(v) => setParam({ stage: v || undefined })}
                options={(stages.data ?? []).filter((s) => s.isEnabled).map((s) => ({ value: s.code, label: `${s.code} — ${s.displayName}` }))}
              />
              <FilterSelect
                label="Activo"
                value={filters.assetId ?? ''}
                onChange={(v) => setParam({ assetId: v || undefined })}
                options={(assets.data?.items ?? []).map((a) => ({ value: a.id, label: `${a.tag} — ${a.name}` }))}
              />
              <PermissionGate permission="document.read">
                <FilterSelect
                  label="Estado"
                  value={filters.status ?? ''}
                  onChange={(v) => setParam({ status: v || undefined })}
                  options={[{ value: 'ARCHIVED', label: 'Archivados' }]}
                  allLabel="Activos"
                />
              </PermissionGate>
            </div>
            <FilterChips
              chips={chips}
              onRemove={(key) => {
                if (key === 'search') setSearchText('')
                setParam({ [key]: undefined })
              }}
              onClear={clearAll}
            />
          </div>

          {docs.isError ? (
            <ErrorState onRetry={() => void docs.refetch()} />
          ) : docs.isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Cargando documentos">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : data && data.total === 0 ? (
            chips.length > 0 ? (
              <EmptyState icon={Search} title="Ningún documento coincide con los filtros" description="Prueba con otros criterios o limpia los filtros." action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
            ) : (
              <EmptyState
                icon={FileText}
                title="No hay documentos en esta planta"
                description="Los documentos públicos aparecerán aquí cuando la planta los publique."
                action={
                  <PermissionGate permission="document.upload">
                    <Button onClick={() => setUploading(true)}>
                      <Plus /> Subir el primer documento
                    </Button>
                  </PermissionGate>
                }
              />
            )
          ) : (
            data && (
              <>
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Documento</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Activos</TableHead>
                        <TableHead>Versión</TableHead>
                        <TableHead>Tamaño</TableHead>
                        <TableHead>Actualizado</TableHead>
                        <TableHead>Visibilidad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((d) => {
                        const Icon = iconForMime(d.file.mimeType)
                        return (
                          <TableRow key={d.id} className="cursor-pointer" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('doc', d.id); return n }, { replace: true })}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Icon className="size-5 shrink-0 text-fur-navy-800" aria-hidden />
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    className="text-left font-medium text-fur-navy-900 underline-offset-2 hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setParams((p) => { const n = new URLSearchParams(p); n.set('doc', d.id); return n }, { replace: true })
                                    }}
                                  >
                                    {d.title}
                                  </button>
                                  <div className="truncate text-xs text-fur-gray-600">{d.file.originalName}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{typeLabel(d.documentType)}</TableCell>
                            <TableCell>
                              {d.assets.length === 0 ? '—' : <span className="fur-code">{d.assets.map((a) => a.tag).join(', ')}</span>}
                            </TableCell>
                            <TableCell className="fur-code">v{d.currentVersion}</TableCell>
                            <TableCell>{formatBytes(d.file.sizeBytes)}</TableCell>
                            <TableCell>{formatDate(d.updatedAt)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="gap-1.5 bg-card font-medium text-foreground">
                                {d.visibility === 'PUBLIC' ? <Eye className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
                                {DOCUMENT_VISIBILITY_LABELS[d.visibility]}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, true)} />
              </>
            )
          )}
        </div>
      </div>

      {openDoc && <DocumentDetailSheet slug={plant.slug} documentId={openDoc} onClose={() => setParam({ doc: undefined }, true)} />}
      {uploading && <DocumentUploadDialog open onOpenChange={setUploading} plantSlug={plant.slug} onSaved={(d) => setParam({ doc: d.id }, true)} />}
    </>
  )
}
