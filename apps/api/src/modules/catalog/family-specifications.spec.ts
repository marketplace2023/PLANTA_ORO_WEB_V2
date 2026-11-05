import { BadRequestException } from '@nestjs/common'
import { validateSpecificationValues, type SpecificationDefinition } from './family-specifications'

const definition = (valueType: SpecificationDefinition['valueType']): SpecificationDefinition => ({
  id: 'parameter', familyId: 'family', label: 'Potencia', unit: 'kW', valueType, required: false, sortOrder: 1,
})
function errorMessage(type: SpecificationDefinition['valueType'], raw: unknown, fromExcel = true) {
  try { validateSpecificationValues([definition(type)], { 'Potencia (kW)': raw }, undefined, fromExcel) }
  catch (error) {
    expect(error).toBeInstanceOf(BadRequestException)
    const body = (error as BadRequestException).getResponse() as { errors: Array<{ path: string; message: string }> }
    expect(body.errors[0].path).toBe('specifications')
    return body.errors[0].message
  }
  throw new Error('Se esperaba un error de validación')
}

describe('Mensajes legibles de las especificaciones', () => {
  it.each(['≈ 16', '0 (sin PoE)', '85–264', '−40', 'no disponible'])('conserva el valor original %s al fallar una conversión numérica', raw => {
    const message = errorMessage('NUMBER', raw)
    expect(message).toContain('Especificación «Potencia (kW)»')
    expect(message).toContain('se esperaba un número')
    expect(message).toContain(`Valor recibido: «${raw}»`)
    expect(message).not.toMatch(/NaN|Invalid input|received number/)
  })
  it('explica el formato de sí/no, listas, rangos y textos', () => {
    expect(errorMessage('BOOLEAN', 'Tal vez')).toContain('se esperaba Sí o No')
    expect(errorMessage('RANGE', '20–10')).toContain('mínimo menor o igual al máximo')
    expect(errorMessage('LIST', ['a'.repeat(121)], false)).toContain('hasta 120 caracteres')
    const text = errorMessage('TEXT', 'x'.repeat(501))
    expect(text).toContain('entre 1 y 500 caracteres')
    expect(text).toContain('…»')
  })
  it('mantiene la aceptación de números decimales, cero, No y rangos válidos', () => {
    for (const [type, raw, expected] of [
      ['NUMBER', '16,5', 16.5], ['NUMBER', '0', 0], ['BOOLEAN', 'No', false], ['RANGE', '10–20', { min: 10, max: 20 }],
    ] as const) {
      expect(validateSpecificationValues([definition(type)], { 'Potencia (kW)': raw }, undefined, true)).toEqual({ 'Potencia (kW)': expected })
    }
  })
})
