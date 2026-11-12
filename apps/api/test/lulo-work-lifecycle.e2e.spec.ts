import type { INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { documents, documentVersions } from '../src/database/schema'
import { bearer, createApp, login, TestDb, type Session } from './helpers'
import type { WorkRecordInput } from '../src/modules/budget/lulo-works.schemas'
import type { LuloInput } from '../src/modules/budget/lulo.schemas'

describe('LULO: obra → emisión → contrato → dos períodos → reconsideración → cierre', () => {
  let app: INestApplication, db: TestDb, editor: Session, manager: Session, outsider: Session
  let clientId: string, workId: string, plantId: string, otherPlantId: string, document: Record<string, any>, contractId: string, itemId: string, firstValuation: any, secondValuation: any
  const B = '/api/v1/plants/e2e-work1/lulo', evidence = [{ name: 'Acta de campo de prueba', url: 'https://example.test/acta.pdf' }]
  const post = (url: string, body: object, session = editor) => request(app.getHttpServer()).post(url).set('Authorization', bearer(session)).send(body)
  const get = (url: string, session = editor) => request(app.getHttpServer()).get(url).set('Authorization', bearer(session))
  const reason = 'Comprobación de documentos y cantidades de la obra'
  async function create(input: WorkRecordInput) { return (await post(`${B}/contracts/${contractId}/records`, { requestId: randomUUID(), input }).expect(201)).body }
  async function approve(r: any, issue = false) {
    r = (await post(`${B}/contracts/${contractId}/records/${r.id}/submit`, { expectedRevision: r.revision, requestId: randomUUID(), reason }).expect(201)).body
    const preview = (await post(`${B}/contracts/${contractId}/records/${r.id}/preview`, { expectedRevision: r.revision }).expect(201)).body
    const body = { expectedRevision: r.revision, requestId: randomUUID(), reason, previewHash: preview.previewHash }
    const url = `${B}/contracts/${contractId}/records/${r.id}/${issue ? 'issue' : 'approve'}`
    const saved = (await post(url, body, manager).expect(201)).body
    expect((await post(url, body, manager).expect(201)).body.id).toBe(saved.id)
    return saved
  }
  beforeAll(async () => {
    app = await createApp(); db = new TestDb(); await db.cleanup()
    const p = await db.plant('work1', 'PRIVATE'), p2 = await db.plant('work2', 'PRIVATE')
    plantId = p.id; otherPlantId = p2.id
    const e = await db.user('work-editor'); await db.assign(e.id, p.id, 'BUDGET'); const m = await db.user('work-manager'); await db.assign(m.id, p.id, 'PLANT_MANAGER'); const o = await db.user('work-outsider'); await db.assign(o.id, p2.id, 'PLANT_ADMIN')
    ;[editor, manager, outsider] = await Promise.all(['work-editor', 'work-manager', 'work-outsider'].map(n => login(app, n)))
  })
  afterAll(async () => { try { await db.cleanup() } finally { await db.close(); await app.close() } })
  it('creates a real work/client and freezes them into an issued budget', async () => {
    clientId = (await post(`${B}/clients`, { code: 'CLI-01', name: 'Cliente de obra', taxId: 'J-PRUEBA', contact: 'Responsable', address: 'Planta de prueba', status: 'ACTIVE' }).expect(201)).body.id
    workId = (await post(`${B}/works`, { clientId, code: 'OBR-01', name: 'Obra piloto', location: 'Planta', contractReference: 'Contrato de prueba', status: 'ACTIVE' }).expect(201)).body.id
    const input: LuloInput = { workId, title: 'Presupuesto contractual', project: '', client: '', notes: '', publicationId: null, currency: 'USD', precision: 2, rates: { fcasPct: '0', overheadPct: '0', utilityPct: '0', financePct: '0', taxPct: '0' }, chapters: [{ id: 'c1', name: 'Trabajos', parentId: null }], lines: [{ id: 'l1', chapterId: 'c1', code: 'PART-01', description: 'Partida de prueba', unit: 'UND', mode: 'MANUAL', apuId: null, quantity: '100', manualPrice: '25', reason: 'Precio contractual documentado', taxable: true }], overrides: [] }
    document = (await post(`${B}/documents`, { requestId: randomUUID(), input }).expect(201)).body
    expect(document.input.workSnapshot.clientName).toBe('Cliente de obra')
    document = (await post(`${B}/documents/${document.id}/submit`, { expectedRevision: document.revision, reason }).expect(201)).body
    document = (await post(`${B}/documents/${document.id}/issue`, { expectedRevision: document.revision, reason }, manager).expect(201)).body
    const contract = { requestId: randomUUID(), input: { documentId: document.id, workId, code: 'CTR-01', name: 'Contrato piloto', startDate: '2026-01-01', endDate: '2026-12-31', taxPct: '0', amortizationPct: '0', retentionPct: '0', advanceAmount: '0', priceDateBasis: 'EXECUTION_DATE', notes: '', precision: 2 } }
    await post(`${B}/contracts`, contract).expect(403)
    const activated = (await post(`${B}/contracts`, contract, manager).expect(201)).body; contractId = activated.contract.id; itemId = activated.items[0].id
    expect((await post(`${B}/contracts`, contract, manager).expect(201)).body.contract.id).toBe(contractId)
    await get(`${B}/contracts/${contractId}`, outsider).expect(404)
  })
  it('approves an increase and values two periods without consuming a measurement twice', async () => {
    await approve(await create({ kind: 'CHANGE', title: 'Aumento autorizado', evidence, date: '2026-01-02', reason, lines: [{ type: 'INCREASE', itemId, code: '', name: '', unit: '', quantity: '10', price: null, computationId: null }] }))
    const m1 = await approve(await create({ kind: 'MEASUREMENT', title: 'Medición enero', evidence, itemId, date: '2026-01-10', location: 'Zona A', quantity: '30', unit: 'UND', fieldReference: 'CAMPO-01', correctionOf: null, correctionReason: '', computationId: null }))
    firstValuation = await approve(await create({ kind: 'VALUATION', title: 'Valuación enero', evidence, startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ measurementId: m1.id, quantity: '30' }], correctionOf: null, reason: '' }), true)
    expect(firstValuation.result.gross).toBe('750.00'); expect(firstValuation.result.lines[0]).toMatchObject({ contracted: '110.00000000', accumulated: '30.00000000', remaining: '80.00000000' })
    await post(`${B}/contracts/${contractId}/records`, { requestId: randomUUID(), input: { kind: 'VALUATION', title: 'Duplicada', evidence, startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ measurementId: m1.id, quantity: '30' }], correctionOf: null, reason: '' } }).expect(422)
    const m2 = await approve(await create({ kind: 'MEASUREMENT', title: 'Medición febrero', evidence, itemId, date: '2026-02-10', location: 'Zona B', quantity: '20', unit: 'UND', fieldReference: 'CAMPO-02', correctionOf: null, correctionReason: '', computationId: null }))
    secondValuation = await approve(await create({ kind: 'VALUATION', title: 'Valuación febrero', evidence, startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ measurementId: m2.id, quantity: '20' }], correctionOf: null, reason: '' }), true)
    expect(secondValuation.result.gross).toBe('500.00'); expect(secondValuation.result.lines[0]).toMatchObject({ previous: '30.00000000', current: '20.00000000', accumulated: '50.00000000', remaining: '60.00000000' })
    await post(`${B}/contracts/${contractId}/records`, { requestId: randomUUID(), input: { kind: 'CHANGE', title: 'Disminución incompatible', evidence, date: '2026-03-01', reason, lines: [{ type: 'DECREASE', itemId, code: '', name: '', unit: '', quantity: '70', price: null, computationId: null }] } }).expect(422)
    const xlsx = await get(`${B}/contracts/${contractId}/records/${secondValuation.id}/report?format=xlsx`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', b => chunks.push(b)); res.on('end', () => cb(null, Buffer.concat(chunks))) }).expect(200)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx.body); expect(JSON.stringify(workbook.model)).toContain('500.00')
  })
  it('requires field evidence, validates geometry and rejects schedule dependency cycles', async () => {
    await post(`${B}/contracts/${contractId}/records`, { requestId: randomUUID(), input: { kind: 'MEASUREMENT', title: 'Sin evidencia', evidence: [], itemId, date: '2026-03-10', location: 'Zona C', quantity: '1', unit: 'UND', fieldReference: 'CAMPO-03', correctionOf: null, correctionReason: '', computationId: null } }).expect(422)
    const computation = await approve(await create({ kind: 'COMPUTATION', title: 'Conteo', evidence, itemId, location: 'Zona A', rows: [{ label: 'Equipos', formula: 'COUNT', length: '1', width: '1', height: '1', count: '20', factor: '1', lengthUnit: 'M', targetUnit: 'UND', conversionNote: '' }] }))
    expect(computation.result.quantity).toBe('20.00000000')
    const activity = { id: 'a', itemId, name: 'Actividad', startDate: '2026-01-01', endDate: '2026-12-31', weight: '100', predecessors: ['a'] }
    await post(`${B}/contracts/${contractId}/records`, { requestId: randomUUID(), input: { kind: 'SCHEDULE', title: 'Plan con ciclo', evidence, reason, activities: [activity] } }).expect(422)
    await approve(await create({ kind: 'SCHEDULE', title: 'Plan contractual', evidence, reason, activities: [{ ...activity, predecessors: [] }] }))
    const progress = (await get(`${B}/contracts/${contractId}/progress?cutoff=2026-03-31`).expect(200)).body; expect(progress.physicalPct).toBe('45.45')
  })
  it('calculates and emits the 500 × (1.10 − 1) reconsideration with source indices', async () => {
    await approve(await create({ kind: 'INDEX', title: 'Índice base', evidence, series: 'COSTO', date: '2026-01-01', value: '100', source: 'Publicación base de prueba', supersedes: null }))
    await approve(await create({ kind: 'INDEX', title: 'Índice febrero', evidence, series: 'COSTO', date: '2026-02-01', value: '110', source: 'Publicación período de prueba', supersedes: null }))
    const profile = await approve(await create({ kind: 'PROFILE', title: 'Perfil contractual', evidence, formula: 'POLYNOMIAL_V1', date: '2026-01-01', baseDate: '2026-01-01', fixed: '0', allowNegative: false, eligibleItemIds: [itemId], terms: [{ series: 'COSTO', coefficient: '1' }] }))
    const adjustment = await approve(await create({ kind: 'RECONSIDERATION', title: 'Ajuste febrero', evidence, valuationId: secondValuation.id, profileId: profile.id, date: '2026-03-01', itemIds: [itemId], correctionOf: null, reason }), true)
    expect(adjustment.result).toMatchObject({ eligibleBase: '500.00', difference: '50.00' })
    await post(`${B}/contracts/${contractId}/records`, { requestId: randomUUID(), input: adjustment.payload }).expect(422)
  })
  it('freezes the actual version of an internal evidence file and rejects foreign evidence', async () => {
    const [file] = await db.db.insert(documents).values({ plantId, title: 'E2E respaldo LULO', documentType: 'INFORME', visibility: 'INTERNAL' }).returning()
    await db.db.insert(documentVersions).values({ documentId: file.id, version: 1, originalName: 'acta-v1.pdf', mimeType: 'application/pdf', sizeBytes: 1, checksum: 'a'.repeat(64), storageKey: 'e2e-lulo-evidence/v1' })
    const computation = await create({ kind: 'COMPUTATION', title: 'Cómputo con archivo versionado', evidence: [{ name: 'Acta interna', url: '', documentId: file.id }], itemId, location: 'Zona', rows: [{ label: 'Conteo', formula: 'COUNT', length: '1', width: '1', height: '1', count: '1', factor: '1', lengthUnit: 'M', targetUnit: 'UND', conversionNote: '' }] })
    expect(computation.payload.evidence[0]).toMatchObject({ documentVersion: 1, checksum: 'a'.repeat(64) })
    await db.db.insert(documentVersions).values({ documentId: file.id, version: 2, originalName: 'acta-v2.pdf', mimeType: 'application/pdf', sizeBytes: 1, checksum: 'b'.repeat(64), storageKey: 'e2e-lulo-evidence/v2' }); await db.db.update(documents).set({ currentVersion: 2 }).where(eq(documents.id, file.id))
    const approved = await approve(computation); expect(approved.payload.evidence[0].documentVersion).toBe(1)
    const [foreign] = await db.db.insert(documents).values({ plantId: otherPlantId, title: 'E2E evidencia ajena' }).returning()
    await post(`${B}/contracts/${contractId}/records`, { requestId: randomUUID(), input: { ...computation.payload, title: 'Documento con evidencia ajena', evidence: [{ name: 'Ajena', url: '', documentId: foreign.id }] } }).expect(422)
  })
  it('reconciles sources and closes with documented residual obligations, preserving emitted snapshots', async () => {
    const view = (await get(`${B}/contracts/${contractId}/reconciliation?cutoff=2026-12-31`).expect(200)).body
    expect(view.balances).toMatchObject({ gross: '1250.00', adjustments: '50.00', net: '1300.00', paymentBalance: '1300.00' })
    const closeInput = { kind: 'CLOSURE', title: 'Cierre piloto', evidence, cutoff: '2026-12-31', sourceHash: view.sourceHash, resolutions: view.differences.map((d: any) => ({ key: d.key, reason: 'Saldo identificado y aceptado al cierre', responsible: 'Responsable contractual', condition: 'Liquidar según acta de cierre', evidence })), correctionOf: null, reason } as WorkRecordInput
    let close = await create(closeInput)
    close = await approve(close, true)
    if (process.env.LULO_QA_OUTPUT) {
      const output = path.resolve(process.env.LULO_QA_OUTPUT); mkdirSync(output, { recursive: true })
      for (const [name, r] of [['valuacion', secondValuation], ['cierre', close]] as const) for (const format of ['pdf', 'xlsx']) {
        const file = await get(`${B}/contracts/${contractId}/records/${r.id}/report?format=${format}`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', b => chunks.push(b)); res.on('end', () => cb(null, Buffer.concat(chunks))) }).expect(200)
        writeFileSync(path.join(output, `lulo-${name}-qa.${format}`), file.body)
      }
    }
    const contract = (await get(`${B}/contracts/${contractId}`).expect(200)).body; expect(contract.contract.status).toBe('CLOSED'); expect(close.result.sources.length).toBeGreaterThan(5)
    await request(app.getHttpServer()).patch(`${B}/contracts/${contractId}/records/${secondValuation.id}`).set('Authorization', bearer(editor)).send({ expectedRevision: secondValuation.revision, reason, input: secondValuation.payload }).expect(409)
    await post(`${B}/contracts/${contractId}/records/${close.id}/rectify`, { expectedRevision: close.revision, requestId: randomUUID(), reason }, manager).expect(201)
    expect((await get(`${B}/contracts/${contractId}`).expect(200)).body.contract.status).toBe('REOPENED')
  })
  it('serializes simultaneous issues so the same measurement cannot be valued twice', async () => {
    const activated = (await post(`${B}/contracts`, { requestId: randomUUID(), input: { documentId: document.id, workId, code: 'CTR-RACE', name: 'Contrato de concurrencia', startDate: '2026-01-01', endDate: '2026-12-31', taxPct: '0', amortizationPct: '0', retentionPct: '0', advanceAmount: '0', priceDateBasis: 'EXECUTION_DATE', notes: '', precision: 2 } }, manager).expect(201)).body
    const root = `${B}/contracts/${activated.contract.id}`, item = activated.items[0].id
    let measurement = (await post(`${root}/records`, { requestId: randomUUID(), input: { kind: 'MEASUREMENT', title: 'Medición única', evidence, itemId: item, date: '2026-01-10', location: 'Zona', quantity: '20', unit: 'UND', fieldReference: 'RACE-MED', correctionOf: null, correctionReason: '', computationId: null } }).expect(201)).body
    const review = async (r: any) => (await post(`${root}/records/${r.id}/submit`, { expectedRevision: r.revision, requestId: randomUUID(), reason }).expect(201)).body
    measurement = await review(measurement)
    const measurementPreview = (await post(`${root}/records/${measurement.id}/preview`, { expectedRevision: measurement.revision }).expect(201)).body
    await post(`${root}/records/${measurement.id}/approve`, { expectedRevision: measurement.revision, requestId: randomUUID(), reason, previewHash: measurementPreview.previewHash }, manager).expect(201)
    const candidates = []
    for (const title of ['Valuación A', 'Valuación B']) {
      const r = await review((await post(`${root}/records`, { requestId: randomUUID(), input: { kind: 'VALUATION', title, evidence, startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ measurementId: measurement.id, quantity: '20' }], correctionOf: null, reason: '' } }).expect(201)).body)
      const preview = (await post(`${root}/records/${r.id}/preview`, { expectedRevision: r.revision }).expect(201)).body
      candidates.push({ r, preview })
    }
    const responses = await Promise.all(candidates.map(({ r, preview }) => post(`${root}/records/${r.id}/issue`, { expectedRevision: r.revision, requestId: randomUUID(), reason, previewHash: preview.previewHash }, manager)))
    expect(responses.map(r => r.status).sort()).toEqual([201, 422])
    const ctx = (await get(root).expect(200)).body; expect(ctx.assignments).toHaveLength(1)
  })
})
