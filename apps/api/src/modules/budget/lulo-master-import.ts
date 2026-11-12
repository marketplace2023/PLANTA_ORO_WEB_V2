import ExcelJS from 'exceljs'
import { UnprocessableEntityException } from '@nestjs/common'

export const masterHeaders = ['tipo', 'codigo', 'descripcion', 'unidad', 'costo', 'rendimiento', 'familia', 'tipo_insumo', 'codigo_insumo', 'cantidad', 'desperdicio']
function csv(source: string) {
  const separator = source.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',', rows: string[][] = [], current: string[] = []; let cell = '', quoted = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (c === separator && !quoted) { current.push(cell); cell = '' }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && source[i + 1] === '\n') i++; current.push(cell); if (current.some(v => v.trim())) rows.push([...current]); current.length = 0; cell = '' }
    else cell += c
  }
  if (quoted) throw new UnprocessableEntityException('El CSV contiene comillas sin cerrar')
  current.push(cell); if (current.some(v => v.trim())) rows.push(current)
  return rows
}
export async function readMasterFile(file: Express.Multer.File) {
  let data: string[][]
  if (/\.csv$/i.test(file.originalname)) data = csv(file.buffer.toString('utf8').replace(/^\uFEFF/, ''))
  else if (/\.xlsx$/i.test(file.originalname)) {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet('Maestros') ?? workbook.worksheets[0]; if (!sheet || sheet.rowCount > 5001) throw new UnprocessableEntityException('La hoja Maestros debe tener hasta 5.000 filas')
    if (sheet.columnCount > masterHeaders.length) throw new UnprocessableEntityException('La hoja contiene columnas fuera de la plantilla autorizada')
    data = []; sheet.eachRow(row => { const cells: string[] = []; for (let i = 1; i <= masterHeaders.length; i++) { const cell = row.getCell(i); if (cell.type === ExcelJS.ValueType.Formula) throw new UnprocessableEntityException('La plantilla recibe valores; reemplaza las fórmulas por sus resultados'); cells.push(cell.text) }; if (cells.some(v => v.trim())) data.push(cells) })
  } else throw new UnprocessableEntityException('Usa un archivo .xlsx o .csv')
  if (data.length < 2 || data.length > 5001) throw new UnprocessableEntityException('La plantilla debe contener entre 1 y 5.000 filas de datos')
  const headers = data.shift()!.map(c => c.trim().toLowerCase())
  if (headers.length !== masterHeaders.length || masterHeaders.some(h => !headers.includes(h))) throw new UnprocessableEntityException(`Los encabezados deben ser: ${masterHeaders.join(', ')}`)
  return data.map((row, index) => ({ number: index + 2, values: Object.fromEntries(headers.map((h, i) => [h, row[i]?.trim() ?? ''])) as Record<string, string> }))
}
export async function masterTemplate() {
  const book = new ExcelJS.Workbook(); book.creator = 'Ecosistema FUR'
  const s = book.addWorksheet('Maestros'); s.addRow(masterHeaders); s.addRow(['MATERIAL', 'MI-MAT-001', 'Material de ejemplo: reemplazar antes de importar', 'KG', '0', '1', '', '', '', '', '0'])
  s.columns = masterHeaders.map(h => ({ width: h === 'descripcion' ? 60 : 20 })); s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102C4C' } }; s.views = [{ state: 'frozen', ySplit: 1 }]
  const help = book.addWorksheet('Instrucciones')
  for (const line of ['Reemplaza la fila de ejemplo antes de cargar. El costo cero se conserva como referencia sin verificar.', 'Tipos permitidos: MATERIAL, EQUIPO, MANO_OBRA, PARTIDA. Una fila por insumo.', 'Los códigos se normalizan en mayúsculas. No se sobreescriben códigos existentes: sus cambios se hacen desde la ficha.', 'Usa punto decimal, sin separadores de miles. Costo de equipo por jornada y mano de obra por persona-día.', 'Familia: código de una familia del mismo tipo; puede dejarse vacía.', 'PARTIDA: repite código, descripción, unidad y rendimiento por cada renglón de composición.', 'En cada fila de PARTIDA indica tipo_insumo (MATERIAL, EQUIPO o MANO_OBRA), codigo_insumo, cantidad y desperdicio.', 'Los insumos de las partidas deben existir antes. Primero importa insumos, luego las partidas.', 'Desperdicio solo para materiales. La carga completa debe ser válida para confirmarse.', 'Al confirmar se crean maestros propios de planta. La base original común se conserva. Publica los precios vigentes en una lista.']) help.addRow([line])
  help.getColumn(1).width = 120; help.eachRow(r => { r.height = 34; r.getCell(1).alignment = { wrapText: true } })
  return Buffer.from(await book.xlsx.writeBuffer())
}
