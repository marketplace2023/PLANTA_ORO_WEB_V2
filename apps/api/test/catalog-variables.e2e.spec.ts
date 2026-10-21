import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, modelVariableValues } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Def = {
  id: string
  code: string
  label: string
  unit: string | null
  valueType: string
  networkCodes: string[]
  stageCodes: string[]
  assetTypeCodes: string[]
  defaultValue: unknown
  group: string | null
  isKey: boolean
  value?: unknown
}

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
  const create = (body: object) => send('post', '/api/v1/catalog/variables', admin, body)

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const [adminU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa')])
    adminUserId = adminU.id
    ;[admin, pa] = await Promise.all(['admin', 'pa'].map((n) => login(app, n)))

    const mk = async (code: string, stageCodes: string[], networkCodes: string[]) => {
      await send('post', '/api/v1/catalog/types', admin, { familyCode: 'CRIBAS', code, name: code, stageCodes }).expect(201)
      const m = await send('post', '/api/v1/catalog/models', admin, { typeCode: code, modelName: `E2E Modelo ${code}`, networkCodes }).expect(201)
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
      expect(proc[0]).toMatchObject({ valueType: 'RANGE', unit: 't/h', networkCodes: ['FUR-PROC'], stageCodes: ['D01'], group: 'Variables críticas del proceso', isKey: true, defaultValue: null })
      const power = (await http().get('/api/v1/catalog/variables?network=FUR-PTE').expect(200)).body as Def[]
      expect(power.map((d) => d.label)).toEqual(expect.arrayContaining(['Potencia instalada total', 'Tensión de suministro']))
    })

    it('solo el administrador del ecosistema crea, edita y borra', async () => {
      const body = { label: 'E2E Prueba', valueType: 'TEXT', networkCodes: ['FUR-PROC'] }
      await send('post', '/api/v1/catalog/variables', null, body).expect(401)
      await send('post', '/api/v1/catalog/variables', pa, body).expect(403)
      await send('patch', '/api/v1/catalog/variables/018f0000-0000-7000-8000-000000000000', pa, { label: 'x' }).expect(403)
      await send('delete', '/api/v1/catalog/variables/018f0000-0000-7000-8000-000000000000', pa).expect(403)
      await setValues(procModel, { CAPACIDAD_NOMINAL_PROC_D01: { min: 1, max: 2 } }, pa).expect(403)
    })

    it('genera el código a partir del nombre y el alcance, sin repetirlo', async () => {
      const a = await create({ label: 'E2E Presión de trabajo', unit: 'bar', valueType: 'NUMBER', networkCodes: ['fur-proc'], stageCodes: ['d05'] }).expect(201)
      expect(a.body).toMatchObject({ code: 'E2E_PRESION_DE_TRABAJO_PROC_D05', label: 'E2E Presión de trabajo', unit: 'bar', valueType: 'NUMBER', networkCodes: ['FUR-PROC'], stageCodes: ['D05'], assetTypeCodes: [], isKey: false })
      const b = await create({ label: 'E2E Presión de trabajo', valueType: 'NUMBER', networkCodes: ['FUR-PROC'], stageCodes: ['D05'] }).expect(201)
      expect(b.body.code).toBe('E2E_PRESION_DE_TRABAJO_PROC_D05_2')
    })

    it('una variable puede compartirse entre varias redes, etapas y tipos a la vez', async () => {
      const res = await create({
        code: 'E2E_COMPARTIDA',
        label: 'E2E Compartida',
        valueType: 'NUMBER',
        networkCodes: ['FUR-PTE', 'FUR-PROC', 'FUR-PTE'], // el repetido se ignora y salen en el orden oficial de redes
        stageCodes: ['D05', 'D01'],
        assetTypeCodes: ['E2E_VAR_PROC', 'E2E_VAR_POTENCIA'],
      }).expect(201)
      expect(res.body).toMatchObject({ networkCodes: ['FUR-PROC', 'FUR-PTE'], stageCodes: ['D01', 'D05'], assetTypeCodes: ['E2E_VAR_POTENCIA', 'E2E_VAR_PROC'].sort() })
      // y se encuentra filtrando por cualquiera de sus códigos
      for (const q of ['network=FUR-PTE', 'network=FUR-PROC', 'stage=D05', 'stage=D01', 'type=E2E_VAR_PROC']) {
        const list = (await http().get(`/api/v1/catalog/variables?${q}`).expect(200)).body as Def[]
        expect(codes(list)).toContain('E2E_COMPARTIDA')
      }
      const none = (await http().get('/api/v1/catalog/variables?stage=D19').expect(200)).body as Def[]
      expect(codes(none)).not.toContain('E2E_COMPARTIDA')
    })

    it('rechaza códigos repetidos, alcances que no existen y tipos inválidos', async () => {
      await create({ code: 'E2E_UNICA', label: 'E2E Única', valueType: 'TEXT' }).expect(201)
      await create({ code: 'E2E_UNICA', label: 'E2E Otra', valueType: 'TEXT' }).expect(409)
      await create({ label: 'E2E Mal', valueType: 'TEXT', networkCodes: ['FUR-NO'] }).expect(400)
      await create({ label: 'E2E Mal', valueType: 'TEXT', networkCodes: ['FUR-PROC', 'FUR-NO'] }).expect(400)
      await create({ label: 'E2E Mal', valueType: 'TEXT', stageCodes: ['D99'] }).expect(400)
      await create({ label: 'E2E Mal', valueType: 'TEXT', assetTypeCodes: ['NO_EXISTE'] }).expect(400)
      await create({ label: 'E2E Mal', valueType: 'COLOR' }).expect(400)
      await create({ label: 'x', valueType: 'TEXT' }).expect(400)
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

    it('una variable general (sin redes, etapas ni tipos) aplica a todos los modelos', async () => {
      await create({ code: 'E2E_TODOS', label: 'E2E Para todos', valueType: 'BOOLEAN' }).expect(201)
      for (const model of [procModel, procOtherStage, powerModel]) expect(codes(await forModel(model))).toContain('E2E_TODOS')
    })

    it('una variable compartida aplica a todos los tipos que lista y a ningún otro', async () => {
      // E2E_COMPARTIDA lista los tipos E2E_VAR_PROC y E2E_VAR_POTENCIA
      expect(codes(await forModel(procModel))).toContain('E2E_COMPARTIDA')
      expect(codes(await forModel(powerModel))).toContain('E2E_COMPARTIDA')
      expect(codes(await forModel(procOtherStage))).not.toContain('E2E_COMPARTIDA')
    })

    it('una variable asociada a un tipo aplica a ese tipo aunque el tipo no esté en su red ni en su etapa', async () => {
      // E2E_VAR_POTENCIA está en la red FUR-PTE y la etapa D01; la variable dice FUR-PROC / D07 pero lista ese tipo
      await create({ code: 'E2E_EXPLICITA', label: 'E2E Explícita', valueType: 'NUMBER', networkCodes: ['FUR-PROC'], stageCodes: ['D07'], assetTypeCodes: ['E2E_VAR_POTENCIA'] }).expect(201)
      expect(codes(await forModel(powerModel))).toContain('E2E_EXPLICITA')
      expect(codes(await forModel(procModel))).not.toContain('E2E_EXPLICITA') // otro tipo: no
      await setValues(powerModel, { E2E_EXPLICITA: 5 }).expect(200)
      expect((await forModel(powerModel)).find((d) => d.code === 'E2E_EXPLICITA')?.value).toBe(5)
    })

    it('con varias redes basta con que el modelo esté en una de ellas', async () => {
      await create({ code: 'E2E_VARIAS_REDES', label: 'E2E Varias redes', valueType: 'TEXT', networkCodes: ['FUR-IOT', 'FUR-PTE'] }).expect(201)
      expect(codes(await forModel(powerModel))).toContain('E2E_VARIAS_REDES') // el modelo está en FUR-PTE
      expect(codes(await forModel(procModel))).not.toContain('E2E_VARIAS_REDES') // está en FUR-PROC, que no figura
    })

    it('también aplica si algún activo del modelo está en esa red o etapa, aunque el tipo no esté clasificado ahí', async () => {
      // procOtherStage es de un tipo en la red de procesos y la etapa 05: la variable de potencia no le aplica por el tipo
      expect(codes(await forModel(procOtherStage))).not.toContain('POTENCIA_INSTALADA_TOTAL_PTE')
      const plant = await t.plant('varasset', 'PUBLIC')
      await t.enableStage(plant.id, 'D05')
      await t.enableNetwork(plant.id, 'FUR-PTE')
      const created = await send('post', '/api/v1/plants/e2e-varasset/assets', admin, { tag: 'VAR-1', name: 'Activo de la prueba', assetModelId: procOtherStage, stageCode: 'D05', networkCodes: ['FUR-PTE'] }).expect(201)
      expect(codes(await forModel(procOtherStage))).toContain('POTENCIA_INSTALADA_TOTAL_PTE')
      await send('delete', `/api/v1/plants/e2e-varasset/assets/${created.body.id}`, admin).expect((r) => expect([200, 204]).toContain(r.status))
      expect(codes(await forModel(procOtherStage))).not.toContain('POTENCIA_INSTALADA_TOTAL_PTE') // dado de baja: deja de contar
    })

    it('un modelo que no existe responde 404', async () => {
      await http().get('/api/v1/catalog/models/018f0000-0000-7000-8000-000000000000/variables').expect(404)
    })
  })

  describe('valor general', () => {
    let generalId: string

    it('se define al crear la variable, con la misma validación que un valor de modelo', async () => {
      await create({ label: 'E2E Mal general', valueType: 'RANGE', defaultValue: { min: 9, max: 1 } }).expect(400)
      await create({ label: 'E2E Mal general', valueType: 'NUMBER', defaultValue: 'abc' }).expect(400)
      const res = await create({ code: 'E2E_GENERAL', label: 'E2E Tensión general', unit: 'kV', valueType: 'NUMBER', defaultValue: 13.8 }).expect(201)
      generalId = res.body.id
      expect(res.body.defaultValue).toBe(13.8)
    })

    it('llega con la variable a todos los modelos; el valor propio de un modelo lo reemplaza y borrarlo vuelve al general', async () => {
      const get = async (model: string) => (await forModel(model)).find((d) => d.code === 'E2E_GENERAL')!
      expect(await get(procModel)).toMatchObject({ defaultValue: 13.8, value: null })
      await setValues(procModel, { E2E_GENERAL: 6.6 }).expect(200)
      expect(await get(procModel)).toMatchObject({ defaultValue: 13.8, value: 6.6 })
      expect(await get(powerModel)).toMatchObject({ defaultValue: 13.8, value: null }) // los demás no cambian
      await setValues(procModel, { E2E_GENERAL: null }).expect(200)
      expect(await get(procModel)).toMatchObject({ defaultValue: 13.8, value: null })
    })

    it('se cambia o se quita con null; al cambiar el tipo de dato el valor general anterior se descarta', async () => {
      const upd = await send('patch', `/api/v1/catalog/variables/${generalId}`, admin, { defaultValue: 22 }).expect(200)
      expect(upd.body.defaultValue).toBe(22)
      await send('patch', `/api/v1/catalog/variables/${generalId}`, admin, { defaultValue: 'x' }).expect(400)
      const retyped = await send('patch', `/api/v1/catalog/variables/${generalId}`, admin, { valueType: 'TEXT' }).expect(200)
      expect(retyped.body).toMatchObject({ valueType: 'TEXT', defaultValue: null })
      const text = await send('patch', `/api/v1/catalog/variables/${generalId}`, admin, { defaultValue: 'Según el contrato' }).expect(200)
      expect(text.body.defaultValue).toBe('Según el contrato')
      const quitado = await send('patch', `/api/v1/catalog/variables/${generalId}`, admin, { defaultValue: null }).expect(200)
      expect(quitado.body.defaultValue).toBeNull()
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
    })

    it('actualizar algunos valores no toca los demás; null borra', async () => {
      await setValues(procModel, { ABERTURA_DE_CRIBADO_PROC_D01: 150, TIPO_DE_CRIBA_PROC_D01: null }).expect(200)
      const byCode = Object.fromEntries((await forModel(procModel)).map((d) => [d.code, d.value]))
      expect(byCode.ABERTURA_DE_CRIBADO_PROC_D01).toBe(150)
      expect(byCode.TIPO_DE_CRIBA_PROC_D01).toBeNull()
      expect(byCode.CAPACIDAD_NOMINAL_PROC_D01).toEqual({ min: 600, max: 800 })
    })

    it('el valor es por modelo: otro modelo del mismo contexto no lo hereda', async () => {
      const other = await send('post', '/api/v1/catalog/models', admin, { typeCode: 'E2E_VAR_PROC', modelName: 'E2E Modelo hermano', networkCodes: ['FUR-PROC'] }).expect(201)
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
      await setValues(procModel, { POTENCIA_INSTALADA_TOTAL_PTE: 1 }).expect(400) // es de la red de potencia
      await setValues(powerModel, { CAPACIDAD_NOMINAL_PROC_D01: { min: 1, max: 2 } }).expect(400)
    })
  })

  describe('editar y eliminar definiciones', () => {
    let defId: string

    it('cambia nombre, unidad, grupo, orden y alcance (también quitándolo para que sea general)', async () => {
      defId = (await create({ code: 'E2E_EDITABLE', label: 'E2E Editable', valueType: 'NUMBER', networkCodes: ['FUR-PROC'] }).expect(201)).body.id
      const res = await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { label: 'E2E Editable 2', unit: 'kg', group: 'Otro grupo', isKey: true, sortOrder: 5, stageCodes: ['D01', 'D02'], networkCodes: ['FUR-PROC', 'FUR-MNT'] }).expect(200)
      expect(res.body).toMatchObject({ code: 'E2E_EDITABLE', label: 'E2E Editable 2', unit: 'kg', group: 'Otro grupo', isKey: true, sortOrder: 5, stageCodes: ['D01', 'D02'], networkCodes: ['FUR-PROC', 'FUR-MNT'] })
      // lo que no se envía no se toca: solo se cambia el nombre y el alcance sigue igual
      const soloNombre = await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { label: 'E2E Editable 3' }).expect(200)
      expect(soloNombre.body).toMatchObject({ stageCodes: ['D01', 'D02'], networkCodes: ['FUR-PROC', 'FUR-MNT'] })
      const general = await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { stageCodes: [], networkCodes: [], assetTypeCodes: [], unit: null, group: null }).expect(200)
      expect(general.body).toMatchObject({ stageCodes: [], networkCodes: [], assetTypeCodes: [], unit: null, group: null })
      await send('patch', `/api/v1/catalog/variables/${defId}`, admin, {}).expect(400)
      await send('patch', `/api/v1/catalog/variables/${defId}`, admin, { stageCodes: ['D99'] }).expect(400)
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
