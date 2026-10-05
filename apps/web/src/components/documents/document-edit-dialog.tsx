import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdateDocument, type DocumentDetail } from '@/features/documents/use-documents'
import { ApiError } from '@/lib/api'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_VISIBILITIES,
  DOCUMENT_VISIBILITY_LABELS,
  type DocumentType,
  type DocumentVisibility,
} from '@/lib/documents'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; plantSlug: string; document: DocumentDetail }

export function DocumentEditDialog({ open, onOpenChange, plantSlug, document }: Props) {
  const update = useUpdateDocument(plantSlug, document.id)
  const [title, setTitle] = useState(document.title)
  const [documentType, setDocumentType] = useState<DocumentType>(document.documentType)
  const [visibility, setVisibility] = useState<DocumentVisibility>(document.visibility)
  const [error, setError] = useState<string>()
  const [titleError, setTitleError] = useState<string>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setTitleError(undefined)
    if (!title.trim()) return setTitleError('Requerido')
    try {
      await update.mutateAsync({ title: title.trim(), documentType, visibility })
      toast.success('Documento actualizado')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'No tienes permiso para esta acción.' : err instanceof ApiError ? err.message : 'No se pudo guardar.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar documento</DialogTitle>
          <DialogDescription>Para cambiar el archivo, sube una nueva versión.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Título</Label>
            <Input id="edit-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!titleError} />
            {titleError && <p className="text-sm text-fur-red-500">{titleError}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-type">Tipo</Label>
              <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
                <SelectTrigger id="edit-type" className="h-10 w-full" aria-label="Tipo">
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
              <Label htmlFor="edit-visibility">Visibilidad</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as DocumentVisibility)}>
                <SelectTrigger id="edit-visibility" className="h-10 w-full" aria-label="Visibilidad">
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
            </div>
          </div>
          <div role="alert" aria-live="polite">
            {error && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
