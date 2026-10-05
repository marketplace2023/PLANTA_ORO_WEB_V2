import { useEffect, useState } from 'react'
import { ErrorState } from '@/components/base/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentPreview, type DocumentItem } from '@/features/documents/use-documents'
import { canPreview } from '@/lib/documents'

type Props = {
  slug: string
  doc: Pick<DocumentItem, 'id' | 'title' | 'file'>
  version: number
}

/**
 * Vista previa de PDF e imágenes. El archivo se baja con fetch (lleva el token) y se muestra desde un
 * object URL que se libera al cambiar de documento o cerrar.
 */
export function DocumentPreview({ slug, doc, version }: Props) {
  const previewable = canPreview(doc.file.mimeType)
  const { data: blob, isLoading, isError, refetch } = useDocumentPreview(slug, doc.id, version, previewable)

  // El object URL vive mientras el componente muestra ese blob.
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    // Crear/revocar un object URL es sincronizar con un recurso del navegador (no estado derivado):
    // un useMemo lo revocaría en el doble montaje de StrictMode y dejaría la vista previa rota.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!blob) return setUrl(undefined)
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!previewable) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-fur-gray-600">
        La vista previa no está disponible para este tipo de archivo. Descárgalo para abrirlo.
      </p>
    )
  }
  if (isError) return <ErrorState message="No se pudo cargar la vista previa." onRetry={() => void refetch()} />
  if (isLoading || !url) return <Skeleton className="h-80" aria-label="Cargando vista previa" />

  return doc.file.mimeType === 'application/pdf' ? (
    <iframe title={`Vista previa de ${doc.title}`} src={url} className="h-[60svh] w-full rounded-lg border border-border bg-card" />
  ) : (
    <img src={url} alt={`Vista previa de ${doc.title}`} className="max-h-[60svh] w-full rounded-lg border border-border bg-card object-contain" />
  )
}
