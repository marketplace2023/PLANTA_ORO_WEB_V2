import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('API pública (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/v1/health → ok con base de datos conectada', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200)
    expect(res.body).toMatchObject({ status: 'ok', service: 'fur-api', database: 'up' })
  })

  it('GET /api/v1/stages/catalog → 19 etapas D01…D19 en orden', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/stages/catalog').expect(200)
    const codes = res.body.map((s: { code: string }) => s.code)
    expect(codes).toHaveLength(19)
    expect(codes[0]).toBe('D01')
    expect(codes[18]).toBe('D19')
    expect(codes).toEqual([...codes].sort())
    expect(res.body[5]).toMatchObject({ code: 'D06', name: 'Molienda secundaria', stageGroup: 'MOLIENDA' })
  })

  it('GET /api/v1/networks/catalog → las 10 redes FUR-*', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/networks/catalog').expect(200)
    const codes = res.body.map((n: { code: string }) => n.code).sort()
    expect(codes).toEqual(
      ['FUR-CAM', 'FUR-CC', 'FUR-GPON', 'FUR-IOT', 'FUR-LAB', 'FUR-MNT', 'FUR-OF', 'FUR-PROC', 'FUR-PTE', 'FUR-RQ'].sort(),
    )
  })

  it('rutas inexistentes → 404 (todo cuelga de /api/v1)', async () => {
    await request(app.getHttpServer()).get('/api/v1/nope').expect(404)
    await request(app.getHttpServer()).get('/health').expect(404)
  })

  it('CORS permite solo los orígenes configurados', async () => {
    const ok = await request(app.getHttpServer()).get('/api/v1/health').set('Origin', 'http://localhost:5173')
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')

    const denied = await request(app.getHttpServer()).get('/api/v1/health').set('Origin', 'https://evil.example')
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('envía cabeceras de seguridad (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })
})
