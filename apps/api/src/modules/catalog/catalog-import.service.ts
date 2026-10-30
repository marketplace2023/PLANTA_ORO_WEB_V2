import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import type { AppRequest } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { uuidv7 } from '../../database/schema/common'
import { assetFamilies, assetModels, assetModelStages, assetModelNetworks, assetTypes, assetTypeStages, auditEvents, networkMaster, stageMaster } from '../../database/schema'
import { normalized, parseMasterWorkbook, type ImportIssue, type ImportReferenceManufacturer, type MasterWorkbook } from './catalog-import.xlsx'
import { referenceIdentity } from './reference-manufacturers'

type Connection = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>
const codeFor = (prefix: string, value: string) => `${prefix}_${createHash('sha256').update(normalized(value)).digest('hex').slice(0, 20).toUpperCase()}`
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
async function snapshot(db: Connection) {
  // Dentro de una transacción se comparte una conexión pg: las consultas van en serie.
  const families = await db.select().from(assetFamilies)
  const types = await db.select().from(assetTypes)
  const models = await db.select().from(assetModels)
  const stages = await db.select().from(stageMaster)
  const networks = await db.select().from(networkMaster)
  const typeStages = await db.select().from(assetTypeStages)
  const modelStages = await db.select().from(assetModelStages)
  const modelNetworks = await db.select().from(assetModelNetworks)
  return { families, types, models, stages, networks, typeStages, modelStages, modelNetworks }
}
type State = Awaited<ReturnType<typeof snapshot>>
type Action = 'create' | 'update'
export type CatalogImportPreview = {
  fingerprint: string; issues: ImportIssue[]
  networks: Array<{ code: string; name: string }>
  summary: { models: { create: number; update: number }; families: { create: number; update: number }; types: { create: number; update: number }; manufacturers: { create: number; update: number; merged: number }; specifications: number }
  rows: Array<{ tag: string; name: string; family: string; type: string; manufacturer: string; stages: string[]; components: string[]; referenceManufacturers: ImportReferenceManufacturer[] | null; specifications: Record<string, string>; action: Action }>
}

function plan(book: MasterWorkbook, state: State, networkCodes: string[]) {
  const selectedNetworks = [...new Set(networkCodes)].sort().map(code => {
    const network = state.networks.find(n => n.code === code)
    if (!network) throw new BadRequestException(`La red ${code} no existe. Actualiza las redes y vuelve a analizar el Excel.`)
    return network
  })
  const issues = [...book.issues]
  const issue = (message: string, row = 1) => issues.push({ sheet: 'Listado maestro', row, message })
  // La confirmación queda ligada al archivo, las redes elegidas y el estado del catálogo revisado.
  const stateKey = Object.values(state).map(rows => [...rows].map(r => JSON.stringify(r)).sort())
  const fingerprint = createHash('sha256').update(book.fingerprint + JSON.stringify(stateKey) + JSON.stringify(selectedNetworks.map(n => n.code))).digest('hex')
  const unique = <T>(rows: T[], description: string): T | undefined => {
    if (rows.length > 1) issue(`Coincidencia ambigua en ${description}; corrige los duplicados antes de importar`)
    return rows[0]
  }
  const familyOps = new Map<string, { id: string; code: string; categoryCode: string; name: string; action: Action }>()
  const typeOps = new Map<string, { id: string; code: string; name: string; familyId: string; stageIds: Set<string>; action: Action }>()
  const models: Array<{ id: string; catalogTag: string; modelName: string; assetTypeId: string; specifications: Record<string, string>; technicalData: Record<string, unknown>; stageId: string; action: Action; duplicateIdentityAllowed: boolean }> = []
  const previewRows: CatalogImportPreview['rows'] = []
  const sourceRows = new Map(book.rows.map(row => [row.tag, row.row]))
  const existingTags = new Map<string, State['models']>()
  for (const model of state.models) {
    if (!model.catalogTag) continue
    const tag = model.catalogTag.trim().toUpperCase()
    existingTags.set(tag, [...(existingTags.get(tag) ?? []), model])
  }
  const effectiveStages = (modelId: string, typeId: string) => {
    const own = state.modelStages.filter(s => s.assetModelId === modelId).map(s => s.stageMasterId)
    return own.length ? own : state.typeStages.filter(s => s.assetTypeId === typeId).map(s => s.stageMasterId)
  }
  const typeFamilies = new Map<string, Set<string>>()
  for (const row of book.rows) {
    const key = normalized(row.type)
    if (!typeFamilies.has(key)) typeFamilies.set(key, new Set())
    typeFamilies.get(key)!.add(row.categoryCode)
  }
  for (const r of book.rows) {
    const taggedModels = existingTags.get(r.tag)
    if (taggedModels) {
      const modelIds = new Set(taggedModels.map(m => m.id))
      const networkIds = new Set(state.modelNetworks.filter(n => modelIds.has(n.assetModelId)).map(n => n.networkMasterId))
      const networks = state.networks.filter(n => networkIds.has(n.id)).sort((a, b) => a.code.localeCompare(b.code))
      issues.push({ sheet: 'Listado maestro', row: r.row, code: 'TAG_ALREADY_EXISTS',
        message: `El TAG ${r.tag} ya existe en el catálogo. Redes actuales: ${networks.length ? networks.map(n => `${n.name} (${n.code})`).join(', ') : 'sin redes asignadas'}. No se permite importarlo ni sobrescribirlo.` })
      continue
    }
    let family = familyOps.get(r.categoryCode)
    if (!family) {
      const existing = unique(state.families.filter(f => f.categoryCode === r.categoryCode || (!f.categoryCode && normalized(f.name) === normalized(r.family))), `familia ${r.family}`)
      family = { id: existing?.id ?? uuidv7(), code: existing?.code ?? `N4_${r.categoryCode}`, categoryCode: r.categoryCode, name: r.family, action: existing ? 'update' : 'create' }
      if (state.families.some(f => f.code === family!.code && f.id !== family!.id)) issue(`El código de familia ${family.code} ya está ocupado`, r.row)
      familyOps.set(r.categoryCode, family)
    }
    const stage = unique(state.stages.filter(s => normalized(s.name) === normalized(r.stage)), `etapa ${r.stage}`)
    if (!stage) { issue(`Etapa desconocida: ${r.stage}`, r.row); continue }
    const typeName = normalized(r.type), typeKey = `${r.categoryCode}:${typeName}`
    let type = typeOps.get(typeKey)
    if (!type) {
      const inFamily = state.types.filter(t => normalized(t.name) === typeName && t.familyId === family!.id)
      // Un mismo nombre puede existir en familias diferentes; cada pareja familia/tipo tiene identidad propia.
      const candidates = inFamily.length ? inFamily : typeFamilies.get(typeName)!.size === 1 ? state.types.filter(t => normalized(t.name) === typeName) : []
      const existing = unique(candidates, `tipo ${r.family} / ${r.type}`)
      type = { id: existing?.id ?? uuidv7(), code: existing?.code ?? codeFor('LM', typeKey), name: r.type, familyId: family.id, stageIds: new Set(state.typeStages.filter(s => s.assetTypeId === existing?.id).map(s => s.stageMasterId)), action: existing ? 'update' : 'create' }
      if (state.types.some(t => t.code === type!.code && t.id !== type!.id)) issue(`El código de tipo ${type.code} ya está ocupado`, r.row)
      typeOps.set(typeKey, type)
    }
    type.stageIds.add(stage.id)
    // Solo se adopta un modelo anterior sin TAG si coincide también en la etapa.
    const existing = unique(state.models.filter(m => !m.catalogTag && !models.some(planned => planned.id === m.id) && m.assetTypeId === type!.id && (r.referenceManufacturers === null || referenceIdentity(m.technicalData) === referenceIdentity({ fabricantesReferencia: r.referenceManufacturers })) && m.modelName === r.name && effectiveStages(m.id, m.assetTypeId).includes(stage.id)), `modelo ${r.name} en la etapa ${stage.code}`)
    const action: Action = existing ? 'update' : 'create'
    const technicalData = record(existing?.technicalData)
    models.push({ id: existing?.id ?? uuidv7(), catalogTag: r.tag, modelName: r.name, assetTypeId: type.id, specifications: r.specifications,
      technicalData: { ...technicalData, identificacion: { ...record(technicalData.identificacion), 'TAG ACTIVO': r.tag }, componentes: r.components,
        ...(r.referenceManufacturers === null ? {} : { fabricantesReferencia: r.referenceManufacturers }) }, stageId: stage.id, action, duplicateIdentityAllowed: false })
    previewRows.push({ tag: r.tag, name: r.name, family: r.family, type: r.type, manufacturer: (r.referenceManufacturers ?? []).map(m => m.nombre).join(', '), stages: [stage.code], components: r.components, referenceManufacturers: r.referenceManufacturers, specifications: r.specifications, action })
  }
  // Compara el estado final de los modelos nuevos y de los modelos anteriores sin TAG que se adoptan.
  // La misma regla usa el conjunto de fabricantes de referencia, independientemente del orden.
  type Identity = { assetTypeId: string; referenceKey: string; modelName: string; tag: string | null; row?: number; stages: string[]; duplicateIdentityAllowed: boolean }
  const finalModels = new Map<string, Identity>(state.models.map(m => {
    const currentStages = effectiveStages(m.id, m.assetTypeId)
    const typePlan = [...typeOps.values()].find(t => t.id === m.assetTypeId)
    return [m.id, { ...m, referenceKey: referenceIdentity(m.technicalData), tag: m.catalogTag,
      stages: currentStages.length ? currentStages : [...(typePlan?.stageIds ?? [])] }]
  }))
  for (const m of models) finalModels.set(m.id, { ...m, referenceKey: referenceIdentity(m.technicalData), tag: m.catalogTag, row: sourceRows.get(m.catalogTag), stages: [m.stageId] })
  const finalKeys = new Map<string, { id: string; model: Identity }>()
  for (const [id, m] of finalModels) {
    for (const stageId of m.stages.length ? m.stages : ['']) {
      const key = JSON.stringify([m.assetTypeId, m.referenceKey, m.modelName, stageId])
      const previous = finalKeys.get(key)
      if (previous && previous.id !== id) {
        // Los duplicados ya aceptados no deben bloquear futuras cargas de otros activos.
        const original = state.models.find(model => model.id === id)
        const originalPeer = state.models.find(model => model.id === previous.id)
        const hadStage = (model: State['models'][number] | undefined) => {
          const stages = model ? effectiveStages(model.id, model.assetTypeId) : []
          return (stages.length ? stages : ['']).includes(stageId)
        }
        if (!m.row && !previous.model.row && (m.duplicateIdentityAllowed || previous.model.duplicateIdentityAllowed)
          && referenceIdentity(original?.technicalData) === referenceIdentity(originalPeer?.technicalData) && hadStage(original) && hadStage(originalPeer)) continue
        const imported = models.find(model => model.id === id && model.action === 'create')
        if (imported) {
          imported.duplicateIdentityAllowed = true
          const peer = models.find(model => model.id === previous.id)
          if (peer) peer.duplicateIdentityAllowed = true
        }
        const stage = state.stages.find(s => s.id === stageId)
        const label = (model: Identity) => model.tag ? `TAG ${model.tag}${model.row ? ` (fila ${model.row})` : ' (catálogo existente)'}` : `modelo existente «${model.modelName}»`
        issues.push({ sheet: 'Listado maestro', row: m.row ?? previous.model.row ?? 1, ...(imported ? { code: 'DUPLICATE_MODEL_IDENTITY' as const } : {}),
          message: `Dos modelos distintos comparten tipo, fabricantes de referencia, nombre «${m.modelName}» y etapa ${stage ? `${stage.code} · ${stage.name}` : 'sin asignar'}: ${label(previous.model)} y ${label(m)}. ${imported ? 'Revisa esos registros o acepta importar los modelos duplicados con TAG distintos.' : 'Usa etapas distintas o revisa esos registros.'}` })
      } else finalKeys.set(key, { id, model: m })
    }
  }
  const counts = (rows: Array<{ action: Action }>) => ({ create: rows.filter(r => r.action === 'create').length, update: rows.filter(r => r.action === 'update').length })
  const preview: CatalogImportPreview = { fingerprint, issues, networks: selectedNetworks.map(({ code, name }) => ({ code, name })), summary: { models: counts(models), families: counts([...familyOps.values()]), types: counts([...typeOps.values()]), manufacturers: { create: 0, update: 0, merged: 0 }, specifications: book.specificationCount }, rows: previewRows }
  return { preview, families: [...familyOps.values()], types: [...typeOps.values()], models, selectedNetworks }
}

@Injectable()
export class CatalogImportService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async preview(buffer: Buffer, networkCodes: string[]) {
    const book = await parseMasterWorkbook(buffer)
    return plan(book, await snapshot(this.db), networkCodes).preview
  }

  async apply(buffer: Buffer, fingerprint: string, networkCodes: string[], req: AppRequest, allowMissingSpecifications = false, allowDuplicateModels = false) {
    const book = await parseMasterWorkbook(buffer)
    return this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('catalog-master-import'))`)
      // Bloquea también las altas/ediciones manuales mientras se revalida y aplica la carga.
      await tx.execute(sql`lock table catalog.asset_families, catalog.asset_types, catalog.asset_models, catalog.asset_type_stages, catalog.asset_model_stages, catalog.asset_model_networks, process.stage_master, plant.network_master in share row exclusive mode`)
      const state = await snapshot(tx)
      const p = plan(book, state, networkCodes)
      const blockingIssues = p.preview.issues.filter(i => !(allowMissingSpecifications && i.code === 'MISSING_SPECIFICATIONS') && !(allowDuplicateModels && i.code === 'DUPLICATE_MODEL_IDENTITY'))
      if (blockingIssues.length) throw new BadRequestException({ message: 'Corrige los errores del Excel antes de importar', errors: blockingIssues.map(i => ({ path: `${i.sheet}:${i.row}`, message: i.message })) })
      if (p.preview.fingerprint !== fingerprint) throw new ConflictException('El archivo, las redes seleccionadas o el catálogo cambiaron desde la vista previa. Vuelve a analizar el Excel.')
      for (const { action, ...row } of p.families) {
        if (action === 'create') await tx.insert(assetFamilies).values(row)
        else await tx.update(assetFamilies).set({ name: row.name, categoryCode: row.categoryCode }).where(eq(assetFamilies.id, row.id))
      }
      const importedIds = new Set(p.models.map(m => m.id))
      for (const { action, stageIds, ...row } of p.types) {
        if (action === 'create') await tx.insert(assetTypes).values(row)
        else {
          // Conserva las etapas efectivas de modelos ajenos a esta carga que antes heredaban del tipo.
          const oldStages = state.typeStages.filter(s => s.assetTypeId === row.id)
          for (const model of state.models.filter(m => m.assetTypeId === row.id && !importedIds.has(m.id))) {
            if (!state.modelStages.some(s => s.assetModelId === model.id) && oldStages.length) {
              await tx.insert(assetModelStages).values(oldStages.map(s => ({ assetModelId: model.id, stageMasterId: s.stageMasterId })))
            }
          }
          await tx.update(assetTypes).set({ name: row.name, familyId: row.familyId }).where(eq(assetTypes.id, row.id))
        }
        await tx.delete(assetTypeStages).where(eq(assetTypeStages.assetTypeId, row.id))
        await tx.insert(assetTypeStages).values([...stageIds].map(stageMasterId => ({ assetTypeId: row.id, stageMasterId })))
      }
      for (const { action, stageId, ...row } of p.models) {
        if (action === 'create') await tx.insert(assetModels).values(row)
        else await tx.update(assetModels).set(row).where(eq(assetModels.id, row.id))
        await tx.delete(assetModelStages).where(eq(assetModelStages.assetModelId, row.id))
        await tx.insert(assetModelStages).values({ assetModelId: row.id, stageMasterId: stageId })
        await tx.delete(assetModelNetworks).where(eq(assetModelNetworks.assetModelId, row.id))
        await tx.insert(assetModelNetworks).values(p.selectedNetworks.map(n => ({ assetModelId: row.id, networkMasterId: n.id })))
      }
      await tx.insert(auditEvents).values({ module: 'catalog', entityType: 'master_import', action: 'imported', userId: req.user?.id,
        oldData: { models: state.models.filter(m => importedIds.has(m.id)), families: state.families.filter(f => p.families.some(x => x.id === f.id)), types: state.types.filter(t => p.types.some(x => x.id === t.id)) },
        newData: { fileHash: book.fingerprint, networks: p.preview.networks, allowMissingSpecifications, allowDuplicateModels, duplicateTags: p.models.filter(m => m.duplicateIdentityAllowed).map(m => m.catalogTag), summary: p.preview.summary, tags: p.models.map(m => m.catalogTag) }, ipAddress: req.ip, userAgent: req.headers['user-agent'], correlationId: req.correlationId })
      return { ...p.preview, imported: p.models.length }
    })
  }
}
