import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { ecosystems, plantSettings, plants } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { AuthzService } from '../iam/authz.service'
import type { CreatePlantDto, UpdatePlantDto } from './plants.schemas'

/** Campos públicos de una planta (lo que ve cualquiera que pueda verla). */
export const toPlantSummary = (p: PlantRow) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  slug: p.slug,
  description: p.description,
  countryCode: p.countryCode,
  timezone: p.timezone,
  status: p.status,
  visibility: p.visibility,
  logoUrl: p.logoUrl,
  heroImageUrl: p.heroImageUrl,
})

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

@Injectable()
export class PlantsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser | undefined) {
    return (await this.authz.visiblePlants(user)).map(toPlantSummary)
  }

  /** Detalle de una planta visible para el solicitante, con su rol y permisos en ella. */
  async get(ref: string, user: AuthUser | undefined) {
    const plant = await this.getVisible(ref, user)
    const access = await this.authz.access(user, plant.id)
    const [settings] = await this.db.select().from(plantSettings).where(eq(plantSettings.plantId, plant.id)).limit(1)
    return {
      ...toPlantSummary(plant),
      settings: settings ?? null,
      access: { roles: access.roles, permissions: [...access.permissions].sort() },
    }
  }

  /** Resuelve la planta y oculta su existencia (404) si el solicitante no puede verla. */
  async getVisible(ref: string, user: AuthUser | undefined): Promise<PlantRow> {
    const plant = await this.authz.findPlant(ref)
    if (!plant) throw new NotFoundException('Planta no encontrada')
    const access = await this.authz.access(user, plant.id)
    if (!this.authz.canView(user, plant, access)) throw new NotFoundException('Planta no encontrada')
    return plant
  }

  async create(dto: CreatePlantDto, req: AppRequest) {
    const ecosystemId = await this.defaultEcosystemId()
    const slug = dto.slug ?? slugify(dto.name)
    if (!slug) throw new ConflictException('No se pudo derivar un slug del nombre; indíquelo explícitamente')

    const plant = await this.db
      .transaction(async (tx) => {
        const [created] = await tx
          .insert(plants)
          .values({
            ecosystemId,
            code: dto.code,
            name: dto.name,
            slug,
            description: dto.description,
            countryCode: dto.countryCode,
            timezone: dto.timezone,
            visibility: dto.visibility,
          })
          .returning()
        await tx.insert(plantSettings).values({ plantId: created.id })
        return created
      })
      .catch((err: { code?: string; cause?: { code?: string } }) => {
        if ((err.code ?? err.cause?.code) === '23505') throw new ConflictException(`Ya existe una planta con el slug "${slug}"`)
        throw err
      })

    await this.audit.record(req, {
      module: 'plants',
      entityType: 'plant',
      entityId: plant.id,
      plantId: plant.id,
      action: 'created',
      newData: toPlantSummary(plant),
    })
    return toPlantSummary(plant)
  }

  async update(plant: PlantRow, dto: UpdatePlantDto, req: AppRequest) {
    const [updated] = await this.db.update(plants).set(dto).where(eq(plants.id, plant.id)).returning()
    await this.audit.record(req, {
      module: 'plants',
      entityType: 'plant',
      entityId: plant.id,
      plantId: plant.id,
      action: 'updated',
      oldData: toPlantSummary(plant),
      newData: toPlantSummary(updated),
    })
    return toPlantSummary(updated)
  }

  private async defaultEcosystemId(): Promise<string> {
    const [existing] = await this.db.select({ id: ecosystems.id }).from(ecosystems).orderBy(ecosystems.createdAt).limit(1)
    if (existing) return existing.id
    const [created] = await this.db
      .insert(ecosystems)
      .values({ code: 'FUR', name: 'Ecosistema FUR' })
      .onConflictDoNothing()
      .returning({ id: ecosystems.id })
    if (created) return created.id
    const [again] = await this.db.select({ id: ecosystems.id }).from(ecosystems).where(eq(ecosystems.code, 'FUR')).limit(1)
    return again.id
  }
}
