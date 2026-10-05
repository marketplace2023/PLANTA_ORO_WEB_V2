import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCatalogFamilies } from '@/features/assets/use-assets'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useCreateListing, useUpdateListing, type Availability, type Listing } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'
import { AVAILABILITY_LABELS } from '@/lib/organizations'
import { CheckGroup } from './check-group'

const CURRENCIES = ['USD', 'PEN', 'CLP', 'ARS', 'EUR']

/** Alta o edición de un producto. Siempre se guarda como borrador; se publica desde la lista (exige una etapa). */
export function ListingFormDialog({ providerId, listing, onClose }: { providerId: string; listing?: Listing; onClose: () => void }) {
  const create = useCreateListing(providerId)
  const update = useUpdateListing(providerId)
  const stages = useStageCatalog()
  const families = useCatalogFamilies()

  const [title, setTitle] = useState(listing?.title ?? '')
  const [description, setDescription] = useState(listing?.description ?? '')
  const [family, setFamily] = useState(listing?.family.code ?? '')
  const [price, setPrice] = useState(listing?.price === null || listing === undefined ? '' : String(listing.price))
  const [currency, setCurrency] = useState(listing?.currency ?? 'USD')
  const [availability, setAvailability] = useState<Availability>(listing?.availability ?? 'ON_REQUEST')
  const [stockText, setStockText] = useState(listing?.stockText ?? '')
  const [imageUrl, setImageUrl] = useState(listing?.imageUrl ?? '')
  const [stageCodes, setStageCodes] = useState<string[]>(listing?.stages.map((s) => s.code) ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Requerido'
    if (!family) next.assetFamilyCode = 'Requerido'
    if (price !== '' && !(Number(price) >= 0)) next.price = 'Debe ser un número mayor o igual a cero'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    try {
      if (listing) {
        await update.mutateAsync({
          id: listing.id,
          title: title.trim(),
          description: description.trim() || null,
          assetFamilyCode: family,
          price: price === '' ? null : Number(price),
          currency,
          availability,
          stockText: stockText.trim() || null,
          imageUrl: imageUrl.trim() || null,
          stageCodes,
        } as never)
      } else {
        await create.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          assetFamilyCode: family,
          price: price === '' ? undefined : Number(price),
          currency,
          availability,
          stockText: stockText.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          stageCodes,
        } as never)
      }
      toast.success(listing ? 'Producto actualizado' : 'Producto creado como borrador')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  const err = (k: string) => errors[k] && <p className="text-sm text-fur-red-500">{errors[k]}</p>

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{listing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>Déjalo sin precio para publicarlo «a cotizar».</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="lf-title">Título</Label>
            <Input id="lf-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
            {err('title')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-desc">Descripción</Label>
            <Textarea id="lf-desc" value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!errors.description} />
            {err('description')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lf-family">Familia</Label>
              <Select value={family} onValueChange={setFamily}>
                <SelectTrigger id="lf-family" className="h-10 w-full" aria-label="Familia" aria-invalid={!!errors.assetFamilyCode}>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {(families.data ?? []).map((f) => (
                    <SelectItem key={f.code} value={f.code}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('assetFamilyCode')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-avail">Disponibilidad</Label>
              <Select value={availability} onValueChange={(v) => setAvailability(v as Availability)}>
                <SelectTrigger id="lf-avail" className="h-10 w-full" aria-label="Disponibilidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-price">Precio</Label>
              <Input id="lf-price" type="number" min={0} step={0.01} className="h-10" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!!errors.price} />
              {err('price')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-cur">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="lf-cur" className="h-10 w-full" aria-label="Moneda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-stock">Stock comercial</Label>
              <Input id="lf-stock" className="h-10" placeholder="40 unidades" value={stockText} onChange={(e) => setStockText(e.target.value)} aria-invalid={!!errors.stockText} />
              {err('stockText')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-img">Imagen (URL)</Label>
              <Input id="lf-img" className="h-10" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} aria-invalid={!!errors.imageUrl} />
              {err('imageUrl')}
            </div>
          </div>
          <CheckGroup
            legend="Etapas relacionadas"
            options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
            value={stageCodes}
            onChange={setStageCodes}
            error={errors.stageCodes}
            help="Para publicar el producto necesitas al menos una etapa."
          />
          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : listing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
