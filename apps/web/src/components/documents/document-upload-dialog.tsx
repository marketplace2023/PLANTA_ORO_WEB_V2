import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAssets } from '@/features/assets/use-assets'
import { useAddDocumentVersion, useUploadDocument, type DocumentDetail } from '@/features/documents/use-documents'
import { usePlantStages } from '@/features/plant/use-plant-data'
import { ApiError } from '@/lib/api'
import {
  ACCEPT_ATTRIBUTE,
  ALLOWED_EXTENSIONS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_VISIBILITIES,
  DOCUMENT_VISIBILITY_LABELS,
  formatBytes,
  type DocumentType,
  type DocumentVisibility,
  validateFile,
  MAX_UPLOAD_BYTES,
} from '@/lib/documents'

const NO_STAGE = '__none__'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  plantSlug: string
  /** Si se pasa un documento, se sube una NUEVA VERSIÓN de él; si no, se crea un documento. */
  document?: DocumentDetail
  /** Vincula el documento nuevo a este activo desde el inicio (p. ej. desde su ficha FUR). */
  defaultAssetId?: string
  onSaved?: (doc: DocumentDetail) => void
}

export function DocumentUploadDialog({ open, onOpenChange, plantSlug, document, defaultAssetId, onSaved }: Props) {
  const isVersion = !!document
  const create = useUploadDocument(plantSlug)
  const addVersion = useAddDocumentVersion(plantSlug, document?.id ?? '')
  const pending = isVersion ? addVersion.isPending : create.isPending

  const stages = usePlantStages(plantSlug)
  const assets = useAssets(plantSlug, {}, 100)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] = useState<DocumentType>('OTRO')
  const [visibility, setVisibility] = useState<DocumentVisibility>('INTERNAL')
  const [assetIds, setAssetIds] = useState<string[]>(defaultAssetId ? [defaultAssetId] : [])
  const [stageCode, setStageCode] = useState(NO_STAGE)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  function onFile(next: File | null) {
    setFile(next)
    // El título sugerido es el nombre del archivo sin extensión (si aún no se escribió uno).
    if (next && !title && !isVersion) setTitle(next.name.replace(/\.[^.]+$/, ''))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setFormError(undefined)

    const next: Record<string, string> = {}
    const fileError = validateFile(file)
    if (fileError) next.file = fileError
    if (!isVersion && !title.trim()) next.title = 'Requerido'
    if (Object.keys(next).length > 0) return setErrors(next)

    try {
      const saved = isVersion
        ? await addVersion.mutateAsync({ file: file!, note: note.trim() || undefined })
        : await create.mutateAsync({
            file: file!,
            title: title.trim(),
            documentType,
            visibility,
            assetIds,
            stageCodes: stageCode === NO_STAGE ? [] : [stageCode],
            note: note.trim() || undefined,
          })
      toast.success(isVersion ? `Versión ${saved.currentVersion} subida` : 'Documento subido')
      onOpenChange(false)
      onSaved?.(saved)
    } catch (err) {
      if (err instanceof ApiError && err.status === 413) setErrors({ file: `El archivo supera el tamaño máximo permitido por el servidor` })
      else if (err instanceof ApiError && err.status === 415) setErrors({ file: err.message })
      else if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else if (err instanceof ApiError && err.status === 403) setFormError('No tienes permiso para esta acción.')
      else setFormError(err instanceof ApiError ? err.message : 'No se pudo subir el archivo. Inténtalo de nuevo.')
    }
  }

  const err = (key: string) =>
    errors[key] && (
      <p id={`${key}-error`} className="text-sm text-fur-red-500">
        {errors[key]}
      </p>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isVersion ? `Nueva versión de «${document.title}»` : 'Subir documento'}</DialogTitle>
          <DialogDescription>
            {isVersion
              ? `Se conservará la versión ${document.currentVersion} actual. Formatos: ${ALLOWED_EXTENSIONS.join(', ')}.`
              : `Formatos permitidos: ${ALLOWED_EXTENSIONS.join(', ')}. Máximo ${formatBytes(MAX_UPLOAD_BYTES)}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="file">Archivo</Label>
            <Input
              id="file"
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="h-auto py-2"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              aria-invalid={!!errors.file}
              aria-describedby={errors.file ? 'file-error' : undefined}
            />
            {file && !errors.file && (
              <p className="text-xs text-fur-gray-600">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
            {err('file')}
          </div>

          {!isVersion && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="title">Título</Label>
                <Input id="title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} />
                {err('title')}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="documentType">Tipo</Label>
                  <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
                    <SelectTrigger id="documentType" className="h-10 w-full" aria-label="Tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {DOCUMENT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="visibility">Visibilidad</Label>
                  <Select value={visibility} onValueChange={(v) => setVisibility(v as DocumentVisibility)}>
                    <SelectTrigger id="visibility" className="h-10 w-full" aria-label="Visibilidad">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_VISIBILITIES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {DOCUMENT_VISIBILITY_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {visibility === 'PUBLIC' && (
                    <p className="text-xs text-fur-gray-600">Los visitantes lo verán solo si la planta publica sus documentos.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stage">Etapa relacionada</Label>
                <Select value={stageCode} onValueChange={setStageCode}>
                  <SelectTrigger id="stage" className="h-10 w-full" aria-label="Etapa relacionada">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STAGE}>Ninguna</SelectItem>
                    {(stages.data ?? []).filter((s) => s.isEnabled).map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.code} — {s.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err('stageCodes')}
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Activos relacionados</legend>
                {assets.isLoading ? (
                  <p className="text-sm text-fur-gray-600">Cargando activos…</p>
                ) : (assets.data?.items.length ?? 0) === 0 ? (
                  <p className="text-sm text-fur-gray-600">No hay activos disponibles para vincular.</p>
                ) : (
                  <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
                    {assets.data!.items.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={assetIds.includes(a.id)}
                          onCheckedChange={(on) => setAssetIds(on ? [...assetIds, a.id] : assetIds.filter((id) => id !== a.id))}
                        />
                        <span className="fur-code">{a.tag}</span>
                        <span className="truncate text-fur-gray-600">{a.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {err('assetIds')}
              </fieldset>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note">{isVersion ? 'Nota de la versión (opcional)' : 'Nota (opcional)'}</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isVersion ? 'Qué cambió en esta versión' : undefined} />
          </div>

          <div role="alert" aria-live="polite">
            {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Subiendo…' : isVersion ? 'Subir versión' : 'Subir documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
