import path from 'node:path'
import ExcelJS from 'exceljs'
import { SEEDED_ASSET_FAMILIES } from './seed-asset-families'
import { SEEDED_FAMILY_SPECIFICATIONS } from './seed-family-specifications'
import { validateSpecificationValues } from '../modules/catalog/family-specifications'

describe('Maestro de registro por familia completo', () => {
  it('reproduce todas las familias y sus códigos de integración, CA y TAG del Excel', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path.resolve(__dirname, '../../test/fixtures/family-specifications-completo.xlsx'))
    const expected: unknown[] = []
    workbook.getWorksheet('Familias locales')!.eachRow(row => {
      const text = (column: number) => row.getCell(column).text.trim()
      if (!text(3).startsWith('N4_')) return
      expected.push({ name: text(1), tagCode: text(2), code: text(3), categoryCode: text(4), icon: null, description: null })
    })
    expect(SEEDED_ASSET_FAMILIES).toEqual(expected)
    expect(expected).toHaveLength(84)
    for (const key of ['code', 'categoryCode', 'tagCode'] as const) {
      expect(new Set(SEEDED_ASSET_FAMILIES.map(f => f[key])).size).toBe(84)
    }
  })

  it('reproduce el Excel con la conversión vigente de números y rangos a texto, unidades y obligatoriedad', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path.resolve(__dirname, '../../test/fixtures/family-specifications-completo.xlsx'))
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
      expect(family).toBe(text(1))
      expect(types[text(5)]).toBeDefined()
      expect(['SI', 'NO']).toContain(text(6))
      const position = (order.get(family!) ?? 0) + 1
      order.set(family!, position)
      expected.push([family, text(3), text(4) || null, types[text(5)], text(6) === 'SI', position])
    })
    expect(SEEDED_FAMILY_SPECIFICATIONS.map(([, ...definition]) => definition)).toEqual(expected)
    expect(SEEDED_FAMILY_SPECIFICATIONS.filter(d => d[4] === 'NUMBER')).toHaveLength(0)
    expect(SEEDED_FAMILY_SPECIFICATIONS.filter(d => d[4] === 'TEXT')).toHaveLength(897)
    expect(order.size).toBe(84)
    expect(SEEDED_FAMILY_SPECIFICATIONS.filter(d => d[5])).toHaveLength(474)
    for (const code of ['N4_10', 'N4_26', 'N4_27']) {
      const definitions = SEEDED_FAMILY_SPECIFICATIONS.filter(d => d[1] === code)
      expect(definitions).toHaveLength(12)
      expect(definitions.filter(d => d[5])).toHaveLength(6)
    }
    expect(order.get('N4_23')).toBe(40)
    expect(order.get('N4_28')).toBe(31)
    expect(SEEDED_ASSET_FAMILIES.filter(f => !order.has(f.code)).map(f => f.code)).toEqual([])
    expect(new Set(SEEDED_FAMILY_SPECIFICATIONS.map(([id]) => id)).size).toBe(897)
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
