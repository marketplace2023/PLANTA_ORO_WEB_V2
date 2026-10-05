import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ALL = '__all__'

type Props = {
  label: string
  /** '' = sin filtro. */
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  allLabel?: string
}

/** Select de filtro con opción "Todos". Radix no admite value vacío, de ahí el centinela interno. */
export function FilterSelect({ label, value, onChange, options, allLabel = 'Todos' }: Props) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="min-w-40 space-y-1">
      <Label htmlFor={id} className="text-xs text-fur-gray-600">
        {label}
      </Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id} className="h-10 w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
