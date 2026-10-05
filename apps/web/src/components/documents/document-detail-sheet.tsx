import { Archive, Download, History, Pencil, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchDocumentBlob, useArchiveDocument, useDocument, type DocumentDetail } from '@/features/documents/use-documents'
import { ApiError } from '@/lib/api'
import { DOCUMENT_VISIBILITY_LABELS, formatBytes, saveBlob, typeLabel } from '@/lib/documents'
import { formatDateTime } from '@/lib/format'
import { DocumentEditDialog } from './document-edit-dialog'
import { DocumentPreview } from './document-preview'
import { DocumentUploadDialog } from './document-upload-dialog'

type Props = { slug: string; documentId: string; onClose: () => void }

/** Botón de descarga autenticada: baja el Blob con el token y lo guarda con el nombre original. */
export function DownloadButton({ slug, id, version, fileName, label = 'Descargar', variant = 'secondary', size = 'sm' }: {
  slug: string
  id: string
  version?: number
  fileName: string
  label?: string
  variant?: 'secondary' | 'ghost' | 'default'
  size?: 'sm' | 'default'
}) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      saveBlob(await fetchDocumentBlob(slug, id, { version }), fileName)
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 404 ? 'El archivo ya no está disponible.' : 'No se pudo descargar el archivo.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant={variant} size={size} onClick={() => void download()} disabled={busy} aria-label={`${label} ${fileName}`}>
      <Download /> {busy ? 'Descargando…' : label}
    </Button>
  )
}

function ArchiveDialog({ slug, doc, onClose, onDone }: { slug: string; doc: DocumentDetail; onClose: () => void; onDone: () => void }) {
  const archive = useArchiveDocument(slug, doc.id)
  const [error, setError] = useState<string>()
  async function confirm() {
    setError(undefined)
    try {
      await archive.mutateAsync()
      toast.success('Documento archivado')
      onDone()
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'No tienes permiso para archivar documentos.' : 'No se pudo archivar el documento.')
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Archivar «{doc.title}»?</DialogTitle>
          <DialogDescription>Dejará de mostrarse en los listados. Sus archivos, versiones y registro de auditoría se conservan.</DialogDescription>
        </DialogHeader>
        <div role="alert" aria-live="polite">
          {error && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={archive.isPending}>
            {archive.isPending ? 'Archivando…' : 'Archivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DocumentDetailSheet({ slug, documentId, onClose }: Props) {
  const { data: doc, isLoading, isError, error, refetch } = useDocument(slug, documentId)
  const [dialog, setDialog] = useState<'edit' | 'version' | 'archive' | null>(null)
  const archived = doc?.status === 'ARCHIVED'

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{doc?.title ?? 'Documento'}</SheetTitle>
          <SheetDescription>{doc ? `${typeLabel(doc.documentType)} · versión ${doc.currentVersion}` : 'Detalle del documento'}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-10" />
              <Skeleton className="h-64" />
            </div>
          ) : error instanceof ApiError && error.status === 404 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fur-gray-600">
              El documento no existe o no es visible para tu cuenta.
            </p>
          ) : isError || !doc ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{DOCUMENT_VISIBILITY_LABELS[doc.visibility]}</Badge>
                {archived && <Badge variant="outline">Archivado</Badge>}
                <DownloadButton slug={slug} id={doc.id} fileName={doc.file.originalName} label="Descargar" />
                {!archived && (
                  <>
                    <PermissionGate permission="document.upload">
                      <Button variant="secondary" size="sm" onClick={() => setDialog('version')}>
                        <Upload /> Nueva versión
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setDialog('edit')}>
                        <Pencil /> Editar
                      </Button>
                    </PermissionGate>
                    <PermissionGate permission="document.delete">
                      <Button variant="ghost" size="sm" onClick={() => setDialog('archive')}>
                        <Archive /> Archivar
                      </Button>
                    </PermissionGate>
                  </>
                )}
              </div>

              <DocumentPreview slug={slug} doc={doc} version={doc.currentVersion} />

              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Archivo</dt>
                  <dd className="text-sm break-all">{doc.file.originalName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Tamaño</dt>
                  <dd className="text-sm">{formatBytes(doc.file.sizeBytes)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Actualizado</dt>
                  <dd className="text-sm">{formatDateTime(doc.updatedAt)}</dd>
                </div>
                {doc.createdBy !== undefined && (
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Creado por</dt>
                    <dd className="text-sm">{doc.createdBy ?? '—'}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Activos</dt>
                  <dd className="flex flex-wrap gap-x-3 text-sm">
                    {doc.assets.length === 0 ? '—' : doc.assets.map((a) => (
                      <Link key={a.id} to={`/plants/${slug}/assets/${a.id}`} className="fur-code underline-offset-2 hover:underline">
                        {a.tag}
                      </Link>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">Etapas</dt>
                  <dd className="flex flex-wrap gap-x-3 text-sm">
                    {doc.stages.length === 0 ? '—' : doc.stages.map((s) => (
                      <span key={s.code}>
                        <span className="fur-code">{s.code}</span> {s.name}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>

              <section aria-labelledby="versions-title">
                <h3 id="versions-title" className="mb-3 flex items-center gap-2 text-base font-semibold text-fur-navy-900">
                  <History className="size-4" /> Versiones
                </h3>
                <ol className="space-y-3">
                  {doc.versions.map((v) => (
                    <li key={v.version} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="fur-code">v{v.version}</span>
                        {v.isCurrent && <Badge variant="secondary">Vigente</Badge>}
                        <span className="text-sm">{v.originalName}</span>
                        <span className="ml-auto flex items-center gap-2 text-xs text-fur-gray-600">
                          {formatBytes(v.sizeBytes)}
                          <DownloadButton slug={slug} id={doc.id} version={v.version} fileName={v.originalName} label={`Descargar v${v.version}`} variant="ghost" />
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-fur-gray-600">
                        {formatDateTime(v.createdAt)}
                        {v.uploadedBy && ` · ${v.uploadedBy}`}
                      </p>
                      {v.note && <p className="mt-1 text-sm">{v.note}</p>}
                    </li>
                  ))}
                </ol>
                {doc.versions.length === 1 && doc.createdBy === undefined && (
                  <p className="mt-2 text-xs text-fur-gray-600">Los visitantes ven solo la versión vigente.</p>
                )}
              </section>

              {dialog === 'edit' && <DocumentEditDialog open onOpenChange={(o) => !o && setDialog(null)} plantSlug={slug} document={doc} />}
              {dialog === 'version' && <DocumentUploadDialog open onOpenChange={(o) => !o && setDialog(null)} plantSlug={slug} document={doc} />}
              {dialog === 'archive' && (
                <ArchiveDialog
                  slug={slug}
                  doc={doc}
                  onClose={() => setDialog(null)}
                  onDone={() => {
                    setDialog(null)
                    onClose()
                  }}
                />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
