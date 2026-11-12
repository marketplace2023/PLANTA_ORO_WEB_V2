import { NotFoundException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { WorkContext, WorkRecord } from './lulo-works.engine'

const titles: Record<string, string> = { COMPUTATION: 'Cómputo métrico', MEASUREMENT: 'Medición de obra', CHANGE: 'Orden de cambio', VALUATION: 'Valuación de obra', SCHEDULE: 'Cronograma', INDEX: 'Índice publicado', PROFILE: 'Perfil de reconsideración', RECONSIDERATION: 'Reconsideración de precios', BALANCE: 'Movimiento de saldo', CLOSURE: 'Cuadro de cierre' }
type Table = { title: string; headers: string[]; rows: string[][] }
const rows = (value: unknown) => (value ?? []) as Record<string, unknown>[]
function table(title: string, source: unknown, fields: [string, string][]): Table { return { title, headers: fields.map(f => f[1]), rows: rows(source).map(r => fields.map(([key]) => r[key] == null ? '—' : String(r[key]))) } }
export function workReportTables(r: WorkRecord): Table[] {
  const p = r.payload, result = r.result
  if (p.kind === 'VALUATION') return [table('Cantidades e importes', result.lines, [['code', 'Partida'], ['unit', 'Ud.'], ['contracted', 'Contratada'], ['previous', 'Anterior'], ['current', 'Actual'], ['accumulated', 'Acumulada'], ['remaining', 'Saldo'], ['amount', 'Importe']]), table('Mediciones de origen', result.allocations, [['measurementId', 'ID medición'], ['date', 'Fecha ejecución'], ['quantity', 'Cantidad'], ['price', 'Precio aplicado'], ['amount', 'Importe']]), { title: 'Conceptos del período', headers: ['Concepto', 'Importe'], rows: [['Bruto', String(result.gross)], ['Base gravada', String(result.taxableBase ?? result.gross)], ['Impuesto', String(result.tax)], ['Amortización', String(result.amortization)], ['Retención', String(result.retention)], ['Neto documentado', String(result.net)]] }]
  if (p.kind === 'CLOSURE') return [table('Demostrativo de cantidades', result.lines, [['code', 'Partida'], ['unit', 'Ud.'], ['original', 'Original'], ['current', 'Vigente'], ['measured', 'Medida'], ['valued', 'Valuada'], ['remaining', 'Saldo'], ['measuredNotValued', 'Sin valuar']]), table('Importes contractuales', result.lines, [['code', 'Partida'], ['name', 'Descripción'], ['originalAmount', 'Monto original'], ['currentAmount', 'Monto vigente']]), { title: 'Conciliación de importes y saldos', headers: ['Concepto', 'Importe'], rows: Object.entries(result.balances as Record<string, string>).map(([k, v]) => [({ gross: 'Bruto ejecutado', tax: 'Impuesto', amortization: 'Amortización', retention: 'Retención', adjustments: 'Reconsideraciones', net: 'Neto documentado', advances: 'Anticipos desembolsados', advanceReturns: 'Devoluciones de anticipo', advanceBalance: 'Saldo de anticipo', retentionReleased: 'Retenciones liberadas', retentionBalance: 'Saldo de retención', payments: 'Pagos registrados', paymentBalance: 'Saldo de pagos por confirmar' } as Record<string, string>)[k] ?? k, v]) }, table('Resoluciones y obligaciones', p.resolutions, [['key', 'Diferencia'], ['reason', 'Resolución'], ['responsible', 'Responsable'], ['condition', 'Condición de liquidación']]), table('Expediente de documentos fuente', result.sources, [['code', 'Documento'], ['kind', 'Tipo'], ['issuedAt', 'Fecha'], ['hash', 'Huella']])]
  if (p.kind === 'COMPUTATION') return [table(`Ubicación: ${p.location}`, result.rows, [['label', 'Detalle'], ['formula', 'Fórmula'], ['length', 'Longitud'], ['width', 'Ancho'], ['height', 'Alto'], ['count', 'Repeticiones'], ['factor', 'Factor'], ['quantity', 'Resultado']]), { title: 'Resultado', headers: ['Cantidad', 'Unidad'], rows: [[String(result.quantity), String(result.unit)]] }]
  if (p.kind === 'CHANGE') return [table(`Vigencia ${p.date} · ${p.reason}`, result.appliedLines, [['type', 'Movimiento'], ['code', 'Código'], ['name', 'Descripción'], ['previousQuantity', 'Cantidad anterior'], ['quantity', 'Variación'], ['quantityAfter', 'Cantidad vigente'], ['price', 'Precio acordado']])]
  if (p.kind === 'RECONSIDERATION') return [table('Índices y coeficientes aplicados', result.terms, [['series', 'Serie'], ['coefficient', 'Coeficiente'], ['base', 'Índice base'], ['current', 'Índice período'], ['contribution', 'Término']]), { title: `${result.formula} · Valuación ${result.valuationCode}`, headers: ['Concepto', 'Valor'], rows: [['Base elegible', String(result.eligibleBase)], ['Componente fijo', String(result.fixed)], ['Factor', String(result.factor)], ['Ajuste total al alcance', String(result.totalDifference)], ['Ajustes previos', String(result.previousAdjustments)], ['Diferencia incremental', String(result.difference)], ['Impuesto del ajuste', String(result.tax ?? '0')], ['Retención del ajuste', String(result.retention ?? '0')], ['Amortización del ajuste', String(result.amortization ?? '0')], ['Neto del ajuste', String(result.net ?? result.difference)]] }]
  if (p.kind === 'SCHEDULE') return [table('Actividades y dependencias', p.activities.map(a => ({ ...a, predecessors: a.predecessors.join(', ') })), [['name', 'Actividad'], ['startDate', 'Inicio'], ['endDate', 'Fin'], ['weight', 'Peso %'], ['predecessors', 'Predecesoras']])]
  if (p.kind === 'PROFILE') return [table('Coeficientes', p.terms, [['series', 'Serie'], ['coefficient', 'Coeficiente']]), { title: 'Regla contractual', headers: ['Fórmula', 'Vigencia', 'Fecha base', 'Componente fijo'], rows: [[p.formula, p.date, p.baseDate, p.fixed]] }]
  return [{ title: titles[p.kind], headers: ['Dato', 'Valor'], rows: Object.entries(result).filter(([, v]) => typeof v === 'string').map(([k, v]) => [({ itemId: 'Partida contractual', quantity: 'Cantidad', measuredTotal: 'Acumulado medido', unit: 'Unidad', priceAtExecution: 'Precio por vigencia', correctionOf: 'Documento corregido', series: 'Serie de índice', date: 'Fecha', value: 'Valor', source: 'Fuente', supersedes: 'Revisión de origen', type: 'Concepto', amount: 'Importe', reference: 'Referencia' } as Record<string, string>)[k] ?? k, String(v)]) }]
}
export async function workReport(ctx: WorkContext, recordId: string, format: 'pdf' | 'xlsx') {
  const r = ctx.records.find(r => r.id === recordId); if (!r) throw new NotFoundException('Documento no encontrado')
  const tables = workReportTables(r); const meta = [`FUR · ${titles[r.kind]} · ${r.code}`, r.title, `${ctx.contract.code} · ${ctx.contract.name} · ${ctx.contract.currency}`, `${r.status === 'ISSUED' || r.status === 'APPROVED' ? 'DOCUMENTO AUTORIZADO' : 'BORRADOR — SIN EMITIR'} · revisión ${r.revision}`, `Fecha ${r.issuedAt?.toISOString() ?? r.createdAt.toISOString()} · Huella ${r.contentHash}`]
  const annexes = [...r.payload.evidence, ...(r.payload.kind === 'CLOSURE' ? r.payload.resolutions.flatMap(x => x.evidence) : [])]
  if (annexes.length) tables.push({ title: 'Anexos y evidencias', headers: ['Documento', 'Referencia / versión', 'Huella de archivo'], rows: annexes.map(e => [e.name, e.documentId ? `${e.documentId} · v${e.documentVersion ?? '—'}` : e.url, e.checksum ?? 'Referencia externa']) })
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Ecosistema FUR'
    for (const [i, t] of tables.entries()) {
      const s = wb.addWorksheet(`${i + 1} ${t.title}`.replace(/[\\/*?:\[\]]/g, '').slice(0, 31))
      meta.forEach(m => s.addRow([m])); s.addRow([]); s.addRow(t.headers); t.rows.forEach(r => s.addRow(r))
      s.columns = t.headers.map((_, i) => ({ width: i === 0 ? 30 : 24 }))
      s.eachRow((row, n) => {
        row.eachCell(c => { c.numFmt = '@'; c.alignment = { wrapText: true, vertical: 'top' }; c.font = { name: 'Arial', size: 10 } })
        if (n === 7) { row.font = { bold: true, color: { argb: 'FFFFFFFF' } }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102C4C' } } }
      })
      for (let n = 1; n <= 5; n++) { s.mergeCells(n, 1, n, Math.max(2, t.headers.length)); s.getRow(n).height = n === 5 ? 36 : 24 }
      s.views = [{ state: 'frozen', ySplit: 7 }]
    }
    return { code: r.code, buffer: Buffer.from(await wb.xlsx.writeBuffer()) }
  }
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true }); const chunks: Buffer[] = []
    doc.on('data', b => chunks.push(b)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject)
    const font = path.join(__dirname, '../../assets/fonts/NotoSans-Regular.ttf'); doc.font(readFileSync(existsSync(font) ? font : path.join(__dirname, '../../../src/assets/fonts/NotoSans-Regular.ttf')))
    const width = doc.page.width - 72
    const heading = () => { doc.fillColor('#102c4c').fontSize(15).text(meta[0], 36, 24, { width }); doc.fontSize(10).text(meta[1], { width }); doc.fontSize(8).fillColor('#53667e').text(meta[2], { width }).text(meta[3], { width }); doc.moveDown() }
    heading()
    for (const t of tables) {
      if (doc.y > doc.page.height - 110) { doc.addPage(); heading() }
      doc.fontSize(11).fillColor('#102c4c').text(t.title, 36, doc.y, { width }); doc.moveDown(0.5)
      const col = width / t.headers.length
      const head = () => { const y = doc.y; doc.rect(36, y, width, 24).fill('#102c4c'); t.headers.forEach((v, i) => doc.fontSize(8).fillColor('white').text(v, 40 + col * i, y + 5, { width: col - 8, height: 20 })); doc.y = y + 24; doc.x = 36 }
      head()
      for (const [i, row] of t.rows.entries()) {
        const parts = row.map(v => v.match(/[\s\S]{1,250}/g) ?? [''])
        for (let part = 0; part < Math.max(...parts.map(p => p.length)); part++) {
          const values = parts.map(p => p[part] ?? ''), height = Math.max(24, ...values.map(v => doc.fontSize(8).heightOfString(v, { width: col - 8 }) + 10))
          if (doc.y + height > doc.page.height - 46) { doc.addPage(); heading(); head() }
          const y = doc.y; if (i % 2 === 0) doc.rect(36, y, width, height).fill('#f2f5f9'); values.forEach((v, n) => doc.fontSize(8).fillColor('#102c4c').text(v, 40 + col * n, y + 5, { width: col - 8 })); doc.y = y + height; doc.x = 36
        }
      }
      doc.moveDown()
    }
    const pages = doc.bufferedPageRange(); for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.page.margins.bottom = 0; doc.fillColor('#53667e').fontSize(7).text(`${r.code} · ${r.contentHash} · ${i + 1}/${pages.count}`, 36, doc.page.height - 25, { width, lineBreak: false }) }; doc.end()
  })
  return { code: r.code, buffer }
}
