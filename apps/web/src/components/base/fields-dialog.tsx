import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'

export type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'json' | 'checkbox' | 'datetime'
export type Field = {
  name: string
  label: string
  type?: FieldType
  options?: Array<{ value: string; label: string }>
  required?: boolean
  help?: string
  placeholder?: string
  /** Para `select`: permite dejar el campo vacío con esta etiqueta (p. ej. "Sin fabricante"). */
  emptyLabel?: string
  min?: number
  step?: number
}
export type FieldValues = Record<string, string | boolean>

const EMPTY = '__empty__'

type Props = {
  title: string
  description?: string
  fields: Field[]
  initial?: FieldValues
  submitLabel: string
  onClose: () => void
  /** Lanzar un ApiError mapea los errores por campo bajo cada input; otro error se muestra como mensaje general. */
  onSubmit: (values: FieldValues) => Promise<unknown>
  /** Contenido adicional dentro del formulario, tras los campos (p. ej. un selector de archivo). */
  extra?: React.ReactNode
}

/** Formulario modal genérico: valida obligatorios/JSON/números en el cliente y muestra los errores del servidor por campo. */
export function FieldsDialog({ title, description, fields, initial = {}, submitLabel, onClose, onSubmit, extra }: Props) {
  const [values, setValues] = useState<FieldValues>(() => Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? (f.type === 'checkbox' ? false : f.type === 'json' ? '{}' : '')])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const set = (name: string, value: string | boolean) => setValues((v) => ({ ...v, [name]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    for (const f of fields) {
      const v = values[f.name]
      if (f.required && (v === '' || v === undefined)) next[f.name] = 'Requerido'
      if (f.type === 'number' && v !== '' && !Number.isFinite(Number(v))) next[f.name] = 'Debe ser un número'
      if (f.type === 'json') {
        try {
          const parsed = JSON.parse(String(v || '{}'))
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) next[f.name] = 'Debe ser un objeto JSON, p. ej. {"clave": "valor"}'
        } catch {
          next[f.name] = 'JSON inválido'
        }
      }
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else if (err instanceof ApiError && err.status === 403) setErrors({ _form: 'No tienes permiso para esta acción.' })
      else if (err instanceof ApiError && err.status === 409) setErrors({ _form: err.message })
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {fields.map((f) => {
            const id = `field-${f.name}`
            const type = f.type ?? 'text'
            const invalid = !!errors[f.name]
            return (
              <div key={f.name} className="space-y-1.5">
                {type === 'checkbox' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={values[f.name] === true} onCheckedChange={(on) => set(f.name, on === true)} />
                    {f.label}
                  </label>
                ) : (
                  <Label htmlFor={id}>{f.label}</Label>
                )}

                {type === 'select' ? (
                  <Select value={String(values[f.name] || '') || (f.emptyLabel ? EMPTY : '')} onValueChange={(v) => set(f.name, v === EMPTY ? '' : v)}>
                    <SelectTrigger id={id} className="h-10 w-full" aria-label={f.label} aria-invalid={invalid}>
                      <SelectValue placeholder="Selecciona…" />
                    </SelectTrigger>
                    <SelectContent>
                      {f.emptyLabel && <SelectItem value={EMPTY}>{f.emptyLabel}</SelectItem>}
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : type === 'textarea' || type === 'json' ? (
                  <Textarea id={id} value={String(values[f.name])} placeholder={f.placeholder} className={type === 'json' ? 'fur-code min-h-24' : undefined} onChange={(e) => set(f.name, e.target.value)} aria-invalid={invalid} />
                ) : type === 'checkbox' ? null : (
                  <Input
                    id={id}
                    type={type === 'number' ? 'number' : type === 'datetime' ? 'datetime-local' : 'text'}
                    min={f.min}
                    step={f.step}
                    className="h-10"
                    value={String(values[f.name])}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                    aria-invalid={invalid}
                  />
                )}
                {f.help && !invalid && <p className="text-xs text-fur-gray-600">{f.help}</p>}
                {invalid && <p className="text-sm text-fur-red-500">{errors[f.name]}</p>}
              </div>
            )
          })}

          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>

          {extra}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
