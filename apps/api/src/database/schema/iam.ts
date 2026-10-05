import { boolean, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'

// Arquitectura §8: identidad, roles, permisos y relación usuario-planta.
export const iamSchema = pgSchema('iam')

export const users = iamSchema.table('users', {
  id: pk(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  username: varchar('username', { length: 100 }).unique(),
  /** Argon2id (arquitectura §40). */
  passwordHash: text('password_hash').notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  isGlobalAdmin: boolean('is_global_admin').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const roles = iamSchema.table('roles', {
  id: pk(),
  code: varchar('code', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  /** GLOBAL | PLANT | EXTERNAL */
  scope: varchar('scope', { length: 20 }).notNull(),
  description: text('description'),
  createdAt: createdAt(),
})

export const permissions = iamSchema.table('permissions', {
  id: pk(),
  resource: varchar('resource', { length: 60 }).notNull(),
  action: varchar('action', { length: 60 }).notNull(),
  /** p. ej. `asset.update` */
  code: varchar('code', { length: 120 }).notNull().unique(),
  description: text('description'),
})

export const rolePermissions = iamSchema.table(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
)

/** Tabla crítica del modelo multi-planta: un usuario puede tener más de un rol por planta. */
export const userPlantRoles = iamSchema.table(
  'user_plant_roles',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.plantId, t.roleId)],
)

/** Permisos excepcionales por usuario y planta. */
export const userPlantOverrides = iamSchema.table('user_plant_overrides', {
  id: pk(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id')
    .notNull()
    .references(() => permissions.id, { onDelete: 'cascade' }),
  /** ALLOW | DENY */
  effect: varchar('effect', { length: 10 }).notNull(),
})

/**
 * Refresh tokens rotativos (arquitectura §40). Solo se guarda el hash SHA-256 del token opaco.
 * Todos los tokens de una misma sesión comparten `familyId`: si se reusa uno ya rotado se revoca la familia.
 */
export const refreshTokens = iamSchema.table('refresh_tokens', {
  id: pk(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  familyId: uuid('family_id').notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  ip: varchar('ip', { length: 64 }),
  createdAt: createdAt(),
})
