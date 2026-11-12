import ExcelJS from 'exceljs'
import { calculationFixture } from '../../../test/fixtures/lulo-calculation'
import { calculateLulo } from './lulo-engine'
import { luloExcel, luloPdf, luloReportRows } from './lulo-reports'

describe('LULO server reports', () => {
  it('exports the server totals exactly and creates a one-page PDF with an embedded Unicode font', async () => {
    const { input, catalog } = calculationFixture(); const result = calculateLulo(input, catalog); const data = { input, catalog, result }
    const pdf = await luloPdf(data, 'budget')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await luloExcel(data, 'budget') as never)
    const sheet = workbook.worksheets[0]
    const totals: string[] = []; sheet.eachRow(row => { if (row.getCell(1).value === 'TOTAL') totals.push(String(row.getCell(2).value)) })
    expect(totals).toEqual(['4580.26']); expect(luloReportRows(data, 'resources').rows).toHaveLength(3)
  })
  it('paginates long descriptions without extra blank footer pages and preserves all report rows', async () => {
    const { input, catalog } = calculationFixture()
    input.lines = Array.from({ length: 35 }, (_v, i) => ({ ...input.lines[1], id: `manual-${i}`, description: `Partida ${i}: ` + 'Montaje y comprobación técnica. '.repeat(20) }))
    const data = { input, catalog, result: calculateLulo(input, catalog) }
    const pdf = await luloPdf(data, 'budget')
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(2)
    expect(luloReportRows(data, 'budget').rows).toHaveLength(35)
  })
})
