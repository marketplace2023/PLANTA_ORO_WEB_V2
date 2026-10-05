import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { eq, and } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, refreshTokens, users } from '../src/database/schema'
import { bearer, createApp, EMAIL_DOMAIN, login, PASSWORD, refreshCookie, TestDb } from './helpers'

describe('Autenticación (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    await t.user('ana')
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('registro', () => {
    it('crea la cuenta, inicia sesión y no expone secretos', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: `  Nueva${EMAIL_DOMAIN.toUpperCase()} `, password: PASSWORD, firstName: 'Nueva', lastName: 'Usuaria' })
        .expect(201)

      expect(res.body.user).toMatchObject({ email: `nueva${EMAIL_DOMAIN}`, isGlobalAdmin: false })
      expect(res.body.accessToken).toEqual(expect.any(String))
      expect(res.body.expiresIn).toBe(900)
      // Ni el refresh token ni el hash viajan en el cuerpo.
      expect(JSON.stringify(res.body)).not.toMatch(/refresh|password|hash/i)

      const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0]
      expect(cookie).toMatch(/^fur_rt=/)
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=Lax/i)
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/)
    })

    it('guarda la contraseña con Argon2id', async () => {
      const [row] = await t.db.select().from(users).where(eq(users.email, `nueva${EMAIL_DOMAIN}`))
      expect(row.passwordHash).toMatch(/^\$argon2id\$/)
      expect(row.passwordHash).not.toContain(PASSWORD)
    })

    it('rechaza un correo ya registrado (409), sin distinguir mayúsculas', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ email: `ANA${EMAIL_DOMAIN}`, password: PASSWORD, firstName: 'X', lastName: 'Y' })
        .expect(409)
    })

    it('valida los datos con mensajes por campo', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'no-es-correo', password: 'corta', firstName: '', lastName: 'Y' })
        .expect(400)
      const paths = res.body.errors.map((e: { path: string }) => e.path).sort()
      expect(paths).toEqual(['email', 'firstName', 'password'])
    })
  })

  describe('login', () => {
    it('devuelve access token y cookie de refresh', async () => {
      const s = await login(app, 'ana')
      expect(s.accessToken.split('.')).toHaveLength(3)
      expect(s.body.user.email).toBe(`ana${EMAIL_DOMAIN}`)
    })

    it('contraseña incorrecta y usuario inexistente dan el mismo 401', async () => {
      const wrong = await http().post('/api/v1/auth/login').send({ email: `ana${EMAIL_DOMAIN}`, password: 'incorrecta-123' })
      const unknown = await http().post('/api/v1/auth/login').send({ email: `nadie${EMAIL_DOMAIN}`, password: PASSWORD })
      expect(wrong.status).toBe(401)
      expect(unknown.status).toBe(401)
      expect(wrong.body.message).toBe(unknown.body.message)
      expect(wrong.headers['set-cookie']).toBeUndefined()
    })

    it('un usuario desactivado no puede entrar aunque la contraseña sea correcta', async () => {
      await t.user('baja', { status: 'INACTIVE' })
      await http().post('/api/v1/auth/login').send({ email: `baja${EMAIL_DOMAIN}`, password: PASSWORD }).expect(401)
    })

    it('registra intentos exitosos y fallidos en auditoría con correlation id', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .set('x-correlation-id', '11111111-1111-4111-8111-111111111111')
        .send({ email: `ana${EMAIL_DOMAIN}`, password: 'incorrecta-123' })
        .expect(401)
      expect(res.headers['x-correlation-id']).toBe('11111111-1111-4111-8111-111111111111')

      const [failed] = await t.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.correlationId, '11111111-1111-4111-8111-111111111111'))
      expect(failed).toMatchObject({ module: 'iam', action: 'login_failed' })

      const ana = (await t.db.select().from(users).where(eq(users.email, `ana${EMAIL_DOMAIN}`)))[0]
      const ok = await t.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.userId, ana.id), eq(auditEvents.action, 'login')))
      expect(ok.length).toBeGreaterThan(0)
    })
  })

  describe('access token', () => {
    it('GET /auth/me exige sesión', async () => {
      await http().get('/api/v1/auth/me').expect(401)
    })

    it('GET /auth/me devuelve el usuario y sus plantas', async () => {
      const s = await login(app, 'ana')
      const res = await http().get('/api/v1/auth/me').set('Authorization', bearer(s)).expect(200)
      expect(res.body.user.email).toBe(`ana${EMAIL_DOMAIN}`)
      expect(res.body.plants).toEqual([])
    })

    it('rechaza tokens manipulados, expirados o de otro emisor', async () => {
      const s = await login(app, 'ana')
      const [h, p, sig] = s.accessToken.split('.')
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${h}.${p}.${sig.slice(0, -2)}xx`).expect(401)

      const jwt = app.get(JwtService)
      const expired = await jwt.signAsync({ sub: s.body.user.id }, { expiresIn: '-10s' })
      await http().get('/api/v1/auth/me').set('Authorization', bearer(expired)).expect(401)

      const foreign = await new JwtService({ secret: 'otro-secreto-distinto-0123456789abcdef0123456789' }).signAsync({
        sub: s.body.user.id,
      })
      await http().get('/api/v1/auth/me').set('Authorization', bearer(foreign)).expect(401)

      await http().get('/api/v1/auth/me').set('Authorization', 'Basic abc').expect(401)
    })

    it('un token inválido da 401 incluso en rutas públicas (el cliente debe refrescar)', async () => {
      await http().get('/api/v1/plants').set('Authorization', 'Bearer basura.basura.basura').expect(401)
    })

    it('desactivar al usuario invalida su token de inmediato', async () => {
      const u = await t.user('temporal')
      const s = await login(app, 'temporal')
      await http().get('/api/v1/auth/me').set('Authorization', bearer(s)).expect(200)
      await t.db.update(users).set({ status: 'INACTIVE' }).where(eq(users.id, u.id))
      await http().get('/api/v1/auth/me').set('Authorization', bearer(s)).expect(401)
    })
  })

  describe('refresh token', () => {
    it('rota: entrega un token nuevo y el anterior deja de servir', async () => {
      const s = await login(app, 'ana')
      const res = await http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(200)
      expect(res.body.accessToken).toEqual(expect.any(String))
      expect(refreshCookie(res)).not.toBe(s.cookie)
      await http().get('/api/v1/auth/me').set('Authorization', bearer(res.body.accessToken)).expect(200)
    })

    it('reutilizar un token ya rotado revoca toda la sesión (detección de robo)', async () => {
      const s = await login(app, 'ana')
      const rotated = await http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(200)
      const newest = refreshCookie(rotated)

      // El atacante reusa el token viejo…
      await http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401)
      // …y por seguridad también cae el token legítimo más reciente.
      await http().post('/api/v1/auth/refresh').set('Cookie', newest).expect(401)

      const reuse = await t.db.select().from(auditEvents).where(eq(auditEvents.action, 'refresh_reuse_detected'))
      expect(reuse.length).toBeGreaterThan(0)
    })

    it('sin cookie, con cookie inventada o expirada → 401', async () => {
      await http().post('/api/v1/auth/refresh').expect(401)
      await http().post('/api/v1/auth/refresh').set('Cookie', 'fur_rt=inventado').expect(401)

      const s = await login(app, 'ana')
      await t.db.update(refreshTokens).set({ expiresAt: new Date(Date.now() - 1000) })
      await http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401)
    })

    it('un usuario desactivado no puede refrescar', async () => {
      const u = await t.user('cesado')
      const s = await login(app, 'cesado')
      await t.db.update(users).set({ status: 'INACTIVE' }).where(eq(users.id, u.id))
      await http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401)
    })

    it('el refresh token se guarda hasheado, nunca en claro', async () => {
      const s = await login(app, 'ana')
      const raw = s.cookie.replace('fur_rt=', '')
      const rows = await t.db.select().from(refreshTokens)
      expect(rows.some((r) => r.tokenHash === raw)).toBe(false)
      expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.tokenHash))).toBe(true)
    })
  })

  describe('logout', () => {
    it('revoca la sesión y borra la cookie', async () => {
      const s = await login(app, 'ana')
      const res = await http().post('/api/v1/auth/logout').set('Cookie', s.cookie).expect(204)
      expect(([] as string[]).concat(res.headers['set-cookie'])[0]).toMatch(/fur_rt=;/)
      await http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401)
    })

    it('es idempotente y no falla sin sesión', async () => {
      await http().post('/api/v1/auth/logout').expect(204)
    })
  })
})
