import ExcelJS from 'exceljs'
import { cleanManufacturerName, parseMasterWorkbook } from './catalog-import.xlsx'

describe('Nombre del fabricante del listado maestro', () => {
  it.each([
    ['Releven (REV08 INV-060)', 'Releven'],
    ['Releven (REV08 INV-062)', 'Releven'],
    ['Staffa (motores hidráulicos) (REV08 INV-068)', 'Staffa'],
    ['Osborn MMD (por confirmar (REV08 ELEC-023))', 'Osborn MMD'],
    ['  Alfa   Laval (REV08 ELEC-079)  ', 'Alfa Laval'],
    ['Fabricante (nota) Industrial (otra nota)', 'Fabricante Industrial'],
    ['Fabricante (nota\nen varias líneas)', 'Fabricante'],
    ['Metso', 'Metso'],
    ['(Sin fabricante fuera de paréntesis)', ''],
  ])('normaliza %s a %s', (source, expected) => {
    expect(cleanManufacturerName(source)).toBe(expected)
  })
})

async function workbook(options: { components?: unknown[][]; references?: unknown[][]; referenceHeaders?: string[] } = {}) {
  const book = new ExcelJS.Workbook()
  book.addWorksheet('Listado maestro').addRows([
    ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
    ['TEST-01', 'Modelo uno', '08', 'Bombas', 'Bomba de pulpa', 'Pendiente', 'Molienda primaria'],
    ['TEST-02', 'Modelo dos', '08', 'Bombas', 'Bomba de pulpa', 'Pendiente', 'Molienda primaria'],
  ])
  book.addWorksheet('Categorías N4').addRows([['Código CA', 'Categoría N4'], ['08', 'Bombas']])
  book.addWorksheet('Características').addRows([['TAG ACTIVO', 'Componentes principales'], ...(options.components ?? [['TEST-01', 'Motor, carcasa y eje.']])])
  book.addWorksheet('Especificaciones').addRows([
    ['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'],
    ['TEST-01', 'Potencia', 'kW', 10], ['TEST-02', 'Potencia', 'kW', 20],
  ])
  if (options.references !== undefined) book.addWorksheet('Fabricantes de referencia').addRows([
    options.referenceHeaders ?? ['TAG ACTIVO', 'Fabricante', 'Descripción', 'Sitio web'], ...options.references,
  ])
  return Buffer.from(await book.xlsx.writeBuffer())
}

describe('Componentes y fabricantes de referencia por TAG', () => {
  it('mantiene el formato anterior y permite modelos sin componentes', async () => {
    const parsed = await parseMasterWorkbook(await workbook())
    expect(parsed.issues).toEqual([])
    expect(parsed.rows[0].components).toEqual(['Motor, carcasa y eje.'])
    expect(parsed.rows[1].components).toEqual([])
    expect(parsed.rows.map(r => r.referenceManufacturers)).toEqual([null, null])
  })

  it('agrupa cada fila no vacía como un componente y conserva orden y texto', async () => {
    const parsed = await parseMasterWorkbook(await workbook({ components: [
      ['TEST-02', 'Carcasa'], ['test-01', 'Motor, eje. Un solo componente.'],
      [' TEST-01 ', 'Reductor'], ['TEST-01', '  '], [null, null], ['TEST-02', 'Impulsor'],
    ] }))
    expect(parsed.issues).toEqual([])
    expect(parsed.rows.map(r => r.components)).toEqual([['Motor, eje. Un solo componente.', 'Reductor'], ['Carcasa', 'Impulsor']])
  })

  it('asocia varios fabricantes por TAG con descripción y web opcionales', async () => {
    const parsed = await parseMasterWorkbook(await workbook({ references: [
      ['test-01', ' Metso ', 'Bombas de pulpa', 'https://www.metso.com/'],
      [' TEST-01 ', 'WEG', '', ''], [null, null, null, null],
    ] }))
    expect(parsed.issues).toEqual([])
    expect(parsed.rows[0].referenceManufacturers).toEqual([
      { nombre: 'Metso', alcance: 'Bombas de pulpa', sitioWeb: 'https://www.metso.com/' },
      { nombre: 'WEG', alcance: null, sitioWeb: null },
    ])
    expect(parsed.rows[1].referenceManufacturers).toEqual([])
  })

  it('una hoja de referencias vacía representa una lista vacía para cada modelo', async () => {
    const parsed = await parseMasterWorkbook(await workbook({ components: [], references: [] }))
    expect(parsed.issues).toEqual([])
    expect(parsed.rows.map(r => ({ components: r.components, references: r.referenceManufacturers }))).toEqual([
      { components: [], references: [] }, { components: [], references: [] },
    ])
  })

  it.each([
    { references: [['NO-EXISTE', 'Metso', '', '']], message: 'TAG desconocido: NO-EXISTE' },
    { references: [['TEST-01', '', '', 'https://example.com']], message: 'El fabricante es obligatorio' },
    { references: [['TEST-01', 'A'.repeat(161), '', '']], message: 'El fabricante es obligatorio' },
    { references: [['TEST-01', 'Metso', 'A'.repeat(2001), '']], message: 'La descripción admite' },
    { references: [['TEST-01', 'Metso', '', 'javascript:alert(1)']], message: 'El sitio web debe ser' },
    { references: [['TEST-01', 'Metso', '', 'ftp://example.com']], message: 'El sitio web debe ser' },
    { references: [['TEST-01', 'Metso', '', 'no es una dirección']], message: 'El sitio web debe ser' },
  ])('valida los errores de referencias con hoja y fila: $message', async ({ references, message }) => {
    const parsed = await parseMasterWorkbook(await workbook({ references }))
    expect(parsed.issues).toEqual([expect.objectContaining({ sheet: 'Fabricantes de referencia', row: 2, message: expect.stringContaining(message) })])
  })

  it('exige los encabezados de la hoja de referencias si está presente', async () => {
    const parsed = await parseMasterWorkbook(await workbook({ references: [], referenceHeaders: ['TAG ACTIVO', 'Fabricante'] }))
    expect(parsed.issues.map(i => i.message)).toEqual(['Falta la columna «Descripción»', 'Falta la columna «Sitio web»'])
  })

  it('rechaza componentes asociados a TAG que no aparecen en el listado', async () => {
    const parsed = await parseMasterWorkbook(await workbook({ components: [['NO-EXISTE', 'Motor']] }))
    expect(parsed.issues).toEqual([{ sheet: 'Características', row: 2, message: 'TAG desconocido: NO-EXISTE' }])
  })
})
