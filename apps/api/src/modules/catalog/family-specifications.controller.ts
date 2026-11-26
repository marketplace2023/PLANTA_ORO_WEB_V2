import { Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { DB, type Database } from '../../database/database.module'
import { assetFamilies, familySpecifications } from '../../database/schema'
import { GlobalAdminOnly, Public } from '../iam/decorators'
import { AuditService } from '../audit/audit.service'
import type { AppRequest } from '../../common/types'
import { validationError } from '../../common/errors'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { isUniqueViolation } from '../../common/db-errors'
import { specificationKey } from './family-specifications'

const fields = z.strictObject({
  familyId: z.uuid(), label: z.string().trim().min(1).max(200), unit: z.string().trim().max(60).nullable().default(null),
  valueType: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'LIST', 'RANGE']), required: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
})
const editFields = z.strictObject({
  label: z.string().trim().min(1).max(200), unit: z.string().trim().max(60).nullable(),
  valueType: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'LIST', 'RANGE']), required: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
}).partial().refine(v => Object.keys(v).length > 0, 'Indica al menos un campo')
const query = z.object({ familyId: z.uuid().optional() })

@Public()
@Controller('catalog/specifications')
export class FamilySpecificationsController {
  constructor(@Inject(DB) private readonly db: Database) {}
  @Get()
  async list(@Query(new ZodValidationPipe(query)) q: z.infer<typeof query>) {
    const rows = await this.db.select().from(familySpecifications)
      .where(q.familyId ? eq(familySpecifications.familyId, q.familyId) : undefined)
      .orderBy(asc(familySpecifications.sortOrder), asc(familySpecifications.label))
    return rows.map(d => ({ ...d, key: specificationKey(d) }))
  }
}

@GlobalAdminOnly()
@Controller('catalog/specifications')
export class FamilySpecificationsAdminController {
  constructor(@Inject(DB) private readonly db: Database, private readonly audit: AuditService) {}
  private async one(id: string) {
    const [row] = await this.db.select().from(familySpecifications).where(eq(familySpecifications.id, id))
    if (!row) throw new NotFoundException('Especificación no encontrada')
    return row
  }
  private async unique(familyId: string, label: string, id?: string) {
    const [taken] = await this.db.select().from(familySpecifications).where(and(eq(familySpecifications.familyId, familyId), sql`lower(${familySpecifications.label}) = lower(${label})`, id ? ne(familySpecifications.id, id) : undefined))
    if (taken) throw new ConflictException('Ya existe una especificación con ese nombre en la familia')
  }
  private async inUse(d: Awaited<ReturnType<FamilySpecificationsAdminController['one']>>) {
    const key = specificationKey(d)
    const [used] = await this.db.select({ used: sql<boolean>`exists (select 1 from catalog.asset_models m join catalog.asset_types t on t.id=m.asset_type_id where t.family_id=${d.familyId} and m.specifications ? ${key}) or exists (select 1 from asset.assets a left join catalog.asset_models m on m.id=a.asset_model_id left join catalog.asset_types t on t.id=m.asset_type_id where coalesce(a.family_id,t.family_id)=${d.familyId} and a.specifications ? ${key})` }).from(assetFamilies).where(eq(assetFamilies.id, d.familyId))
    return !!used?.used
  }
  @Post()
  async create(@Body(new ZodValidationPipe(fields)) dto: z.infer<typeof fields>, @Req() req: AppRequest) {
    const [family] = await this.db.select().from(assetFamilies).where(eq(assetFamilies.id, dto.familyId))
    if (!family) throw validationError('familyId', 'La familia no existe')
    await this.unique(dto.familyId, dto.label)
    const [row] = await this.db.insert(familySpecifications).values({ ...dto, unit: dto.unit || null }).returning().catch(e => { if (isUniqueViolation(e)) throw new ConflictException('Ya existe esa especificación'); throw e })
    await this.audit.record(req, { module: 'catalog', entityType: 'family_specification', entityId: row.id, action: 'created', newData: row })
    return { ...row, key: specificationKey(row) }
  }
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editFields)) dto: z.infer<typeof editFields>, @Req() req: AppRequest) {
    const before = await this.one(id)
    const next = { ...before, ...dto, unit: dto.unit === undefined ? before.unit : dto.unit || null }
    await this.unique(before.familyId, next.label, id)
    if ((specificationKey(next) !== specificationKey(before) || next.valueType !== before.valueType) && await this.inUse(before)) throw new ConflictException('La especificación tiene valores registrados. Conserva su nombre, unidad y tipo; puedes cambiar su obligatoriedad y orden.')
    const [row] = await this.db.update(familySpecifications).set({ ...dto, unit: next.unit }).where(eq(familySpecifications.id, id)).returning().catch(e => { if (isUniqueViolation(e)) throw new ConflictException('Ya existe esa especificación en la familia'); throw e })
    await this.audit.record(req, { module: 'catalog', entityType: 'family_specification', entityId: id, action: 'updated', oldData: before, newData: row })
    return { ...row, key: specificationKey(row) }
  }
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const before = await this.one(id)
    if (await this.inUse(before)) throw new ConflictException('No se puede eliminar: tiene valores registrados en modelos o activos de planta')
    await this.db.delete(familySpecifications).where(eq(familySpecifications.id, id))
    await this.audit.record(req, { module: 'catalog', entityType: 'family_specification', entityId: id, action: 'deleted', oldData: before })
  }
}
