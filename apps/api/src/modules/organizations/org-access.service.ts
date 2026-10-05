import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { contractorMembers, contractors, providerMembers, providers, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import type { AddMemberDto } from './organizations.schemas'

export type OrgKind = 'provider' | 'contractor'

/**
 * Membresía de organizaciones externas (proveedores y contratistas). A diferencia de las plantas, aquí no hay
 * permisos por módulo: el administrador del ecosistema gestiona todo y los miembros gestionan lo propio.
 */
@Injectable()
export class OrgAccessService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private table(kind: OrgKind) {
    return kind === 'provider'
      ? { table: providerMembers, orgId: providerMembers.providerId, userId: providerMembers.userId, role: providerMembers.role, createdAt: providerMembers.createdAt }
      : { table: contractorMembers, orgId: contractorMembers.contractorId, userId: contractorMembers.userId, role: contractorMembers.role, createdAt: contractorMembers.createdAt }
  }

  /** 'OWNER' | 'MEMBER' | null (no es miembro). */
  async roleOf(kind: OrgKind, orgId: string, userId: string | undefined): Promise<string | null> {
    if (!userId) return null
    const t = this.table(kind)
    const [row] = await this.db.select({ role: t.role }).from(t.table).where(and(eq(t.orgId, orgId), eq(t.userId, userId)))
    return row?.role ?? null
  }

  /** Administrador del ecosistema o miembro. Devuelve el rol efectivo. */
  async assertManage(kind: OrgKind, orgId: string, user: AuthUser | undefined): Promise<'ADMIN' | 'OWNER' | 'MEMBER'> {
    if (user?.isGlobalAdmin) return 'ADMIN'
    const role = await this.roleOf(kind, orgId, user?.id)
    if (!role) throw new ForbiddenException('No gestionas esta organización')
    return role as 'OWNER' | 'MEMBER'
  }

  async assertOwner(kind: OrgKind, orgId: string, user: AuthUser | undefined) {
    const role = await this.assertManage(kind, orgId, user)
    if (role === 'MEMBER') throw new ForbiddenException('Solo el responsable de la organización puede gestionar sus miembros')
  }

  /** Organizaciones que gestiona el usuario (para "Mi organización"). */
  async myOrgIds(kind: OrgKind, userId: string) {
    const t = this.table(kind)
    const rows = await this.db.select({ orgId: t.orgId, role: t.role }).from(t.table).where(eq(t.userId, userId))
    return new Map(rows.map((r) => [r.orgId, r.role]))
  }

  async list(kind: OrgKind, orgId: string, user: AuthUser | undefined) {
    await this.assertManage(kind, orgId, user)
    const t = this.table(kind)
    return this.db
      .select({ userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: t.role, createdAt: t.createdAt })
      .from(t.table)
      .innerJoin(users, eq(users.id, t.userId))
      .where(eq(t.orgId, orgId))
      .orderBy(asc(t.role), asc(users.email))
  }

  async add(kind: OrgKind, orgId: string, dto: AddMemberDto, user: AuthUser | undefined, req: AppRequest) {
    await this.assertOwner(kind, orgId, user)
    const [target] = await this.db.select({ id: users.id }).from(users).where(and(eq(sql`lower(${users.email})`, dto.email.toLowerCase()), eq(users.status, 'ACTIVE')))
    if (!target) throw new NotFoundException('No existe un usuario activo con ese correo')
    const t = this.table(kind)
    const existing = await this.roleOf(kind, orgId, target.id)
    if (existing) throw new ConflictException('La persona ya es miembro de la organización')
    await this.db.insert(t.table).values({ [kind === 'provider' ? 'providerId' : 'contractorId']: orgId, userId: target.id, role: dto.role } as never)
    await this.audit.record(req, { module: kind === 'provider' ? 'provider' : 'professional', entityType: `${kind}_member`, entityId: orgId, action: 'member.added', newData: { userId: target.id, role: dto.role } })
    return this.list(kind, orgId, user)
  }

  async remove(kind: OrgKind, orgId: string, userId: string, user: AuthUser | undefined, req: AppRequest) {
    await this.assertOwner(kind, orgId, user)
    const t = this.table(kind)
    const removed = await this.db.transaction(async (tx) => {
      // Serializa los cambios de membresía de la organización: sin esto, dos responsables que se quitan a la vez
      // verían "queda otro responsable" y la organización terminaría sin ninguno.
      if (kind === 'provider') await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, orgId)).for('update')
      else await tx.select({ id: contractors.id }).from(contractors).where(eq(contractors.id, orgId)).for('update')
      if (!user?.isGlobalAdmin) {
        const [actor] = await tx.select({ role: t.role }).from(t.table).where(and(eq(t.orgId, orgId), eq(t.userId, user?.id ?? '')))
        if (actor?.role !== 'OWNER') throw new ForbiddenException('Solo el responsable de la organización puede gestionar sus miembros')
      }
      const [row] = await tx.select({ role: t.role }).from(t.table).where(and(eq(t.orgId, orgId), eq(t.userId, userId))).for('update')
      if (!row) throw new NotFoundException('La persona no es miembro de la organización')
      if (row.role === 'OWNER') {
        const owners = await tx.select({ userId: t.userId }).from(t.table).where(and(eq(t.orgId, orgId), eq(t.role, 'OWNER')))
        // Una organización gestionada por miembros no puede quedarse sin responsable; el administrador puede reasignarlo.
        if (owners.length <= 1 && !user?.isGlobalAdmin) throw new ConflictException('No se puede quitar al único responsable de la organización')
      }
      await tx.delete(t.table).where(and(eq(t.orgId, orgId), eq(t.userId, userId)))
      return row
    })
    await this.audit.record(req, { module: kind === 'provider' ? 'provider' : 'professional', entityType: `${kind}_member`, entityId: orgId, action: 'member.removed', oldData: { userId, role: removed.role } })
  }

  /** Para validar `ownerEmail` al crear: devuelve el id del usuario activo. */
  async resolveOwner(email: string) {
    const [u] = await this.db.select({ id: users.id }).from(users).where(and(eq(sql`lower(${users.email})`, email.toLowerCase()), eq(users.status, 'ACTIVE')))
    if (!u) throw validationError('ownerEmail', 'No existe un usuario activo con ese correo')
    return u.id
  }
}
