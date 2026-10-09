export type VariableType = 'NUMBER' | 'RANGE' | 'TEXT' | 'LIST' | 'BOOLEAN'
export type RangeValue = { min?: number; max?: number }

const num = (n: number) => new Intl.NumberFormat('es', { maximumFractionDigits: 4 }).format(n)

/**
 * Texto de un valor de variable tal como se muestra en la ficha: «600 – 800 t/h», «≤ 700 mm», «120 mm»,
 * «vibración, detección de atascos», «Sí». Devuelve null si el valor no corresponde al tipo.
 */
export function formatVariableValue(type: VariableType, value: unknown, unit: string | null): string | null {
  const withUnit = (text: string) => (unit ? `${text} ${unit}` : text)
  switch (type) {
    case 'NUMBER':
      return typeof value === 'number' ? withUnit(num(value)) : null
    case 'RANGE': {
      const { min, max } = (value ?? {}) as RangeValue
      if (min !== undefined && max !== undefined) return withUnit(`${num(min)} – ${num(max)}`)
      if (max !== undefined) return withUnit(`≤ ${num(max)}`)
      if (min !== undefined) return withUnit(`≥ ${num(min)}`)
      return null
    }
    case 'TEXT':
      return typeof value === 'string' ? value : null
    case 'LIST':
      return Array.isArray(value) ? value.join(', ') : null
    case 'BOOLEAN':
      return typeof value === 'boolean' ? (value ? 'Sí' : 'No') : null
  }
}
