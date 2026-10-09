import { Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { validationError } from '../../common/errors'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { assetModels, assetTypes, modelVariableValues, networkMaster, stageMaster, variableDefinitions, type VariableType } from '../../database/schema'
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
        group: variableDefinitions.groupLabel,
        isKey: variableDefinitions.isKey,
        sortOrder: variableDefinitions.sortOrder,
        networkCode: networkMaster.code,
        networkName: networkMaster.name,
        stageCode: stageMaster.code,
        assetTypeCode: assetTypes.code,
      })
      .from(variableDefinitions)
      .leftJoin(networkMaster, eq(networkMaster.id, variableDefinitions.networkMasterId))
      .leftJoin(stageMaster, eq(stageMaster.id, variableDefinitions.stageMasterId))
      .leftJoin(assetTypes, eq(assetTypes.id, variableDefinitions.assetTypeId))
  }

  protected async one(id: string) {
    const [row] = await this.view().where(eq(variableDefinitions.id, id))
    if (!row) throw new NotFoundException('Variable no encontrada')
    return row
  }

  /**
   * Variables que aplican a un modelo. Si la variable nombra un tipo de activo, aplica a los modelos de ese tipo y nada más
   * (asociación explícita). Si no nombra tipo, la red y la etapa de la variable (vacío = todas) deben cumplirse por la
   * clasificación del tipo **o** porque algún activo de ese modelo ya está en esa red o etapa: así una variable de la red
   * de Potencia aplica a un equipo que pertenece a Potencia aunque su tipo no esté clasificado ahí.
   */
  protected async applicable(modelId: string) {
    const [model] = await this.db.select({ id: assetModels.id, typeId: assetModels.assetTypeId }).from(assetModels).where(eq(assetModels.id, modelId))
    if (!model) throw new NotFoundException('Modelo no encontrado')
    const rows = await this.view()
      .where(
        sql`(${variableDefinitions.assetTypeId} = ${model.typeId} or (
          ${variableDefinitions.assetTypeId} is null
          and (${variableDefinitions.networkMasterId} is null
            or exists (select 1 from catalog.asset_type_networks atn where atn.asset_type_id = ${model.typeId} and atn.network_master_id = ${variableDefinitions.networkMasterId})
            or exists (select 1 from asset.assets a join asset.asset_networks an on an.asset_id = a.id join plant.plant_networks pn on pn.id = an.plant_network_id
                       where a.asset_model_id = ${modelId} and a.status <> 'DECOMMISSIONED' and pn.network_master_id = ${variableDefinitions.networkMasterId}))
          and (${variableDefinitions.stageMasterId} is null
            or exists (select 1 from catalog.asset_type_stages ats where ats.asset_type_id = ${model.typeId} and ats.stage_master_id = ${variableDefinitions.stageMasterId})
            or exists (select 1 from asset.assets a join process.plant_stages ps on ps.id = a.plant_stage_id
                       where a.asset_model_id = ${modelId} and a.status <> 'DECOMMISSIONED' and ps.stage_master_id = ${variableDefinitions.stageMasterId}))
        ))`,
      )
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

  /** Definiciones, filtrables por el alcance exacto que tienen (red, etapa o tipo). */
  @Get('variables')
  list(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>) {
    const conditions: Array<SQL | undefined> = [
      q.network ? eq(networkMaster.code, q.network.toUpperCase()) : undefined,
      q.stage ? eq(stageMaster.code, q.stage.toUpperCase()) : undefined,
      q.type ? eq(assetTypes.code, q.type.toUpperCase()) : undefined,
    ]
    return this.view()
      .where(and(...conditions))
      .orderBy(asc(variableDefinitions.sortOrder), asc(variableDefinitions.label))
  }

  /** Variables que aplican a un modelo, con el valor que tiene (null si aún no se registró). */
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

  /** Resuelve los códigos de alcance a ids; uno que no existe es un error de validación del campo. */
  private async scope(dto: { networkCode?: string | null; stageCode?: string | null; assetTypeCode?: string | null }) {
    const pick = async <T extends { id: string }>(code: string | null | undefined, field: string, label: string, lookup: (c: string) => Promise<T[]>) => {
      if (code === undefined) return undefined
      if (code === null) return null
      const [row] = await lookup(code)
      if (!row) throw validationError(field, `${label} ${code} no existe`)
      return row.id
    }
    return {
      networkMasterId: await pick(dto.networkCode, 'networkCode', 'La red', (c) => this.db.select({ id: networkMaster.id }).from(networkMaster).where(eq(networkMaster.code, c))),
      stageMasterId: await pick(dto.stageCode, 'stageCode', 'La etapa', (c) => this.db.select({ id: stageMaster.id }).from(stageMaster).where(eq(stageMaster.code, c))),
      assetTypeId: await pick(dto.assetTypeCode, 'assetTypeCode', 'El tipo', (c) => this.db.select({ id: assetTypes.id }).from(assetTypes).where(eq(assetTypes.code, c))),
    }
  }

  /** Código único a partir del nombre y el alcance: ABERTURA_DE_CRIBADO_PROC_D01, y _2, _3… si ya existe. */
  private async uniqueCode(dto: CreateVariableDto) {
    const parts = [slugCode(dto.label), dto.networkCode?.replace('FUR-', ''), dto.stageCode, dto.assetTypeCode]
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
    const scope = await this.scope(dto)
    let code = dto.code
    if (code) {
      const [taken] = await this.db.select({ id: variableDefinitions.id }).from(variableDefinitions).where(eq(variableDefinitions.code, code))
      if (taken) throw new ConflictException(`Ya existe una variable con el código ${code}`)
    } else {
      code = await this.uniqueCode(dto)
    }
    const [row] = await this.db
      .insert(variableDefinitions)
      .values({ code, label: dto.label, unit: dto.unit, valueType: dto.valueType, groupLabel: dto.group, isKey: dto.isKey, sortOrder: dto.sortOrder, ...scope })
      .returning({ id: variableDefinitions.id })
    await this.record(req, row.id, 'created', { new: { ...dto, code } })
    return this.one(row.id)
  }

  @Patch('variables/:id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateVariableSchema)) dto: UpdateVariableDto, @Req() req: AppRequest) {
    const before = await this.one(id)
    if (dto.valueType && dto.valueType !== before.valueType) {
      const [{ n }] = await this.db.select({ n: count() }).from(modelVariableValues).where(eq(modelVariableValues.variableId, id))
      if (n > 0) throw new ConflictException(`No se puede cambiar el tipo: ${n} modelo(s) ya tienen un valor registrado. Bórralos o crea otra variable.`)
    }
    const { networkCode, stageCode, assetTypeCode, group, ...rest } = dto
    const scope = await this.scope({ networkCode, stageCode, assetTypeCode })
    await this.db
      .update(variableDefinitions)
      .set({ ...rest, ...(group !== undefined && { groupLabel: group }), ...Object.fromEntries(Object.entries(scope).filter(([, v]) => v !== undefined)) })
      .where(eq(variableDefinitions.id, id))
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
   * tipo del modelo; `null` borra el valor. Los demás valores no se tocan.
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
