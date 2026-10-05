import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Rate limit de /auth (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    // Debe fijarse antes de cargar AppModule: la configuración se valida al importarlo.
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '3'
    const { createApp } = await import('./helpers')
    app = await createApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('bloquea con 429 tras superar el límite de intentos por minuto', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'x@e2e.fur.local', password: 'incorrecta-123' })

    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).status)
    expect(statuses).toEqual([401, 401, 401, 429, 429])
  })

  it('no limita el resto de la API', async () => {
    for (let i = 0; i < 6; i++) await request(app.getHttpServer()).get('/api/v1/health').expect(200)
  })
})
