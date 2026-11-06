import path from 'node:path'
import ExcelJS from 'exceljs'
import { SEEDED_ASSET_FAMILIES } from './seed-asset-families'
import { SEEDED_FAMILY_SPECIFICATIONS } from './seed-family-specifications'
import { validateSpecificationValues } from '../modules/catalog/family-specifications'

describe('Maestro de registro por familia v3', () => {
  it('reproduce el Excel con la conversión vigente de números y rangos a texto, unidades y obligatoriedad', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path.resolve(__dirname, '../../test/fixtures/family-specifications-v3.xlsx'))
    const sheet = workbook.getWorksheet('Especificaciones')!
    const families = new Map<string, string>(SEEDED_ASSET_FAMILIES.map(f => [f.name, f.code]))
    const types: Record<string, string> = { 'Número': 'TEXT', Texto: 'TEXT', 'Rango (mínimo y/o máximo)': 'TEXT' }
    const order = new Map<string, number>()
    const expected: unknown[][] = []
    sheet.eachRow((row, index) => {
      if (index === 1) return
      const text = (column: number) => row.getCell(column).text.trim()
      const family = families.get(text(2))
      expect(family).toBeDefined()
      expect(types[text(5)]).toBeDefined()
      expect(['SI', 'NO']).toContain(text(6))
      const position = (order.get(family!) ?? 0) + 1
      order.set(family!, position)
      expected.push([family, text(3), text(4) || null, types[text(5)], text(6) === 'SI', position])
    })
    expect(SEEDED_FAMILY_SPECIFICATIONS.map(([, ...definition]) => definition)).toEqual(expected)
    expect(SEEDED_FAMILY_SPECIFICATIONS.filter(d => d[4] === 'NUMBER')).toHaveLength(0)
    expect(SEEDED_FAMILY_SPECIFICATIONS.filter(d => d[4] === 'TEXT')).toHaveLength(810)
    expect(order.size).toBe(81)
    expect([...order.values()].every(count => count === 10)).toBe(true)
    expect(new Set(SEEDED_FAMILY_SPECIFICATIONS.map(([id]) => id)).size).toBe(810)
  })

  it('acepta grados IP como texto y temperaturas como texto en formularios e importaciones', () => {
    const definitions = SEEDED_FAMILY_SPECIFICATIONS
      .filter(([, family, label]) => family === 'N4_30' && ['Grado de protección', 'Temperatura de operación'].includes(label))
      .map(([id, familyId, label, unit, valueType, , sortOrder]) => ({ id, familyId, label, unit, valueType, required: false, sortOrder }))
    expect(definitions.map(d => d.valueType)).toEqual(['TEXT', 'TEXT'])
    const values = { 'Grado de protección (IP (código))': 'IP68', 'Temperatura de operación (°C)': '-40–60' }
    expect(validateSpecificationValues(definitions, values)).toEqual(values)
    expect(validateSpecificationValues(definitions, {
      'Grado de protección': 'IP68', 'Temperatura de operación': '-40–60',
    }, undefined, true)).toEqual(values)
  })
})
