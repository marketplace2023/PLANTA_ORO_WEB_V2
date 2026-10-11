import { Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { validationError } from '../../common/errors'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import {
  assetModels,
  assetTypes,
  modelVariableValues,
  networkMaster,
  stageMaster,
  variableDefinitions,
  variableNetworks,
  variableStages,
  variableTypes,
  type VariableType,
} from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { GlobalAdminOnly, Public } from '../iam/decorators'
import {
  type CreateVariableDto,
  createVariableSchema,
  parseVariableValue,
  type SetModelVariablesDto,
  setModelVariablesSchema,
  slugCode,
  type UpdateVariableDto,
  updateVariableSchema,
} from './variables'

const listQuery = z.object({
  network: z.string().trim().min(1).max(20).optional(),
  stage: z.string().trim().min(1).max(10).optional(),
  type: z.string().trim().min(1).max(60).optional(),
})

// Referencias calificadas a mano: en un select de una sola tabla drizzle omite el prefijo y `id` se confundiría con el de las subconsultas.
const VD_ID = sql.raw('catalog.variable_definitions.id')

/** Lista (ordenada) de códigos del alcance de una variable: `{}` = todas. */
const scopeCodes = (join: string) => sql<string[]>`coalesce((${sql.raw(join)}), '{}')`

const NETWORK_CODES = scopeCodes(
  `select array_agg(nm.code order by nm.sequence, nm.code) from catalog.variable_networks vn join plant.network_master nm on nm.id = vn.network_master_id where vn.variable_id = catalog.variable_definitions.id`,
)
const STAGE_CODES = scopeCodes(
  `select array_agg(sm.code order by sm.code) from catalog.variable_stages vs join process.stage_master sm on sm.id = vs.stage_master_id where vs.variable_id = catalog.variable_definitions.id`,
)
const TYPE_CODES = scopeCodes(
  `select array_agg(t.code order by t.code) from catalog.variable_types vt join catalog.asset_types t on t.id = vt.asset_type_id where vt.variable_id = catalog.variable_definitions.id`,
)

/** Lógica compartida: definiciones de variables y sus valores por modelo. */
class VariablesBase {
  constructor(
    protected readonly db: Database,
    protected readonly audit: AuditService,
  ) {}

  protected view() {
    return this.db
      .select({
        id: variableDefinitions.id,
        code: variableDefinitions.code,
        label: variableDefinitions.label,
        unit: variableDefinitions.unit,
        valueType: variableDefinitions.valueType,
        defaultValue: variableDefinitions.defaultValue,
        group: variableDefinitions.groupLabel,
        isKey: variableDefinitions.isKey,
        sortOrder: variableDefinitions.sortOrder,
        networkCodes: NETWORK_CODES,
        stageCodes: STAGE_CODES,
        assetTypeCodes: TYPE_CODES,
      })
      .from(variableDefinitions)
  }

  protected async one(id: string) {
    const [row] = await this.view().where(eq(variableDefinitions.id, id))
    if (!row) throw new NotFoundException('Variable no encontrada')
    return row
  }

  /**
   * Variables que aplican a un modelo.
   * - Si la variable lista tipos de activo, aplica a los modelos de esos tipos (asociación explícita).
   * - Si no lista tipos, sus redes y etapas (vacío = todas) deben cumplirse por la clasificación del tipo del modelo **o**
   *   porque algún activo de ese modelo ya está en esa red o etapa.
   * Una variable sin ninguna lista es general y aplica a todos.
   */
  protected async applicable(modelId: string) {
    const [model] = await this.db.select({ id: assetModels.id, typeId: assetModels.assetTypeId }).from(assetModels).where(eq(assetModels.id, modelId))
    if (!model) throw new NotFoundException('Modelo no encontrado')

    const hasTypes = sql`exists (select 1 from catalog.variable_types vt where vt.variable_id = ${VD_ID})`
    const inTypes = sql`exists (select 1 from catalog.variable_types vt where vt.variable_id = ${VD_ID} and vt.asset_type_id = ${model.typeId})`
    const networkOk = sql`(
      not exists (select 1 from catalog.variable_networks vn where vn.variable_id = ${VD_ID})
      or exists (
        select 1 from catalog.variable_networks vn where vn.variable_id = ${VD_ID} and (
          exists (select 1 from catalog.asset_type_networks atn where atn.asset_type_id = ${model.typeId} and atn.network_master_id = vn.network_master_id)
          or exists (select 1 from asset.assets a join asset.asset_networks an on an.asset_id = a.id join plant.plant_networks pn on pn.id = an.plant_network_id
                     where a.asset_model_id = ${modelId} and a.status <> 'DECOMMISSIONED' and pn.network_master_id = vn.network_master_id)))
    )`
    const stageOk = sql`(
      not exists (select 1 from catalog.variable_stages vs where vs.variable_id = ${VD_ID})
      or exists (
        select 1 from catalog.variable_stages vs where vs.variable_id = ${VD_ID} and (
          exists (select 1 from catalog.asset_type_stages ats where ats.asset_type_id = ${model.typeId} and ats.stage_master_id = vs.stage_master_id)
          or exists (select 1 from asset.assets a join process.plant_stages ps on ps.id = a.plant_stage_id
                     where a.asset_model_id = ${modelId} and a.status <> 'DECOMMISSIONED' and ps.stage_master_id = vs.stage_master_id)))
    )`

    const rows = await this.view()
      .where(sql`((${hasTypes} and ${inTypes}) or (not ${hasTypes} and ${networkOk} and ${stageOk}))`)
      .orderBy(asc(variableDefinitions.sortOrder), asc(variableDefinitions.label))
    const values = await this.db.select().from(modelVariableValues).where(eq(modelVariableValues.assetModelId, modelId))
    const byVariable = new Map(values.map((v) => [v.variableId, v.value]))
    return rows.map((r) => ({ ...r, value: byVariable.get(r.id) ?? null }))
  }
}

/** Lectura pública: el catálogo es público y las variables son datos del fabricante. */
@Public()
@Controller('catalog')
export class CatalogVariablesController extends VariablesBase {
  constructor(@Inject(DB) db: Database, audit: AuditService) {
    super(db, audit)
  }

  /** Definiciones; con `network`, `stage` o `type` solo las que incluyen ese código en su alcance. */
  @Get('variables')
  list(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>) {
    const conditions: Array<SQL | undefined> = [
      q.network ? sql`exists (select 1 from catalog.variable_networks vn join plant.network_master nm on nm.id = vn.network_master_id where vn.variable_id = ${VD_ID} and nm.code = ${q.network.toUpperCase()})` : undefined,
      q.stage ? sql`exists (select 1 from catalog.variable_stages vs join process.stage_master sm on sm.id = vs.stage_master_id where vs.variable_id = ${VD_ID} and sm.code = ${q.stage.toUpperCase()})` : undefined,
      q.type ? sql`exists (select 1 from catalog.variable_types vt join catalog.asset_types t on t.id = vt.asset_type_id where vt.variable_id = ${VD_ID} and t.code = ${q.type.toUpperCase()})` : undefined,
    ]
    return this.view()
      .where(and(...conditions))
      .orderBy(asc(variableDefinitions.sortOrder), asc(variableDefinitions.label))
  }

  /** Variables que aplican a un modelo, con el valor propio que tiene (null si aún no registró uno). */
  @Get('models/:id/variables')
  forModel(@Param('id', ParseUUIDPipe) id: string) {
    return this.applicable(id)
  }
}

/** Alta, edición y baja de variables y registro de sus valores: solo el administrador del ecosistema. */
@GlobalAdminOnly()
@Controller('catalog')
export class CatalogVariablesAdminController extends VariablesBase {
  constructor(@Inject(DB) db: Database, audit: AuditService) {
    super(db, audit)
  }

  private async record(req: AppRequest, id: string, action: string, data: { old?: unknown; new?: unknown }) {
    await this.audit.record(req, { module: 'catalog', entityType: 'variable_definition', entityId: id, action, oldData: data.old, newData: data.new })
  }

  /** Resuelve listas de códigos a ids; un código que no existe es un error de validación del campo. */
  private async resolve(field: 'networkCodes' | 'stageCodes' | 'assetTypeCodes', codes: string[]): Promise<string[]> {
    if (codes.length === 0) return []
    const table = field === 'networkCodes' ? networkMaster : field === 'stageCodes' ? stageMaster : assetTypes
    const label = field === 'networkCodes' ? 'La red' : field === 'stageCodes' ? 'La etapa' : 'El tipo'
    const rows = await this.db.select({ id: table.id, code: table.code }).from(table).where(inArray(table.code, codes))
    const missing = codes.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length > 0) throw validationError(field, `${label} ${missing.join(', ')} no existe`)
    return rows.map((r) => r.id)
  }

  /** Reemplaza las listas del alcance que vengan en la petición (las que no vienen no se tocan). */
  private async setScope(variableId: string, ids: { networks?: string[]; stages?: string[]; types?: string[] }) {
    await this.db.transaction(async (tx) => {
      if (ids.networks) {
        await tx.delete(variableNetworks).where(eq(variableNetworks.variableId, variableId))
        if (ids.networks.length) await tx.insert(variableNetworks).values(ids.networks.map((networkMasterId) => ({ variableId, networkMasterId })))
      }
      if (ids.stages) {
        await tx.delete(variableStages).where(eq(variableStages.variableId, variableId))
        if (ids.stages.length) await tx.insert(variableStages).values(ids.stages.map((stageMasterId) => ({ variableId, stageMasterId })))
      }
      if (ids.types) {
        await tx.delete(variableTypes).where(eq(variableTypes.variableId, variableId))
        if (ids.types.length) await tx.insert(variableTypes).values(ids.types.map((assetTypeId) => ({ variableId, assetTypeId })))
      }
    })
  }

  /** Código único a partir del nombre y el alcance: ABERTURA_DE_CRIBADO_PROC_D01, y _2, _3… si ya existe. */
  private async uniqueCode(dto: CreateVariableDto) {
    const single = (list: string[], map: (c: string) => string) => (list.length === 1 ? map(list[0]) : undefined)
    const parts = [slugCode(dto.label), single(dto.networkCodes, (c) => c.replace('FUR-', '')), single(dto.stageCodes, (c) => c), single(dto.assetTypeCodes, (c) => c)]
    const base = parts.filter(Boolean).join('_').slice(0, 56)
    if (base.length < 2) throw validationError('label', 'El nombre debe tener letras o números')
    for (let n = 1; n < 100; n++) {
      const code = n === 1 ? base : `${base}_${n}`
      const [taken] = await this.db.select({ id: variableDefinitions.id }).from(variableDefinitions).where(eq(variableDefinitions.code, code))
      if (!taken) return code
    }
    throw new ConflictException('No se pudo generar un código único; indique uno')
  }

  @Post('variables')
  async create(@Body(new ZodValidationPipe(createVariableSchema)) dto: CreateVariableDto, @Req() req: AppRequest) {
    const ids = {
      networks: await this.resolve('networkCodes', dto.networkCodes),
      stages: await this.resolve('stageCodes', dto.stageCodes),
      types: await this.resolve('assetTypeCodes', dto.assetTypeCodes),
    }
    const defaultValue = dto.defaultValue === undefined || dto.defaultValue === null ? null : parseVariableValue(dto.valueType, 'defaultValue', dto.defaultValue, 'defaultValue')
    let code = dto.code
    if (code) {
      const [taken] = await this.db.select({ id: variableDefinitions.id }).from(variableDefinitions).where(eq(variableDefinitions.code, code))
      if (taken) throw new ConflictException(`Ya existe una variable con el código ${code}`)
    } else {
      code = await this.uniqueCode(dto)
    }
    const [row] = await this.db
      .insert(variableDefinitions)
      .values({ code, label: dto.label, unit: dto.unit, valueType: dto.valueType, defaultValue, groupLabel: dto.group, isKey: dto.isKey, sortOrder: dto.sortOrder })
      .returning({ id: variableDefinitions.id })
    await this.setScope(row.id, ids)
    await this.record(req, row.id, 'created', { new: { ...dto, code } })
    return this.one(row.id)
  }

  @Patch('variables/:id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateVariableSchema)) dto: UpdateVariableDto, @Req() req: AppRequest) {
    const before = await this.one(id)
    const typeChanged = dto.valueType !== undefined && dto.valueType !== before.valueType
    if (typeChanged) {
      const [{ n }] = await this.db.select({ n: count() }).from(modelVariableValues).where(eq(modelVariableValues.variableId, id))
      if (n > 0) throw new ConflictException(`No se puede cambiar el tipo: ${n} modelo(s) ya tienen un valor registrado. Bórralos o crea otra variable.`)
    }
    const effectiveType = (dto.valueType ?? before.valueType) as VariableType
    const ids = {
      networks: dto.networkCodes ? await this.resolve('networkCodes', dto.networkCodes) : undefined,
      stages: dto.stageCodes ? await this.resolve('stageCodes', dto.stageCodes) : undefined,
      types: dto.assetTypeCodes ? await this.resolve('assetTypeCodes', dto.assetTypeCodes) : undefined,
    }
    // El valor general se valida con el tipo; si el tipo cambia y no se manda uno nuevo, el anterior ya no tiene sentido.
    const defaultValue =
      dto.defaultValue === undefined ? (typeChanged ? null : undefined) : dto.defaultValue === null ? null : parseVariableValue(effectiveType, 'defaultValue', dto.defaultValue, 'defaultValue')

    const { networkCodes: _n, stageCodes: _s, assetTypeCodes: _t, defaultValue: _d, group, ...rest } = dto
    const fields = { ...rest, ...(group !== undefined && { groupLabel: group }), ...(defaultValue !== undefined && { defaultValue }) }
    if (Object.keys(fields).length > 0) await this.db.update(variableDefinitions).set(fields).where(eq(variableDefinitions.id, id))
    await this.setScope(id, ids)
    await this.record(req, id, 'updated', { old: before, new: dto })
    return this.one(id)
  }

  /** Elimina la variable y los valores que los modelos tenían registrados para ella. */
  @Delete('variables/:id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const before = await this.one(id)
    const [{ n }] = await this.db.select({ n: count() }).from(modelVariableValues).where(eq(modelVariableValues.variableId, id))
    await this.db.delete(variableDefinitions).where(eq(variableDefinitions.id, id))
    await this.record(req, id, 'deleted', { old: { code: before.code, label: before.label }, new: { removedValues: n } })
  }

  /**
   * Registra los datos del fabricante de un modelo: `{ values: { CODIGO: valor | null } }`. Solo variables que aplican al
   * modelo; `null` borra el valor propio (el modelo vuelve a mostrar el valor general, si la variable lo tiene).
   */
  @Put('models/:id/variables')
  async setValues(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(setModelVariablesSchema)) dto: SetModelVariablesDto, @Req() req: AppRequest) {
    const applicable = new Map((await this.applicable(id)).map((v) => [v.code, v]))
    const writes: Array<{ variableId: string; value: unknown }> = []
    const deletes: string[] = []
    for (const [code, raw] of Object.entries(dto.values)) {
      const def = applicable.get(code)
      if (!def) throw validationError(`values.${code}`, `La variable ${code} no existe o no aplica a este modelo`)
      if (raw === null) deletes.push(def.id)
      else writes.push({ variableId: def.id, value: parseVariableValue(def.valueType as VariableType, code, raw) })
    }
    await this.db.transaction(async (tx) => {
      for (const variableId of deletes) await tx.delete(modelVariableValues).where(and(eq(modelVariableValues.assetModelId, id), eq(modelVariableValues.variableId, variableId)))
      for (const w of writes) {
        await tx
          .insert(modelVariableValues)
          .values({ assetModelId: id, variableId: w.variableId, value: w.value })
          .onConflictDoUpdate({ target: [modelVariableValues.assetModelId, modelVariableValues.variableId], set: { value: w.value, updatedAt: new Date() } })
      }
    })
    await this.audit.record(req, { module: 'catalog', entityType: 'asset_model', entityId: id, action: 'variables.updated', newData: { set: writes.length, removed: deletes.length, codes: Object.keys(dto.values) } })
    return this.applicable(id)
  }
}
