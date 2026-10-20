import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import readExcelFile, { type Sheet } from 'read-excel-file/node'

export const CATALOG_IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const normalized = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
export type ImportIssue = { sheet: string; row: number; message: string }
export type MasterRow = {
  row: number; tag: string; name: string; categoryCode: string; family: string; type: string
  manufacturer: string; stage: string; components: string[]; specifications: Record<string, string>
}
export type MasterWorkbook = { fingerprint: string; rows: MasterRow[]; issues: ImportIssue[]; specificationCount: number }
const requiredHeaders: Record<string, string[]> = {
  'Listado maestro': ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
  'Categorías N4': ['Código CA', 'Categoría N4'],
  'Características': ['TAG ACTIVO', 'Componentes principales'],
  'Especificaciones': ['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'],
}

/** Lee valores, nunca ejecuta fórmulas. El libro de entrada permanece intacto. */
export async function parseMasterWorkbook(buffer: Buffer): Promise<MasterWorkbook> {
  if (buffer.length > CATALOG_IMPORT_MAX_BYTES || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException('Adjunta un archivo .xlsx válido de hasta 5 MB')
  }
  let book: Sheet[]
  try { book = await readExcelFile(buffer) }
  catch { throw new BadRequestException('No se pudo leer el Excel. Comprueba que sea un archivo .xlsx válido.') }
  const issues: ImportIssue[] = []
  const tables = new Map<string, Array<{ row: number; values: Record<string, string> }>>()
  for (const [name, headers] of Object.entries(requiredHeaders)) {
    const sheet = book.find(s => s.sheet === name)
    if (!sheet) { issues.push({ sheet: name, row: 1, message: `Falta la hoja «${name}»` }); continue }
    if (sheet.data.length > 25_000 || sheet.data.some(r => r.length > 100)) {
      throw new BadRequestException(`La hoja «${name}» supera el límite de 25.000 filas o 100 columnas`)
    }
    const columns = new Map<string, number>()
    for (const [col, cell] of (sheet.data[0] ?? []).entries()) {
      const title = normalized(String(cell ?? ''))
      if (columns.has(title) && title) issues.push({ sheet: name, row: 1, message: `Columna repetida: ${cell}` })
      columns.set(title, col)
    }
    for (const h of headers) if (!columns.has(normalized(h))) issues.push({ sheet: name, row: 1, message: `Falta la columna «${h}»` })
    const rows: Array<{ row: number; values: Record<string, string> }> = []
    for (let index = 1; index < sheet.data.length; index++) {
      const r = sheet.data[index], row = index + 1
      const values: Record<string, string> = {}
      for (const h of headers) {
        const col = columns.get(normalized(h))
        const cell = col === undefined ? null : r[col]
        if (typeof cell === 'string' && /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/.test(cell)) {
          issues.push({ sheet: name, row, message: `«${h}» contiene un error de Excel` })
        }
        values[h] = String(cell ?? '').trim()
      }
      if (Object.values(values).some(Boolean)) rows.push({ row, values })
    }
    tables.set(name, rows)
  }
  const ca = (s: string) => /^\d+$/.test(s) ? s.padStart(2, '0') : s
  const families = new Map<string, string>()
  for (const { row, values: v } of tables.get('Categorías N4') ?? []) {
    const code = ca(v['Código CA']), name = v['Categoría N4']
    if (!/^[A-Z0-9_]{1,20}$/.test(code) || !name || name.length > 120) issues.push({ sheet: 'Categorías N4', row, message: 'El Código CA admite 1–20 letras mayúsculas, números o guion bajo; el nombre de familia es obligatorio y admite hasta 120 caracteres' })
    if (families.has(code)) issues.push({ sheet: 'Categorías N4', row, message: `Código CA repetido: ${code}` })
    families.set(code, name)
  }
  const tags = new Set<string>()
  const rows: MasterRow[] = []
  for (const { row, values: v } of tables.get('Listado maestro') ?? []) {
    const tag = v['TAG ACTIVO'].toUpperCase(), categoryCode = ca(v['Código CA'])
    for (const [field, max] of [['TAG ACTIVO', 100], ['Nombre', 200], ['Tipo', 160], ['Fabricante / modelo', 160], ['Denominación de etapa', 200]] as const) {
      if (!v[field] || v[field].length > max) issues.push({ sheet: 'Listado maestro', row, message: `«${field}» es obligatorio y admite hasta ${max} caracteres` })
    }
    if (tags.has(tag)) issues.push({ sheet: 'Listado maestro', row, message: `TAG repetido: ${tag}` })
    if (!families.has(categoryCode)) issues.push({ sheet: 'Listado maestro', row, message: `Código CA ${categoryCode} ausente en «Categorías N4»` })
    tags.add(tag)
    rows.push({ row, tag, name: v.Nombre, categoryCode, family: families.get(categoryCode) ?? '', type: v.Tipo, manufacturer: v['Fabricante / modelo'], stage: v['Denominación de etapa'], components: [], specifications: {} })
  }
  if (!rows.length || rows.length > 2_000) issues.push({ sheet: 'Listado maestro', row: 1, message: 'El listado debe contener entre 1 y 2.000 activos' })
  const byTag = new Map(rows.map(r => [r.tag, r]))
  const characteristics = new Set<string>()
  for (const { row, values: v } of tables.get('Características') ?? []) {
    const tag = v['TAG ACTIVO'].toUpperCase(), model = byTag.get(tag)
    if (!model) { issues.push({ sheet: 'Características', row, message: `TAG desconocido: ${tag}` }); continue }
    if (characteristics.has(tag)) issues.push({ sheet: 'Características', row, message: `TAG repetido: ${tag}` })
    characteristics.add(tag)
    // El texto completo es UN componente: no se divide por comas ni por puntos.
    model.components = v['Componentes principales'] ? [v['Componentes principales']] : []
  }
  let specificationCount = 0
  for (const { row, values: v } of tables.get('Especificaciones') ?? []) {
    const tag = v['TAG ACTIVO'].toUpperCase(), model = byTag.get(tag)
    if (!model) { issues.push({ sheet: 'Especificaciones', row, message: `TAG desconocido: ${tag}` }); continue }
    const unit = v.Unidad, parameter = v['Parámetro técnico']
    const key = parameter + (unit && !['—', '-', '–'].includes(unit) ? ` (${unit})` : '')
    if (!parameter || !v['Valor / estado']) issues.push({ sheet: 'Especificaciones', row, message: 'El parámetro y su valor son obligatorios' })
    if (Object.hasOwn(model.specifications, key)) issues.push({ sheet: 'Especificaciones', row, message: `Especificación repetida para ${tag}: ${key}` })
    Object.defineProperty(model.specifications, key, { value: v['Valor / estado'], enumerable: true, writable: true, configurable: true })
    specificationCount++
  }
  for (const r of rows) {
    if (!characteristics.has(r.tag)) issues.push({ sheet: 'Listado maestro', row: r.row, message: `${r.tag} no tiene fila en «Características»` })
    if (!Object.keys(r.specifications).length) issues.push({ sheet: 'Listado maestro', row: r.row, message: `${r.tag} no tiene especificaciones` })
  }
  return { fingerprint: createHash('sha256').update(buffer).digest('hex'), rows, issues, specificationCount }
}
