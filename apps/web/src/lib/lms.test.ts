import { describe, expect, it } from 'vitest'
import { coursePriceText, formatDuration, levelLabel } from './lms'

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

describe('coursePriceText', () => {
  it('sin precio es "Gratis"; con precio, la cantidad con su moneda', () => {
    expect(coursePriceText(0, 'USD')).toBe('Gratis')
    expect(coursePriceText(120.5, 'USD')).toBe('USD 120.50')
    expect(coursePriceText(85, 'PEN')).toBe('PEN 85.00')
  })
})
