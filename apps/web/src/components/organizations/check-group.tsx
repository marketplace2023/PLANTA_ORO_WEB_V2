import { Checkbox } from '@/components/ui/checkbox'

type Props = {
  legend: string
  options: Array<{ value: string; label: string }>
  value: string[]
  onChange: (value: string[]) => void
  error?: string
  help?: string
}

/** Selección múltiple como grupo de casillas (etapas, familias). */
export function CheckGroup({ legend, options, value, onChange, error, help }: Props) {
  const toggle = (v: string, on: boolean) => onChange(on ? [...value, v] : value.filter((x) => x !== v))
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <Checkbox checked={value.includes(o.value)} onCheckedChange={(on) => toggle(o.value, on === true)} />
            {o.label}
          </label>
        ))}
      </div>
      {help && !error && <p className="text-xs text-fur-gray-600">{help}</p>}
      {error && <p className="text-sm text-fur-red-500">{error}</p>}
    </fieldset>
  )
}
