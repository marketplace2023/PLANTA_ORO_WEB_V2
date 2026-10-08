import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../modules/iam/permissions.catalog'
import {
  assetFamilies,
  assetTypeNetworks,
  assetTypes,
  assetTypeStages,
  ecosystems,
  networkMaster,
  permissions,
  rolePermissions,
  roles,
  stageMaster,
} from './schema'

// Arquitectura §10.1: familias y tipos base del catálogo global. Íconos = nombres de Lucide.
const FAMILIES: Array<[code: string, name: string, icon: string]> = [
  ['TRITURADORAS', 'Trituradoras', 'hammer'],
  ['MOLINOS', 'Molinos', 'cog'],
  ['CRIBAS', 'Cribas y clasificadores', 'filter'],
  ['TRANSPORTADORES', 'Transportadores', 'move-horizontal'],
  ['BOMBAS', 'Bombas', 'droplets'],
  ['ESPESADORES', 'Espesadores', 'circle-dot'],
  ['TANQUES', 'Tanques y agitadores', 'container'],
  ['HORNOS', 'Hornos', 'flame'],
  ['MOTORES', 'Motores', 'zap'],
  ['VALVULAS', 'Válvulas', 'git-merge'],
  ['TABLEROS', 'Tableros eléctricos', 'panel-top'],
  ['TRANSFORMADORES', 'Transformadores', 'plug-zap'],
  ['INSTRUMENTOS', 'Instrumentos', 'gauge'],
]

const TYPES: Array<[code: string, family: string, name: string]> = [
  ['CHANCADORA_MANDIBULAS', 'TRITURADORAS', 'Chancadora de mandíbulas'],
  ['CHANCADORA_CONICA', 'TRITURADORAS', 'Chancadora cónica'],
  ['MOLINO_SAG', 'MOLINOS', 'Molino SAG'],
  ['MOLINO_BOLAS', 'MOLINOS', 'Molino de bolas'],
  ['ZARANDA_VIBRATORIA', 'CRIBAS', 'Zaranda vibratoria'],
  ['HIDROCICLON', 'CRIBAS', 'Hidrociclón'],
  ['CORREA_TRANSPORTADORA', 'TRANSPORTADORES', 'Correa transportadora'],
  ['BOMBA_CENTRIFUGA_PULPA', 'BOMBAS', 'Bomba centrífuga de pulpa'],
  ['BOMBA_CENTRIFUGA_AGUA', 'BOMBAS', 'Bomba centrífuga de agua'],
  ['ESPESADOR_ALTA_CAPACIDAD', 'ESPESADORES', 'Espesador de alta capacidad'],
  ['TANQUE_AGITADO_CIL', 'TANQUES', 'Tanque agitado CIL'],
  ['HORNO_FUNDICION', 'HORNOS', 'Horno de fundición'],
  ['MOTOR_ELECTRICO', 'MOTORES', 'Motor eléctrico'],
  ['VALVULA_CUCHILLA', 'VALVULAS', 'Válvula de cuchilla'],
  ['VALVULA_MARIPOSA', 'VALVULAS', 'Válvula de mariposa'],
  ['CCM', 'TABLEROS', 'Centro de control de motores'],
  ['TRANSFORMADOR_POTENCIA', 'TRANSFORMADORES', 'Transformador de potencia'],
  ['TRANSMISOR_NIVEL', 'INSTRUMENTOS', 'Transmisor de nivel'],
  ['TRANSMISOR_FLUJO', 'INSTRUMENTOS', 'Transmisor de flujo'],
]

// Arquitectura §11.1. Los grupos/colores siguen la orientación de design.md §32.
const STAGES: Array<[code: string, name: string, group: string, color: string]> = [
  ['D01', 'Recepción y Alimentación', 'TRITURACION', 'orange'],
  ['D02', 'Trituración Primaria', 'TRITURACION', 'orange'],
  ['D03', 'Cribado Primario', 'TRITURACION', 'orange'],
  ['D04', 'Trituración Secundaria', 'TRITURACION', 'orange'],
  ['D05', 'Transporte y Almacenamiento Intermedio', 'TRITURACION', 'orange'],
  ['D06', 'Molienda Primaria', 'MOLIENDA', 'blue'],
  ['D07', 'Molienda Secundaria', 'MOLIENDA', 'blue'],
  ['D08', 'Clasificación', 'MOLIENDA', 'blue'],
  ['D09', 'Acondicionamiento / Pre-lixiviación', 'LIXIVIACION', 'green'],
  ['D10', 'Espesamiento Pre-lixiviación', 'LIXIVIACION', 'green'],
  ['D11', 'Lixiviación y Adsorción CIL', 'LIXIVIACION', 'green'],
  ['D12', 'Recuperación y Manejo de Carbón Cargado', 'CARBON', 'purple'],
  ['D13', 'Lavado Ácido de Carbón', 'CARBON', 'purple'],
  ['D14', 'Elución / Desorción', 'ELUCION', 'yellow'],
  ['D15', 'Electrowinning', 'ELUCION', 'yellow'],
  ['D16', 'Secado / Calcinación', 'ELUCION', 'yellow'],
  ['D17', 'Fundición y Producto Doré', 'ELUCION', 'yellow'],
  ['D18', 'Reactivación y Retorno de Carbón', 'CARBON', 'purple'],
  ['D19', 'Espesamiento y Manejo de Relaves', 'RELAVES', 'cyan'],
  ['D20', 'Disposición de Relaves / Colas', 'RELAVES', 'cyan'],
]

const ALL_STAGES = STAGES.map(([code]) => code)

// Etapas en las que se usa cada tipo base (punto de partida: el administrador lo ajusta desde el catálogo).
// Motores, tableros y transformadores alimentan toda la planta, por eso cubren todas las etapas.
const TYPE_STAGES: Record<string, string[]> = {
  CHANCADORA_MANDIBULAS: ['D02'],
  CHANCADORA_CONICA: ['D04'],
  MOLINO_SAG: ['D06'],
  MOLINO_BOLAS: ['D06', 'D07'],
  ZARANDA_VIBRATORIA: ['D03', 'D08'],
  HIDROCICLON: ['D07', 'D08'],
  CORREA_TRANSPORTADORA: ['D01', 'D05', 'D12'],
  BOMBA_CENTRIFUGA_PULPA: ['D07', 'D08', 'D10', 'D19', 'D20'],
  BOMBA_CENTRIFUGA_AGUA: ['D09', 'D11', 'D13', 'D14'],
  ESPESADOR_ALTA_CAPACIDAD: ['D10', 'D19'],
  TANQUE_AGITADO_CIL: ['D09', 'D11', 'D13', 'D18'],
  HORNO_FUNDICION: ['D16', 'D17'],
  MOTOR_ELECTRICO: ['D02', 'D04', 'D06', 'D07', 'D09', 'D11'],
  VALVULA_CUCHILLA: ['D09', 'D10', 'D11', 'D19', 'D20'],
  VALVULA_MARIPOSA: ['D09', 'D11', 'D13', 'D14', 'D15'],
  CCM: ALL_STAGES,
  TRANSFORMADOR_POTENCIA: ALL_STAGES,
  TRANSMISOR_NIVEL: ['D09', 'D10', 'D11', 'D19'],
  TRANSMISOR_FLUJO: ['D07', 'D09', 'D10', 'D11', 'D14', 'D19'],
}

// Redes transversales de cada tipo base.
const TYPE_NETWORKS: Record<string, string[]> = {
  CHANCADORA_MANDIBULAS: ['FUR-PROC', 'FUR-MNT'],
  CHANCADORA_CONICA: ['FUR-PROC', 'FUR-MNT'],
  MOLINO_SAG: ['FUR-PROC', 'FUR-PTE', 'FUR-MNT'],
  MOLINO_BOLAS: ['FUR-PROC', 'FUR-PTE', 'FUR-MNT'],
  ZARANDA_VIBRATORIA: ['FUR-PROC', 'FUR-MNT'],
  HIDROCICLON: ['FUR-PROC'],
  CORREA_TRANSPORTADORA: ['FUR-PROC', 'FUR-MNT'],
  BOMBA_CENTRIFUGA_PULPA: ['FUR-PROC', 'FUR-MNT'],
  BOMBA_CENTRIFUGA_AGUA: ['FUR-PROC', 'FUR-MNT'],
  ESPESADOR_ALTA_CAPACIDAD: ['FUR-PROC'],
  TANQUE_AGITADO_CIL: ['FUR-PROC', 'FUR-LAB'],
  HORNO_FUNDICION: ['FUR-PROC', 'FUR-PTE'],
  MOTOR_ELECTRICO: ['FUR-PTE', 'FUR-MNT'],
  VALVULA_CUCHILLA: ['FUR-PROC'],
  VALVULA_MARIPOSA: ['FUR-PROC'],
  CCM: ['FUR-PTE', 'FUR-IOT'],
  TRANSFORMADOR_POTENCIA: ['FUR-PTE'],
  TRANSMISOR_NIVEL: ['FUR-IOT', 'FUR-PROC'],
  TRANSMISOR_FLUJO: ['FUR-IOT', 'FUR-PROC'],
}

// Arquitectura §12.1. Íconos = nombres de Lucide.
const NETWORKS: Array<[code: string, name: string, icon: string, color: string]> = [
  ['FUR-PROC', 'Procesos', 'cog', 'network-proc'],
  ['FUR-PTE', 'Potencia Eléctrica', 'zap', 'network-pte'],
  ['FUR-IOT', 'IoT / Instrumentación', 'radio', 'network-iot'],
  ['FUR-GPON', 'Comunicaciones', 'network', 'network-gpon'],
  ['FUR-CC', 'Control de Calidad', 'badge-check', 'network-cc'],
  ['FUR-LAB', 'Laboratorios', 'flask-conical', 'network-lab'],
  ['FUR-MNT', 'Mantenimiento', 'wrench', 'network-mnt'],
  ['FUR-RQ', 'Requisiciones', 'clipboard-list', 'network-rq'],
  ['FUR-OF', 'Ofertas Comerciales', 'tag', 'network-of'],
  ['FUR-CAM', 'Cámaras / Seguridad', 'camera', 'network-cam'],
]

// Arquitectura §5.1
const ROLES: Array<[code: string, name: string, scope: 'GLOBAL' | 'PLANT' | 'EXTERNAL']> = [
  ['ECOSYSTEM_ADMIN', 'Administrador del ecosistema', 'GLOBAL'],
  ['PLANT_ADMIN', 'Administrador de planta', 'PLANT'],
  ['PLANT_MANAGER', 'Gerente de planta', 'PLANT'],
  ['MAINTENANCE_LEAD', 'Jefe de mantenimiento', 'PLANT'],
  ['WAREHOUSE', 'Almacén / logística', 'PLANT'],
  ['PROCUREMENT', 'Compras', 'PLANT'],
  ['BUDGET', 'Presupuesto / costos', 'PLANT'],
  ['LAB_QUALITY', 'Laboratorio / calidad', 'PLANT'],
  ['OPERATOR', 'Operador de planta', 'PLANT'],
  ['TECHNICIAN', 'Técnico / instrumentista', 'PLANT'],
  ['INSTRUCTOR', 'Instructor', 'EXTERNAL'],
  ['PROVIDER', 'Proveedor', 'EXTERNAL'],
  ['CONTRACTOR', 'Servicio profesional / contratista', 'EXTERNAL'],
  ['CONSUMER', 'Usuario común / consumidor', 'EXTERNAL'],
]

export async function runSeed(url: string) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  const db = drizzle(pool)

  try {
    // Idempotente: re-ejecutar actualiza nombres/grupos sin duplicar (clave: code).
    await db
      .insert(stageMaster)
      .values(STAGES.map(([code, name, stageGroup, colorToken], i) => ({ code, name, stageGroup, colorToken, sequenceDefault: i + 1 })))
      .onConflictDoUpdate({
        target: stageMaster.code,
        set: {
          name: sql`excluded.name`,
          stageGroup: sql`excluded.stage_group`,
          colorToken: sql`excluded.color_token`,
          sequenceDefault: sql`excluded.sequence_default`,
        },
      })

    // Las redes se administran desde el panel (crear, editar, eliminar): el seed solo crea las que faltan y no pisa
    // lo que el administrador haya cambiado.
    await db
      .insert(networkMaster)
      .values(NETWORKS.map(([code, name, icon, colorToken]) => ({ code, name, icon, colorToken })))
      .onConflictDoNothing({ target: networkMaster.code })

    await db
      .insert(roles)
      .values(ROLES.map(([code, name, scope]) => ({ code, name, scope })))
      .onConflictDoUpdate({ target: roles.code, set: { name: sql`excluded.name`, scope: sql`excluded.scope` } })

    // Permisos y matriz rol → permisos (fuente: permissions.catalog.ts). Se sincroniza en ambos sentidos.
    await db
      .insert(permissions)
      .values(
        PERMISSIONS.map((code) => {
          const [resource, ...rest] = code.split('.')
          return { code, resource, action: rest.join('.') }
        }),
      )
      .onConflictDoNothing({ target: permissions.code })
    await db.delete(permissions).where(notInArray(permissions.code, [...PERMISSIONS]))

    const roleRows = await db.select({ id: roles.id, code: roles.code }).from(roles)
    const permRows = await db.select({ id: permissions.id, code: permissions.code }).from(permissions)
    const permId = new Map(permRows.map((p) => [p.code, p.id]))
    for (const role of roleRows) {
      const desired = (ROLE_PERMISSIONS[role.code] ?? []).map((c) => permId.get(c)!)
      await db
        .delete(rolePermissions)
        .where(
          desired.length > 0
            ? and(eq(rolePermissions.roleId, role.id), notInArray(rolePermissions.permissionId, desired))
            : eq(rolePermissions.roleId, role.id),
        )
      if (desired.length > 0) {
        await db
          .insert(rolePermissions)
          .values(desired.map((permissionId) => ({ roleId: role.id, permissionId })))
          .onConflictDoNothing()
      }
    }

    await db.insert(ecosystems).values({ code: 'FUR', name: 'Ecosistema FUR' }).onConflictDoNothing({ target: ecosystems.code })

    // Catálogo base de activos (global). Idempotente por code.
    await db
      .insert(assetFamilies)
      .values(FAMILIES.map(([code, name, icon]) => ({ code, name, icon })))
      .onConflictDoUpdate({ target: assetFamilies.code, set: { name: sql`excluded.name`, icon: sql`excluded.icon` } })
    const familyId = new Map((await db.select().from(assetFamilies)).map((f) => [f.code, f.id]))
    await db
      .insert(assetTypes)
      .values(TYPES.map(([code, family, name]) => ({ code, name, familyId: familyId.get(family)! })))
      .onConflictDoUpdate({ target: assetTypes.code, set: { name: sql`excluded.name`, familyId: sql`excluded.family_id` } })

    // Etapas y redes por defecto de cada tipo. Solo se siembran los tipos que aún no tienen ninguna: lo que el
    // administrador cambie después no se pisa al volver a ejecutar el seed.
    const typeId = new Map((await db.select({ id: assetTypes.id, code: assetTypes.code }).from(assetTypes)).map((t) => [t.code, t.id]))
    const stageId = new Map((await db.select({ id: stageMaster.id, code: stageMaster.code }).from(stageMaster)).map((s) => [s.code, s.id]))
    const networkId = new Map((await db.select({ id: networkMaster.id, code: networkMaster.code }).from(networkMaster)).map((n) => [n.code, n.id]))
    const stagedTypes = new Set((await db.select({ id: assetTypeStages.assetTypeId }).from(assetTypeStages)).map((r) => r.id))
    const networkedTypes = new Set((await db.select({ id: assetTypeNetworks.assetTypeId }).from(assetTypeNetworks)).map((r) => r.id))
    for (const [code, id] of typeId) {
      if (!stagedTypes.has(id) && TYPE_STAGES[code]) {
        await db.insert(assetTypeStages).values(TYPE_STAGES[code].map((s) => ({ assetTypeId: id, stageMasterId: stageId.get(s)! }))).onConflictDoNothing()
      }
      if (!networkedTypes.has(id) && TYPE_NETWORKS[code]) {
        await db.insert(assetTypeNetworks).values(TYPE_NETWORKS[code].map((n) => ({ assetTypeId: id, networkMasterId: networkId.get(n)! }))).onConflictDoNothing()
      }
    }

    console.log(
      `Seed OK: ${STAGES.length} etapas, ${NETWORKS.length} redes, ${ROLES.length} roles, ${PERMISSIONS.length} permisos`,
    )
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* sin .env: se usan las variables del entorno */
  }

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }

  runSeed(url).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
