import { describe, expect, it } from 'vitest'
import { formatDuration, levelLabel } from './lms'

describe('formatDuration', () => {
  it('minutos, horas exactas y mixto', () => {
    expect(formatDuration(40)).toBe('40 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(95)).toBe('1 h 35 min')
  })

  it('sin duración o inválida → guion, nunca "0 min" ni NaN', () => {
    for (const v of [0, -5, Number.NaN]) expect(formatDuration(v)).toBe('—')
  })
})

describe('levelLabel', () => {
  it('traduce los niveles y conserva los desconocidos', () => {
    expect(levelLabel('ADVANCED')).toBe('Avanzado')
    expect(levelLabel('OTRO')).toBe('OTRO')
  })
})
