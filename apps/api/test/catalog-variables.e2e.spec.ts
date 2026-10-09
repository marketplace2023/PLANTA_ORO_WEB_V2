import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, modelVariableValues } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Def = { id: string; code: string; label: string; unit: string | null; valueType: string; networkCode: string | null; stageCode: string | null; assetTypeCode: string | null; group: string | null; isKey: boolean; value?: unknown }

describe('Variables de la ficha técnica (datos del fabricante) (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let procModel: string // tipo en la red de procesos y la etapa 01
  let procOtherStage: string // red de procesos, etapa 05
  let powerModel: string // solo red de potencia
  let adminUserId: string

  const send = (method: 'post' | 'patch' | 'put' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const forModel = async (id: string) => (await http().get(`/api/v1/catalog/models/${id}/variables`).expect(200)).body as Def[]
  const codes = (defs: Def[]) => defs.map((d) => d.code).sort()
  const setValues = (id: string, values: object, s: Session = admin) => send('put', `/api/v1/catalog/models/${id}/variables`, s, { values })

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const [adminU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa')])
    adminUserId = adminU.id
    ;[admin, pa] = await Promise.all(['admin', 'pa'].map((n) => login(app, n)))

    const mk = async (code: string, stageCodes: string[], networkCodes: string[]) => {
      await send('post', '/api/v1/catalog/types', admin, { familyCode: 'CRIBAS', code, name: code, stageCodes, networkCodes }).expect(201)
      const m = await send('post', '/api/v1/catalog/models', admin, { typeCode: code, modelName: `E2E Modelo ${code}` }).expect(201)
      return m.body.id as string
    }
    procModel = await mk('E2E_VAR_PROC', ['D01'], ['FUR-PROC'])
    procOtherStage = await mk('E2E_VAR_PROC5', ['D05'], ['FUR-PROC'])
    powerModel = await mk('E2E_VAR_POTENCIA', ['D01'], ['FUR-PTE'])
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('definiciones', () => {
    it('la lectura es pública y el seed deja las variables de la etapa 01 del proceso y las eléctricas', async () => {
      const proc = (await http().get('/api/v1/catalog/variables?network=FUR-PROC&stage=D01').expect(200)).body as Def[]
      expect(proc.map((d) => d.label)).toEqual(['Capacidad nominal', 'Abertura de cribado', 'Tamaño de roca (ROM)', 'Tipo de criba', 'Revestimiento', 'Instrumentación clave'])
      expect(proc[0]).toMatchObject({ valueType: 'RANGE', unit: 't/h', networkCode: 'FUR-PROC', stageCode: 'D01', group: 'Variables críticas del proceso', isKey: true })
      const power = (await http().get('/api/v1/catalog/variables?network=FUR-PTE').expect(200)).body as Def[]
      expect(power.map((d) => d.label)).toEqual(expect.arrayContaining(['Potencia instalada total', 'Tensión de suministro']))
    })

    it('solo el administrador del ecosistema crea, edita y borra', async () => {
      const body = { label: 'E2E Prueba', valueType: 'TEXT', networkCode: 'FUR-PROC' }
      await send('post', '/api/v1/catalog/variables', null, body).expect(401)
      await send('post', '/api/v1/catalog/variables', pa, body).expect(403)
      await send('patch', '/api/v1/catalog/variables/018f0000-0000-7000-8000-000000000000', pa, { label: 'x' }).expect(403)
      await send('delete', '/api/v1/catalog/variables/018f0000-0000-7000-8000-000000000000', pa).expect(403)
      await setValues(procModel, { CAPACIDAD_NOMINAL_PROC_D01: { min: 1, max: 2 } }, pa).expect(403)
    })

    it('genera el código a partir del nombre y el alcance, sin repetirlo', async () => {
      const a = await send('post', '/api/v1/catalog/variables', admin, { label: 'E2E Presión de trabajo', unit: 'bar', valueType: 'NUMBER', networkCode: 'fur-proc', stageCode: 'd05' }).expect(201)
      expect(a.body).toMatchObject({ code: 'E2E_PRESION_DE_TRABAJO_PROC_D05', label: 'E2E Presión de trabajo', unit: 'bar', valueType: 'NUMBER', networkCode: 'FUR-PROC', stageCode: 'D05', assetTypeCode: null, isKey: false })
      const b = await send('post', '/api/v1/catalog/variables', admin, { label: 'E2E Presión de trabajo', valueType: 'NUMBER', networkCode: 'FUR-PROC', stageCode: 'D05' }).expect(201)
      expect(b.body.code).toBe('E2E_PRESION_DE_TRABAJO_PROC_D05_2')
    })

    it('rechaza códigos repetidos, alcances que no existen y tipos inválidos', async () => {
      await send('post', '/api/v1/catalog/variables', admin, { code: 'E2E_UNICA', label: 'E2E Única', valueType: 'TEXT' }).expect(201)
      await send('post', '/api/v1/catalog/variables', admin, { code: 'E2E_UNICA', label: 'E2E Otra', valueType: 'TEXT' }).expect(409)
      await send('post', '/api/v1/catalog/variables', admin, { label: 'E2E Mal', valueType: 'TEXT', networkCode: 'FUR-NO' }).expect(400)
      await send('post', '/api/v1/catalog/variables', admin, { label: 'E2E Mal', valueType: 'TEXT', stageCode: 'D99' }).expect(400)
      await send('post', '/api/v1/catalog/variables', admin, { label: 'E2E Mal', valueType: 'TEXT', assetTypeCode: 'NO_EXISTE' }).expect(400)
      await send('post', '/api/v1/catalog/variables', admin, { label: 'E2E Mal', valueType: 'COLOR' }).expect(400)
      await send('post', '/api/v1/catalog/variables', admin, { label: 'x', valueType: 'TEXT' }).expect(400)
    })
  })

  describe('qué variables aplican a cada modelo', () => {
    it('según la red y la etapa del tipo: un tipo de procesos en la etapa 01 ve las variables de ese contexto', async () => {
      const defs = await forModel(procModel)
      expect(codes(defs)).toEqual(
        expect.arrayContaining(['ABERTURA_DE_CRIBADO_PROC_D01', 'CAPACIDAD_NOMINAL_PROC_D01', 'INSTRUMENTACION_CLAVE_PROC_D01', 'REVESTIMIENTO_PROC_D01', 'TAMANO_DE_ROCA_ROM_PROC_D01', 'TIPO_DE_CRIBA_PROC_D01']),
      )
      expect(codes(defs)).not.toContain('POTENCIA_INSTALADA_TOTAL_PTE')
      expect(codes(defs)).not.toContain('E2E_PRESION_DE_TRABAJO_PROC_D05') // es de la etapa 05
      expect(defs.every((d) => d.value === null)).toBe(true)
    })

    it('otra etapa de la misma red ve otras variables', async () => {
      const defs = await forModel(procOtherStage)
      expect(codes(defs)).toContain('E2E_PRESION_DE_TRABAJO_PROC_D05')
      expect(codes(defs)).not.toContain('CAPACIDAD_NOMINAL_PROC_D01')
    })

    it('un tipo de la red de potencia ve las variables eléctricas (sin etapa = todas) y no las de procesos', async () => {
      const defs = await forModel(powerModel)
      expect(codes(defs)).toEqual(expect.arrayContaining(['POTENCIA_INSTALADA_TOTAL_PTE', 'TENSION_DE_SUMINISTRO_PTE']))
      expect(codes(defs)).not.toContain('CAPACIDAD_NOMINAL_PROC_D01')
    })

    it('una variable sin alcance aplica a todos y una de un tipo concreto, solo a ese', async () => {
      await send('post', '/api/v1/catalog/variables', admin, { code: 'E2E_TODOS', label: 'E2E Para todos', valueType: 'BOOLEAN' }).expect(201)
      await send('post', '/api/v1/catalog/variables', admin, { code: 'E2E_SOLO_PROC5', label: 'E2E Solo ese tipo', valueType: 'TEXT', assetTypeCode: 'E2E_VAR_PROC5' }).expect(201)
      expect(codes(await forModel(procModel))).toContain('E2E_TODOS')
      expect(codes(await forModel(powerModel))).toContain('E2E_TODOS')
      expect(codes(await forModel(procOtherStage))).toContain('E2E_SOLO_PROC5')
      expect(codes(await forModel(procModel))).not.toContain('E2E_SOLO_PROC5')
    })

    it('una variable asociada a un tipo aplica a ese tipo aunque el tipo no esté en su red ni en su etapa', async () => {
      // E2E_VAR_POTENCIA está en la red FUR-PTE y la etapa D01; la variable dice FUR-PROC / D07 pero nombra ese tipo
      await send('post', '/api/v1/catalog/variables', admin, { code: 'E2E_EXPLICITA', label: 'E2E Explícita', valueType: 'NUMBER', networkCode: 'FUR-PROC', stageCode: 'D07', assetTypeCode: 'E2E_VAR_POTENCIA' }).expect(201)
      expect(codes(await forModel(powerModel))).toContain('E2E_EXPLICITA')
      expect(codes(await forModel(procModel))).not.toContain('E2E_EXPLICITA') // otro tipo: no
      await setValues(powerModel, { E2E_EXPLICITA: 5 }).expect(200)
      const value = (await forModel(powerModel)).find((d) => d.code === 'E2E_EXPLICITA')?.value
      expect(value).toBe(5)
    })

    it('también aplica si algún activo del modelo está en esa red o etapa, aunque el tipo no esté clasificado ahí', async () => {
      // procOtherStage es de un tipo en la red de procesos y la etapa 05: la variable de potencia no le aplica por el tipo
      expect(codes(await forModel(procOtherStage))).not.toContain('POTENCIA_INSTALADA_TOTAL_PTE')
      const plant = await t.plant('varasset', 'PUBLIC')
      await t.enableStage(plant.id, 'D05')
      await t.enableNetwork(plant.id, 'FUR-PTE')
      const model = (await http().get('/api/v1/catalog/assets?search=E2E%20Modelo%20E2E_VAR_PROC5').expect(200)).body.items[0].id as string
      expect(model).toBe(procOtherStage)
      const created = await send('post', '/api/v1/plants/e2e-varasset/assets', admin, { tag: 'VAR-1', name: 'Activo de la prueba', assetModelId: procOtherStage, stageCode: 'D05', networkCodes: ['FUR-PTE'] }).expect(201)
      // ahora un activo de ese modelo pertenece a la red de potencia
      expect(codes(await forModel(procOtherStage))).toContain('POTENCIA_INSTALADA_TOTAL_PTE')
      // si el activo se da de baja deja de contar
      await send('delete', `/api/v1/plants/e2e-varasset/assets/${created.body.id}`, admin).expect((r) => expect([200, 204]).toContain(r.status))
      expect(codes(await forModel(procOtherStage))).not.toContain('POTENCIA_INSTALADA_TOTAL_PTE')
    })

    it('un modelo que no existe responde 404', async () => {
      await http().get('/api/v1/catalog/models/018f0000-0000-7000-8000-000000000000/variables').expect(404)
    })
  })

  describe('registrar los datos del fabricante', () => {
    it('guarda cada tipo de valor y lo devuelve para quien consulte el catálogo', async () => {
      const res = await setValues(procModel, {
        CAPACIDAD_NOMINAL_PROC_D01: { min: 600, max: 800 },
        ABERTURA_DE_CRIBADO_PROC_D01: 120,
        TAMANO_DE_ROCA_ROM_PROC_D01: { max: 700 },
        TIPO_DE_CRIBA_PROC_D01: '  Parrilla / criba de barras ',
        INSTRUMENTACION_CLAVE_PROC_D01: ['vibración', 'detección de atascos'],
        E2E_TODOS: true,
      }).expect(200)
      const byCode = Object.fromEntries((res.body as Def[]).map((d) => [d.code, d.value]))
      expect(byCode).toMatchObject({
        CAPACIDAD_NOMINAL_PROC_D01: { min: 600, max: 800 },
        ABERTURA_DE_CRIBADO_PROC_D01: 120,
        TAMANO_DE_ROCA_ROM_PROC_D01: { max: 700 },
        TIPO_DE_CRIBA_PROC_D01: 'Parrilla / criba de barras',
        INSTRUMENTACION_CLAVE_PROC_D01: ['vibración', 'detección de atascos'],
        E2E_TODOS: true,
        REVESTIMIENTO_PROC_D01: null, // aún sin registrar
      })
      expect(codes(await forModel(procModel))).toEqual(codes(res.body))
      expect(Object.fromEntries((await forModel(procModel)).map((d) => [d.code, d.value])).ABERTURA_DE_CRIBADO_PROC_D01).toBe(120)
    })

    it('actualizar algunos valores no toca los demás; null borra', async () => {
      await setValues(procModel, { ABERTURA_DE_CRIBADO_PROC_D01: 150, TIPO_DE_CRIBA_PROC_D01: null }).expect(200)
      const byCode = Object.fromEntries((await forModel(procModel)).map((d) => [d.code, d.value]))
      expect(byCode.ABERTURA_DE_CRIBADO_PROC_D01).toBe(150)
      expect(byCode.TIPO_DE_CRIBA_PROC_D01).toBeNull()
      expect(byCode.CAPACIDAD_NOMINAL_PROC_D01).toEqual({ min: 600, max: 800 })
    })

    it('el valor es por modelo: otro modelo del mismo contexto no lo hereda', async () => {
      const other = await send('post', '/api/v1/catalog/models', admin, { typeCode: 'E2E_VAR_PROC', modelName: 'E2E Modelo hermano' }).expect(201)
      const byCode = Object.fromEntries((await forModel(other.body.id)).map((d) => [d.code, d.value]))
      expect(byCode.CAPACIDAD_NOMINAL_PROC_D01).toBeNull()
    })

    it('rechaza valores que no corresponden al tipo y no guarda nada de la petición', async () => {
      const bad: Array<[string, unknown]> = [
        ['ABERTURA_DE_CRIBADO_PROC_D01', 'abc'],
        ['CAPACIDAD_NOMINAL_PROC_D01', { min: 900, max: 800 }],
        ['CAPACIDAD_NOMINAL_PROC_D01', {}],
        ['CAPACIDAD_NOMINAL_PROC_D01', 700],
        ['INSTRUMENTACION_CLAVE_PROC_D01', []],
        ['INSTRUMENTACION_CLAVE_PROC_D01', 'vibración'],
        ['E2E_TODOS', 'sí'],
        ['REVESTIMIENTO_PROC_D01', ''],
      ]
      for (const [code, value] of bad) {
        const res = await setValues(procModel, { REVESTIMIENTO_PROC_D01: 'Acero antidesgaste', [code]: value }).expect(400)
        expect(JSON.stringify(res.body)).toContain(code)
      }
      const byCode = Object.fromEntries((await forModel(procModel)).map((d) => [d.code, d.value]))
      expect(byCode.REVESTIMIENTO_PROC_D01).toBeNull() // la petición entera se rechazó
    })

    it('no admite variables que no existen o que no aplican al modelo', async () => {
      await setValues(procModel, { NO_EXISTE: 1 }).expect(400)
      await setValues(procModel, { POTENCIA_INSTALADA_TOTAL_PTE: { min: 1, max: 2 } }).expect(400) // es de la red de potencia
      await setValues(powerModel, { CAPACIDAD_NOMINAL_PROC_D01: { min: 1, max: 2 } }).expect(400)
    })
  })

  describe('editar y eliminar definiciones', () => {
    let defId: string

    it('cambia nombre, unidad, grupo, orden y alcance', async () => {
      defId = (await send('post', '/api/v1/catalog/variables', admin, { code: 'E2E_EDITABLE', label: 'E2E Editable', valueType: 'NUMBER', networkCode: 'FUR-PROC' }).expect(201)).body.id
      const res = await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { label: 'E2E Editable 2', unit: 'kg', group: 'Otro grupo', isKey: true, sortOrder: 5, stageCode: 'D01' }).expect(200)
      expect(res.body).toMatchObject({ code: 'E2E_EDITABLE', label: 'E2E Editable 2', unit: 'kg', group: 'Otro grupo', isKey: true, sortOrder: 5, stageCode: 'D01', networkCode: 'FUR-PROC' })
      const quitar = await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { stageCode: null, unit: null, group: null }).expect(200)
      expect(quitar.body).toMatchObject({ stageCode: null, unit: null, group: null })
      await send('patch', `/api/v1/catalog/variables/${defId}`, admin, {}).expect(400)
      await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { stageCode: 'D99' }).expect(400)
      await send('patch', '/api/v1/catalog/variables/018f0000-0000-7000-8000-000000000000', admin, { label: 'Nombre válido' }).expect(404)
    })

    it('el tipo de dato solo se puede cambiar mientras ningún modelo tenga valor', async () => {
      await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { valueType: 'TEXT' }).expect(200)
      await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { valueType: 'NUMBER' }).expect(200)
      await setValues(procModel, { E2E_EDITABLE: 42 }).expect(200)
      const res = await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { valueType: 'TEXT' }).expect(409)
      expect(res.body.message).toContain('1 modelo')
    })

    it('eliminar la variable borra los valores registrados y la quita de los modelos', async () => {
      await send('delete', `/api/v1/catalog/variables/${defId}`, admin).expect(204)
      expect(codes(await forModel(procModel))).not.toContain('E2E_EDITABLE')
      expect(await t.db.select().from(modelVariableValues).where(eq(modelVariableValues.variableId, defId))).toEqual([])
      await send('delete', `/api/v1/catalog/variables/${defId}`, admin).expect(404)
    })
  })

  it('audita las altas, ediciones, bajas y los registros de valores', async () => {
    const events = (await t.db.select().from(auditEvents).where(eq(auditEvents.userId, adminUserId))).map((e) => e.action)
    expect(events).toEqual(expect.arrayContaining(['created', 'updated', 'deleted', 'variables.updated']))
  })
})
