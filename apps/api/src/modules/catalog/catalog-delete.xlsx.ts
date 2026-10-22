import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { normalized, readCatalogWorkbook, type ImportIssue } from './catalog-import.xlsx'

/** La eliminación solo necesita TAG ACTIVO; no valida ni modifica las otras hojas del importador. */
export async function parseCatalogDeleteWorkbook(buffer: Buffer) {
  const book = await readCatalogWorkbook(buffer)
  const sheet = book.find(s => s.sheet === 'Listado maestro')
  const issues: ImportIssue[] = []
  const tags: Array<{ tag: string; row: number }> = []
  if (!sheet) throw new BadRequestException('Falta la hoja «Listado maestro»')
  if (sheet.data.length > 25_000 || sheet.data.some(row => row.length > 100)) throw new BadRequestException('El listado supera el límite de 25.000 filas o 100 columnas')
  const columns = (sheet.data[0] ?? []).flatMap((value, index) => normalized(String(value ?? '')) === 'tag activo' ? [index] : [])
  if (columns.length !== 1) throw new BadRequestException('La hoja «Listado maestro» debe tener una única columna «TAG ACTIVO»')
  const seen = new Set<string>()
  for (let i = 1; i < sheet.data.length; i++) {
    const cells = sheet.data[i]
    if (!cells.some(value => String(value ?? '').trim())) continue
    const row = i + 1, tag = String(cells[columns[0]] ?? '').trim().toUpperCase()
    if (!tag || tag.length > 100 || /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/.test(tag)) {
      issues.push({ sheet: 'Listado maestro', row, message: 'TAG ACTIVO es obligatorio, admite hasta 100 caracteres y no puede contener errores de Excel' })
      continue
    }
    if (seen.has(tag)) {
      issues.push({ sheet: 'Listado maestro', row, message: `TAG repetido: ${tag}` })
      continue
    }
    seen.add(tag)
    tags.push({ tag, row })
  }
  if (!tags.length || tags.length > 2_000) throw new BadRequestException('El listado debe contener entre 1 y 2.000 TAG válidos')
  return { tags, issues, fileHash: createHash('sha256').update(buffer).digest('hex') }
}
