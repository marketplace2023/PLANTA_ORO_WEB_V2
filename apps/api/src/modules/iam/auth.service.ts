import { createHash, randomBytes } from 'node:crypto'
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Env } from '../../config/env'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { uuidv7 } from '../../database/schema/common'
import { plants, refreshTokens, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import type { LoginDto, RegisterDto } from './auth.schemas'
import { AuthzService } from './authz.service'
import { PasswordService } from './password.service'
import { PERMISSIONS } from './permissions.catalog'

export type Session = {
  accessToken: string
  /** Segundos de vida del access token. */
  expiresIn: number
  /** Opaco; el controlador lo entrega como cookie httpOnly y nunca en el cuerpo. */
  refreshToken: string
  user: AuthUser
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const toPublicUser = (u: AuthUser): AuthUser => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  isGlobalAdmin: u.isGlobalAdmin,
})

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly passwords: PasswordService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto, req: AppRequest): Promise<Session> {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, dto.email)).limit(1)
    if (existing) throw new ConflictException('Ya existe una cuenta con ese correo')

    const passwordHash = await this.passwords.hash(dto.password)
    const [user] = await this.db
      .insert(users)
      .values({ email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName })
      .returning()
      .catch((err: { code?: string }) => {
        if (err.code === '23505') throw new ConflictException('Ya existe una cuenta con ese correo')
        throw err
      })

    await this.audit.record(req, { module: 'iam', entityType: 'user', entityId: user.id, action: 'register', userId: user.id })
    return this.issueSession(user, req, uuidv7())
  }

  async login(dto: LoginDto, req: AppRequest): Promise<Session> {
    const [user] = await this.db.select().from(users).where(eq(users.email, dto.email)).limit(1)

    const valid =
      user && user.status === 'ACTIVE'
        ? await this.passwords.verify(user.passwordHash, dto.password)
        : await this.passwords.verifyDummy(dto.password)

    if (!user || !valid) {
      await this.audit.record(req, {
        module: 'iam',
        entityType: 'user',
        entityId: user?.id,
        action: 'login_failed',
        userId: user?.id ?? null,
        newData: { email: dto.email },
      })
      throw new UnauthorizedException('Credenciales inválidas')
    }

    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    await this.audit.record(req, { module: 'iam', entityType: 'user', entityId: user.id, action: 'login', userId: user.id })
    return this.issueSession(user, req, uuidv7())
  }

  /** Rota el refresh token. Reusar uno ya rotado indica robo: se revoca toda la sesión (familia). */
  async refresh(rawToken: string, req: AppRequest): Promise<Session> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(rawToken)))
      .limit(1)
    if (!row) throw new UnauthorizedException('Sesión inválida')

    if (row.revokedAt) {
      await this.revokeFamily(row.familyId)
      await this.audit.record(req, {
        module: 'iam',
        entityType: 'refresh_token',
        entityId: row.id,
        action: 'refresh_reuse_detected',
        userId: row.userId,
      })
      throw new UnauthorizedException('Sesión inválida')
    }
    if (row.expiresAt <= new Date()) throw new UnauthorizedException('Sesión expirada')

    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, row.userId), eq(users.status, 'ACTIVE')))
      .limit(1)
    if (!user) throw new UnauthorizedException('Sesión inválida')

    // Revocación atómica: si otra petición rotó el mismo token primero, esta pierde la carrera.
    const revoked = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    if (revoked.length === 0) throw new UnauthorizedException('Sesión inválida')

    return this.issueSession(user, req, row.familyId)
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return
    const [row] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(rawToken)))
      .limit(1)
    if (row) await this.revokeFamily(row.familyId)
  }

  /** Usuario + plantas a las que tiene acceso con sus roles y permisos efectivos. */
  async me(user: AuthUser) {
    const access = await this.authz.accessByPlant(user.id)
    const plantRows = user.isGlobalAdmin
      ? await this.db.select().from(plants).orderBy(plants.name)
      : access.size > 0
        ? await this.db.select().from(plants).where(inArray(plants.id, [...access.keys()])).orderBy(plants.name)
        : []

    return {
      user: toPublicUser(user),
      plants: plantRows.map((p) => {
        const a = access.get(p.id)
        return {
          plantId: p.id,
          slug: p.slug,
          name: p.name,
          roles: user.isGlobalAdmin ? ['ECOSYSTEM_ADMIN'] : (a?.roles ?? []),
          permissions: user.isGlobalAdmin ? [...PERMISSIONS] : [...(a?.permissions ?? [])].sort(),
        }
      }),
    }
  }

  private async issueSession(
    user: AuthUser & { id: string },
    req: AppRequest,
    familyId: string,
  ): Promise<Session> {
    const refreshToken = randomBytes(48).toString('base64url')
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true })
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    })

    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true })
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email }, { expiresIn })
    return { accessToken, expiresIn, refreshToken, user: toPublicUser(user) }
  }

  private async revokeFamily(familyId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
  }
}
