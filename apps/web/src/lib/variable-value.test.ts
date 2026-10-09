import { describe, expect, it } from 'vitest'
import { formatVariableValue } from './variable-value'

describe('formatVariableValue', () => {
  it('rango con mínimo y máximo, solo máximo o solo mínimo', () => {
    expect(formatVariableValue('RANGE', { min: 600, max: 800 }, 't/h')).toBe('600 – 800 t/h')
    expect(formatVariableValue('RANGE', { max: 700 }, 'mm')).toBe('≤ 700 mm')
    expect(formatVariableValue('RANGE', { min: 50 }, 'kW')).toBe('≥ 50 kW')
  })

  it('número con unidad y sin ella', () => {
    expect(formatVariableValue('NUMBER', 120, 'mm')).toBe('120 mm')
    expect(formatVariableValue('NUMBER', 4, null)).toBe('4')
    expect(formatVariableValue('NUMBER', 1250.5, 'kW')).toBe('1250,5 kW')
  })

  it('texto, lista y sí/no', () => {
    expect(formatVariableValue('TEXT', 'Parrilla / criba de barras', null)).toBe('Parrilla / criba de barras')
    expect(formatVariableValue('LIST', ['vibración', 'detección de atascos'], null)).toBe('vibración, detección de atascos')
    expect(formatVariableValue('BOOLEAN', true, null)).toBe('Sí')
    expect(formatVariableValue('BOOLEAN', false, null)).toBe('No')
  })

  it('un valor que no corresponde al tipo no se muestra', () => {
    expect(formatVariableValue('NUMBER', 'abc', 'mm')).toBeNull()
    expect(formatVariableValue('RANGE', {}, 'mm')).toBeNull()
    expect(formatVariableValue('LIST', 'x', null)).toBeNull()
    expect(formatVariableValue('BOOLEAN', 1, null)).toBeNull()
    expect(formatVariableValue('RANGE', null, 'mm')).toBeNull()
  })
})
