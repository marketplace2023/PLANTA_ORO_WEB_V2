import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatMoney, formatPct, formatQuantity, formatUnitPrice } from './format'

describe('formatDate (design.md §58)', () => {
  it('formatea YYYY-MM-DD como "15 mar 2022"', () => {
    expect(formatDate('2022-03-15')).toBe('15 mar 2022')
    expect(formatDate('2026-10-01')).toBe('01 oct 2026')
  })

  it('todos los meses usan abreviatura de 3 letras (septiembre no es "sept")', () => {
    const months = Array.from({ length: 12 }, (_, i) => formatDate(`2026-${String(i + 1).padStart(2, '0')}-05`).split(' ')[1])
    expect(months).toEqual(['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'])
    expect(formatDateTime('2026-09-15T12:00:00.000Z')).toMatch(/^\d{2} sep 2026, /)
  })

  it('no corre un día por la zona horaria (fecha local, no UTC)', () => {
    expect(formatDate('2026-01-01')).toBe('01 ene 2026')
    expect(formatDate('2026-12-31')).toBe('31 dic 2026')
  })

  it('acepta un instante ISO y toma solo la fecha', () => {
    expect(formatDate('2022-03-15T23:59:59.000Z')).toBe('15 mar 2022')
  })

  it('valores vacíos o inválidos → guion, nunca "Invalid Date"', () => {
    for (const v of [null, undefined, '', 'no-es-fecha']) expect(formatDate(v)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('incluye fecha y hora de 24 h', () => {
    expect(formatDateTime('2026-10-01T18:05:00.000Z')).toMatch(/^\d{2} \w{3} 2026, \d{2}:\d{2}$/)
  })

  it('valores vacíos o inválidos → guion', () => {
    for (const v of [null, undefined, '', 'basura']) expect(formatDateTime(v)).toBe('—')
  })
})

describe('formatMoney', () => {
  it('moneda delante, miles con coma y dos decimales (design.md §58)', () => {
    expect(formatMoney(125430.5, 'USD')).toBe('USD 125,430.50')
    expect(formatMoney(0, 'PEN')).toBe('PEN 0.00')
    expect(formatMoney(1234567.891)).toBe('USD 1,234,567.89')
  })

  it('sin valor → guion, nunca "NaN"', () => {
    for (const v of [null, undefined, Number.NaN]) expect(formatMoney(v)).toBe('—')
  })
})

describe('formatQuantity', () => {
  it('hasta 4 decimales sin ceros sobrantes', () => {
    expect(formatQuantity(3)).toBe('3')
    expect(formatQuantity(2.5)).toBe('2,5')
    expect(formatQuantity(0.0001)).toBe('0,0001')
  })

  it('sin valor → guion', () => {
    for (const v of [null, undefined, Number.NaN]) expect(formatQuantity(v)).toBe('—')
  })
})

describe('formatUnitPrice', () => {
  it('hasta 4 decimales, mínimo 2', () => {
    expect(formatUnitPrice(113.1667, 'USD')).toBe('USD 113.1667')
    expect(formatUnitPrice(12, 'PEN')).toBe('PEN 12.00')
    expect(formatUnitPrice(0.5)).toBe('USD 0.50')
  })

  it('sin precio calculable → guion', () => {
    for (const v of [null, undefined, Number.NaN]) expect(formatUnitPrice(v)).toBe('—')
  })
})

describe('formatPct', () => {
  it('porcentaje con dos decimales como máximo', () => {
    expect(formatPct(9.28)).toBe('9.28 %')
    expect(formatPct(10)).toBe('10 %')
    expect(formatPct(0)).toBe('0 %')
  })

  it('con signo solo marca los positivos', () => {
    expect(formatPct(10, true)).toBe('+10 %')
    expect(formatPct(-5, true)).toMatch(/^[-−]5 %$/)
    expect(formatPct(0, true)).toBe('0 %')
  })

  it('sin valor → guion', () => {
    for (const v of [null, undefined, Number.NaN]) expect(formatPct(v)).toBe('—')
  })
})
