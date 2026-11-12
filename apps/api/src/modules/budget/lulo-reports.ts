import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { LuloInput } from './lulo.schemas'
import type { LuloCatalog, LuloResult } from './lulo-engine'

type ReportData = { input: LuloInput; catalog: LuloCatalog; result: LuloResult; code?: string; version?: number; status?: string; issuedAt?: Date | null; contentHash?: string }
export type LuloReportKind = 'budget' | 'chapters' | 'apus' | 'resources'
const names: Record<LuloReportKind, string> = { budget: 'Presupuesto', chapters: 'Resumen por capítulos', apus: 'Análisis de precios unitarios', resources: 'Relación de insumos' }
const state = (d: ReportData) => d.catalog.demo ? 'DEMOSTRACIÓN - DATOS FICTICIOS - SIN VALIDEZ COMERCIAL' : d.status === 'ISSUED' ? 'PRESUPUESTO EMITIDO' : d.catalog.historical && d.input.referenceMode ? 'REFERENCIA HISTÓRICA - MONEDA DE ORIGEN SIN CONFIRMAR - NO EMITIDA' : 'ESTIMACIÓN PRELIMINAR - NO EMITIDA'
const parameters = (d: ReportData) => `FCAS ${d.input.rates.fcasPct}% · Administración ${d.input.rates.overheadPct}% · Utilidad ${d.input.rates.utilityPct}% · Financiamiento ${d.input.rates.financePct}% · Impuesto ${d.input.rates.taxPct}%`
function priceDates(d: ReportData) {
  const dates = d.catalog.apus.flatMap(a => a.components.map(c => d.input.overrides.find(o => o.resourceId === c.resource.id)?.baseDate ?? c.resource.baseDate)).sort()
  return dates.length ? `${dates[0]}${dates[dates.length - 1] !== dates[0] ? ` a ${dates[dates.length - 1]}` : ''}` : 'Precios manuales declarados'
}

export function luloReportRows(data: ReportData, kind: LuloReportKind) {
  const { input, result } = data
  const chapters = new Map(input.chapters.map(c => [c.id, c]))
  const chapterName = (id: string): string => { const c = chapters.get(id)!; return c.parentId ? `${chapterName(c.parentId)} / ${c.name}` : c.name }
  if (kind === 'chapters') return { headers: ['Capítulo / subcapítulo', 'Subtotal'], rows: result.chapters.map(c => [chapterName(c.id), c.subtotal]), note: 'Los subtotales de capítulos padre incluyen sus subcapítulos. El total del documento suma las partidas una sola vez.' }
  if (kind === 'resources') return { headers: ['Código', 'Insumo', 'Unidad', 'Cantidad', 'Precio base', 'FCAS %', 'Costo'], rows: result.resources.map(r => [r.code, r.name, r.unit, r.quantity, r.price, r.type === 'LABOR' ? input.rates.fcasPct : '0', r.cost]), note: 'Insumos de partidas calculadas. Los costos de mano de obra incluyen FCAS; los precios asumidos y manuales se registran aparte y no se interpretan como consumo físico.' }
  if (kind === 'apus') {
    const rows: string[][] = []
    for (const l of result.lines.filter(l => l.apu)) {
      const a = l.apu!
      rows.push([a.code, a.name, a.unit, '', '', '', ''])
      rows.push(['Base', `${a.yieldBasis} · rendimiento ${a.yieldValue}${a.hoursPerDay ? ` · jornada ${a.hoursPerDay} h` : ''}`, '', '', '', '', ''])
      for (const c of a.components) {
        rows.push([c.code, c.name, c.unit, c.quantity, c.consumption, c.price, c.cost])
        const source = data.catalog.apus.find(original => original.id === a.id)?.components.find(original => original.resource.id === c.resourceId)?.resource
        const own = input.overrides.find(o => o.resourceId === c.resourceId)
        if (source) rows.push([c.code, `Fuente: ${own?.reason ?? source.evidence} · Base ${own?.baseDate ?? source.baseDate} · Hasta ${own?.validUntil ?? source.validUntil}${source.supplier ? ` · ${source.supplier}` : ''}${source.priceRevision ? ` · Revisión ${source.priceRevision}` : ''}`, '', '', '', '', ''])
      }
      for (const [key, title] of [['direct', 'Costo directo'], ['overhead', 'Administración'], ['utility', 'Utilidad'], ['finance', 'Financiamiento']] as const) rows.push(['', title, '', '', '', '', a.breakdown[key]])
      rows.push(['', `PU calculado / adoptado (${l.mode})`, a.unit, '', '', a.price, l.price])
    }
    return { headers: ['Código', 'APU / insumo', 'Unidad', 'Cantidad', 'Consumo / ud.', 'Precio', 'Costo'], rows, note: 'Materiales por unidad; cuadrillas según la base de rendimiento y tarifa declaradas. Utilidad sobre directo + administración; financiamiento sobre directo + administración + utilidad. Los coeficientes de adquisición del legado no se vuelven a aplicar a una tarifa de uso verificada.' }
  }
  return { headers: ['Capítulo', 'Código', 'Partida', 'Unidad', 'Cantidad', 'PU', 'Importe'], rows: result.lines.map(l => [chapterName(l.chapterId), l.code, `${l.description}${l.mode !== 'CALCULATED' ? ` (${l.mode === 'MANUAL' ? 'Manual' : 'Asumido'}: ${l.reason})` : ''}`, l.unit, l.quantity, l.price, l.amount]), note: 'Importes y totales calculados en servidor. El impuesto se aplica únicamente a las partidas marcadas como gravadas.' }
}

export async function luloExcel(data: ReportData, kind: LuloReportKind) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Ecosistema FUR'; workbook.created = new Date()
  const sheet = workbook.addWorksheet(names[kind].slice(0, 31), { views: [{ state: 'frozen', ySplit: 8 }] })
  const report = luloReportRows(data, kind)
  const work = data.input.workSnapshot
  const meta = [state(data), `${names[kind]} · ${data.code ?? 'PRELIMINAR'} · v${data.version ?? 1}`, data.input.title, `${data.input.project} · ${data.input.client}${work ? ` · ${work.taxId} · ${work.location} · ${work.contractReference}` : ''}`, `${data.input.currency} · ${data.catalog.label} · Precios base: ${priceDates(data)}${data.input.priceListSnapshot ? ` · Lista ${data.input.priceListSnapshot.name}` : ''}`, `Perfil ${data.result.profile} · ${data.contentHash ?? data.catalog.hash} · ${parameters(data)}`]
  meta.forEach(value => sheet.addRow([value]))
  sheet.addRow([report.note]); sheet.addRow(report.headers)
  for (const row of report.rows) sheet.addRow(row)
  sheet.addRow([])
  for (const [label, value] of [['Subtotal', data.result.totals.subtotal], ['Base imponible', data.result.totals.taxable], [`Impuesto (${data.input.rates.taxPct}%)`, data.result.totals.tax], ['TOTAL', data.result.totals.total]]) sheet.addRow([label, value])
  if (data.input.notes) sheet.addRow(['Notas', data.input.notes])
  sheet.columns = report.headers.map((header, i) => ({ width: i === 1 || header === 'Partida' || header.includes('capítulo') ? 42 : 22 }))
  for (let n = 1; n <= 7; n++) { sheet.mergeCells(n, 1, n, Math.max(2, report.headers.length)); sheet.getRow(n).height = Math.max(20, Math.ceil(String(sheet.getRow(n).getCell(1).value).length / 100) * 15) }
  sheet.eachRow((row, n) => { row.eachCell(cell => { cell.font = { name: 'Arial', size: 10, color: { argb: 'FF102C4C' } }; cell.alignment = { vertical: 'top', wrapText: true }; cell.numFmt = '@' }); if (n === 8) { row.font = { bold: true, color: { argb: 'FFFFFFFF' } }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102C4C' } } } })
  for (let n = 9; n <= 8 + report.rows.length; n++) sheet.getRow(n).height = Math.min(409, Math.max(24, ...report.rows[n - 9].map((value, i) => Math.ceil(value.length / (sheet.getColumn(i + 1).width ?? 22)) * 14 + 8)))
  sheet.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8 + report.rows.length, column: report.headers.length } }
  const audit = workbook.addWorksheet('Datos exactos')
  audit.addRow(['Los decimales se conservan como texto para no perder precisión en Excel. Los totales coinciden con el documento del servidor.'])
  audit.addRow(['Perfil', data.result.profile]); audit.addRow(['Huella', data.contentHash ?? data.catalog.hash]); audit.addRow(['Estado', state(data)])
  audit.addRow(['Parámetros', JSON.stringify(data.input.rates)]); audit.addRow(['Totales', JSON.stringify(data.result.totals)])
  for (const chapter of data.input.chapters) audit.addRow(['Capítulo', JSON.stringify(chapter)])
  for (const line of data.input.lines) audit.addRow(['Partida', JSON.stringify(line)])
  for (const override of data.input.overrides) audit.addRow(['Ajuste privado', JSON.stringify(override)])
  for (const apu of data.catalog.apus) for (const c of apu.components) audit.addRow(['Precio de origen fijado', JSON.stringify({ apu: apu.code, resource: c.resource })])
  audit.columns = [{ width: 25 }, { width: 100 }]
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function luloPdf(data: ReportData, kind: LuloReportKind): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 38, bufferPages: true, info: { Title: `${names[kind]} · ${data.input.title}`, Author: 'Ecosistema FUR' } })
    const parts: Buffer[] = []; doc.on('data', b => parts.push(b)); doc.on('end', () => resolve(Buffer.concat(parts))); doc.on('error', reject)
    try {
      const compiledFont = path.join(__dirname, '../../assets/fonts/NotoSans-Regular.ttf')
      // The source fallback also supports a dev watcher started before asset copying was configured.
      doc.font(readFileSync(existsSync(compiledFont) ? compiledFont : path.join(__dirname, '../../../src/assets/fonts/NotoSans-Regular.ttf')))
      const report = luloReportRows(data, kind)
      const width = doc.page.width - 76
      const base = report.headers.length === 2 ? [width - 130, 130] : kind === 'budget' ? [100, 70, width - 440, 40, 70, 80, 80] : [75, width - 425, 45, 75, 75, 75, 80]
      function heading() {
        doc.fillColor('#102c4c').fontSize(18).text(`FUR  /  ${names[kind]}`, 38, 32)
        doc.fontSize(9).fillColor('#745b12').text(state(data), 38, 59)
        doc.fillColor('#102c4c').fontSize(12).text(data.input.title, 38, 78, { width })
        doc.fontSize(8).fillColor('#53667e').text(`${data.code ?? 'PRELIMINAR'} · v${data.version ?? 1} · ${data.input.currency} · ${data.input.project} · ${data.input.client}`, { width })
        doc.text(`${data.catalog.label} · Perfil: ${data.result.profile}`, { width })
        if (data.input.workSnapshot) doc.text(`${data.input.workSnapshot.taxId} · ${data.input.workSnapshot.location} · ${data.input.workSnapshot.contractReference}`, { width })
        if (data.input.priceListSnapshot) doc.text(`Lista de precios: ${data.input.priceListSnapshot.name} · Fecha base ${data.input.baseDate ?? 'Sin definir'}`, { width })
        doc.text(`Precios base: ${priceDates(data)} · Reporte: ${new Date().toISOString().slice(0, 10)}${data.issuedAt ? ` · Emitido: ${new Date(data.issuedAt).toISOString().slice(0, 10)}` : ''}`, { width })
        doc.text(parameters(data), { width }); doc.moveDown(0.8)
      }
      function tableHeader() {
        const y = doc.y; doc.rect(38, y, width, 24).fill('#102c4c'); let x = 38
        report.headers.forEach((h, i) => { doc.fillColor('white').fontSize(8).text(h, x + 5, y + 6, { width: base[i] - 10, lineBreak: false }); x += base[i] }); doc.y = y + 24; doc.x = 38
      }
      heading(); tableHeader()
      for (const [index, source] of report.rows.entries()) {
        // Split very long cells into continuation rows, preserving every character and avoiding clipped rows.
        const chunks = source.map(value => Array.from(value).join('').match(/[\s\S]{1,350}/gu) ?? [''])
        const count = Math.max(...chunks.map(v => v.length))
        for (let part = 0; part < count; part++) {
          const row = chunks.map(c => c[part] ?? '')
          const heights = row.map((s, i) => doc.fontSize(8).heightOfString(s, { width: base[i] - 10 }))
          const height = Math.max(24, ...heights.map(h => h + 12))
          if (doc.y + height > doc.page.height - 55) { doc.addPage(); heading(); tableHeader() }
          const y = doc.y; if (index % 2 === 0) doc.rect(38, y, width, height).fill('#f2f5f9')
          let x = 38
          row.forEach((s, i) => { doc.fillColor('#102c4c').fontSize(8).text(s, x + 5, y + 6, { width: base[i] - 10 }); x += base[i] }); doc.y = y + height; doc.x = 38
        }
      }
      if (doc.y > doc.page.height - 160) { doc.addPage(); heading() }
      doc.moveDown(1).fillColor('#102c4c').fontSize(10)
      doc.text(`Subtotal: ${data.result.totals.subtotal} ${data.input.currency}     Base imponible: ${data.result.totals.taxable}`)
      doc.text(`Impuesto (${data.input.rates.taxPct}%): ${data.result.totals.tax}     TOTAL: ${data.result.totals.total} ${data.input.currency}`)
      doc.moveDown(0.8).fontSize(8).fillColor('#53667e').text(report.note, { width })
      if (data.input.notes) doc.moveDown().text(`Notas: ${data.input.notes}`, { width })
      const range = doc.bufferedPageRange()
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)
        const margin = doc.page.margins.bottom; doc.page.margins.bottom = 0
        doc.fontSize(7).fillColor('#53667e').text(`${data.code ?? 'PRELIMINAR'} · ${data.contentHash ?? data.catalog.hash} · ${i + 1} / ${range.count}`, 38, doc.page.height - 30, { width, lineBreak: false })
        doc.page.margins.bottom = margin
      }
      doc.end()
    } catch (e) { doc.destroy(); reject(e) }
  })
}
