import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import readExcelFile, { type Sheet } from 'read-excel-file/node'

export const CATALOG_IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const normalized = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
/** Quita notas entre paréntesis, incluidos varios bloques o paréntesis anidados. */
export function cleanManufacturerName(value: string): string {
  let name = value.normalize('NFKC'), previous: string
  do {
    previous = name
    name = name.replace(/\([^()]*\)/g, ' ')
  } while (name !== previous)
  return name.replace(/\s+/g, ' ').trim()
}
export type ImportIssue = { sheet: string; row: number; message: string; code?: 'MISSING_SPECIFICATIONS' }
export type ImportReferenceManufacturer = { nombre: string; alcance: string | null; sitioWeb: string | null }
export type MasterRow = {
  row: number; tag: string; name: string; categoryCode: string; family: string; type: string
  manufacturer: string; stage: string; components: string[]; specifications: Record<string, string>
  /** null: archivo anterior sin la hoja; conservar las referencias existentes. */
  referenceManufacturers: ImportReferenceManufacturer[] | null
}
export type MasterWorkbook = { fingerprint: string; rows: MasterRow[]; issues: ImportIssue[]; specificationCount: number }
const requiredHeaders: Record<string, string[]> = {
  'Listado maestro': ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
  'Categorías N4': ['Código CA', 'Categoría N4'],
  'Características': ['TAG ACTIVO', 'Componentes principales'],
  'Especificaciones': ['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'],
}
const optionalHeaders: Record<string, string[]> = {
  'Fabricantes de referencia': ['TAG ACTIVO', 'Fabricante', 'Descripción', 'Sitio web'],
}

/** Lee valores, nunca ejecuta fórmulas. El libro de entrada permanece intacto. */
export async function readCatalogWorkbook(buffer: Buffer): Promise<Sheet[]> {
  if (buffer.length > CATALOG_IMPORT_MAX_BYTES || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException('Adjunta un archivo .xlsx válido de hasta 5 MB')
  }
  try { return await readExcelFile(buffer) }
  catch { throw new BadRequestException('No se pudo leer el Excel. Comprueba que sea un archivo .xlsx válido.') }
}

export async function parseMasterWorkbook(buffer: Buffer): Promise<MasterWorkbook> {
  const book = await readCatalogWorkbook(buffer)
  const issues: ImportIssue[] = []
  const tables = new Map<string, Array<{ row: number; values: Record<string, string> }>>()
  for (const [name, headers] of Object.entries({ ...requiredHeaders, ...optionalHeaders })) {
    const sheet = book.find(s => s.sheet === name)
    if (!sheet) {
      if (Object.hasOwn(requiredHeaders, name)) issues.push({ sheet: name, row: 1, message: `Falta la hoja «${name}»` })
      continue
    }
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
    for (const [field, max] of [['TAG ACTIVO', 100], ['Nombre', 200], ['Tipo', 160], ['Denominación de etapa', 200]] as const) {
      if (!v[field] || v[field].length > max) issues.push({ sheet: 'Listado maestro', row, message: `«${field}» es obligatorio y admite hasta ${max} caracteres` })
    }
    const manufacturer = cleanManufacturerName(v['Fabricante / modelo'])
    if (manufacturer.length < 2 || manufacturer.length > 160 || /[()]/.test(manufacturer)) {
      issues.push({ sheet: 'Listado maestro', row, message: 'El fabricante debe tener entre 2 y 160 caracteres fuera de los paréntesis y las notas deben tener paréntesis balanceados' })
    }
    if (tags.has(tag)) issues.push({ sheet: 'Listado maestro', row, message: `TAG repetido: ${tag}` })
    if (!families.has(categoryCode)) issues.push({ sheet: 'Listado maestro', row, message: `Código CA ${categoryCode} ausente en «Categorías N4»` })
    tags.add(tag)
    rows.push({ row, tag, name: v.Nombre, categoryCode, family: families.get(categoryCode) ?? '', type: v.Tipo, manufacturer, stage: v['Denominación de etapa'], components: [], specifications: {}, referenceManufacturers: tables.has('Fabricantes de referencia') ? [] : null })
  }
  if (!rows.length || rows.length > 2_000) issues.push({ sheet: 'Listado maestro', row: 1, message: 'El listado debe contener entre 1 y 2.000 activos' })
  const byTag = new Map(rows.map(r => [r.tag, r]))
  for (const { row, values: v } of tables.get('Características') ?? []) {
    const tag = v['TAG ACTIVO'].toUpperCase(), model = byTag.get(tag)
    if (!model) { issues.push({ sheet: 'Características', row, message: `TAG desconocido: ${tag}` }); continue }
    // Una fila es un componente. El texto de cada fila no se divide por comas ni por puntos.
    if (v['Componentes principales']) model.components.push(v['Componentes principales'])
  }
  for (const { row, values: v } of tables.get('Fabricantes de referencia') ?? []) {
    const tag = v['TAG ACTIVO'].toUpperCase(), model = byTag.get(tag)
    if (!model) { issues.push({ sheet: 'Fabricantes de referencia', row, message: `TAG desconocido: ${tag}` }); continue }
    const name = v.Fabricante, description = v['Descripción'], website = v['Sitio web']
    if (!name || name.length > 160) issues.push({ sheet: 'Fabricantes de referencia', row, message: 'El fabricante es obligatorio y admite hasta 160 caracteres' })
    if (description.length > 2_000) issues.push({ sheet: 'Fabricantes de referencia', row, message: 'La descripción admite hasta 2.000 caracteres' })
    if (website) {
      let valid = website.length <= 2_048
      try { valid = valid && ['http:', 'https:'].includes(new URL(website).protocol) }
      catch { valid = false }
      if (!valid) issues.push({ sheet: 'Fabricantes de referencia', row, message: 'El sitio web debe ser una dirección http:// o https:// válida de hasta 2.048 caracteres' })
    }
    model.referenceManufacturers!.push({ nombre: name, alcance: description || null, sitioWeb: website || null })
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
    if (!Object.keys(r.specifications).length) issues.push({ sheet: 'Listado maestro', row: r.row, message: `${r.tag} no tiene especificaciones`, code: 'MISSING_SPECIFICATIONS' })
  }
  return { fingerprint: createHash('sha256').update(buffer).digest('hex'), rows, issues, specificationCount }
}
