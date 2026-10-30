import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../modules/iam/permissions.catalog'
import {
  assetFamilies,
  assetTypes,
  assetTypeStages,
  ecosystems,
  variableDefinitions,
  variableNetworks,
  variableStages,
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

// Etapas base del ecosistema: proceso y sala de control. Las altas manuales no se sobrescriben al repetir el seed.
const STAGES: Array<[code: string, name: string, group: string, color: string, description?: string]> = [
  ['D01', 'Recepción, chancado y cribado', 'TRITURACION', 'orange'],
  ['D02', 'Trituración primaria', 'TRITURACION', 'orange'],
  ['D03', 'Trituración secundaria', 'TRITURACION', 'orange'],
  ['D04', 'Almacenamiento (silos)', 'TRITURACION', 'orange'],
  ['D05', 'Molienda primaria', 'MOLIENDA', 'blue'],
  ['D06', 'Molienda secundaria', 'MOLIENDA', 'blue'],
  ['D07', 'Clasificación (hidrociclones)', 'MOLIENDA', 'blue'],
  ['D08', 'Pre-lixiviación', 'LIXIVIACION', 'green'],
  ['D09', 'Espesamiento (clarificador)', 'LIXIVIACION', 'green'],
  ['D10', 'Tanques CIL (adsorción)', 'LIXIVIACION', 'green'],
  ['D11', 'Tanques CIP (recuperación)', 'LIXIVIACION', 'green'],
  ['D12', 'Carbón cargado', 'CARBON', 'purple'],
  ['D13', 'Zadra / elución a presión controlada', 'ELUCION', 'yellow'],
  ['D14', 'Filtración del eluato', 'ELUCION', 'yellow'],
  ['D15', 'Electrodeposición (EW)', 'ELUCION', 'yellow'],
  ['D16', 'Secado y fundición', 'ELUCION', 'yellow'],
  ['D17', 'Regeneración de carbón', 'CARBON', 'purple'],
  ['D18', 'Manejo de soluciones', 'RELAVES', 'cyan'],
  ['D19', 'Relaves y agua / manejo ambiental', 'RELAVES', 'cyan'],
  ['D20', 'Sala de control y monitoreo', 'SALA DE CONTROL Y MONITOREO', 'cyan', 'Sala de control y monitoreo'],
]

export const DEFAULT_STAGE_COUNT = STAGES.length

// Las asignaciones de los tipos de demostración siguen limitadas al circuito de proceso D01–D19.
const ALL_STAGES = STAGES.map(([code]) => code).filter(code => code !== 'D20')

// Etapas en las que se usa cada tipo base (punto de partida: el administrador lo ajusta desde el catálogo).
// Motores, tableros y transformadores alimentan toda la planta, por eso cubren todas las etapas.
const TYPE_STAGES: Record<string, string[]> = {
  CHANCADORA_MANDIBULAS: ['D01', 'D02'],
  CHANCADORA_CONICA: ['D03'],
  MOLINO_SAG: ['D05'],
  MOLINO_BOLAS: ['D05', 'D06'],
  ZARANDA_VIBRATORIA: ['D01', 'D07'],
  HIDROCICLON: ['D06', 'D07'],
  CORREA_TRANSPORTADORA: ['D01', 'D04', 'D12'],
  BOMBA_CENTRIFUGA_PULPA: ['D06', 'D07', 'D09', 'D18', 'D19'],
  BOMBA_CENTRIFUGA_AGUA: ['D08', 'D10', 'D13', 'D18', 'D19'],
  ESPESADOR_ALTA_CAPACIDAD: ['D09', 'D19'],
  TANQUE_AGITADO_CIL: ['D08', 'D10', 'D11', 'D17'],
  HORNO_FUNDICION: ['D16'],
  MOTOR_ELECTRICO: ['D02', 'D03', 'D05', 'D06', 'D08', 'D10'],
  VALVULA_CUCHILLA: ['D08', 'D09', 'D10', 'D18', 'D19'],
  VALVULA_MARIPOSA: ['D08', 'D10', 'D13', 'D14', 'D15'],
  CCM: ALL_STAGES,
  TRANSFORMADOR_POTENCIA: ALL_STAGES,
  TRANSMISOR_NIVEL: ['D08', 'D09', 'D10', 'D18'],
  TRANSMISOR_FLUJO: ['D06', 'D08', 'D09', 'D10', 'D13', 'D18'],
}

// Redes de los modelos de demostración, solo al crearlos explícitamente en pruebas.
export const DEMO_MODEL_NETWORKS: Record<string, string[]> = {
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

// Variables de la ficha técnica (datos del fabricante) que arrancan definidas: ejemplo de la etapa 01 del proceso y de la
// red de potencia. El administrador crea las demás desde el catálogo. [código, nombre, unidad, tipo, red, etapa, grupo, clave, orden]
const VARIABLES: Array<[string, string, string | null, string, string, string | null, string, boolean, number]> = [
  ['CAPACIDAD_NOMINAL_PROC_D01', 'Capacidad nominal', 't/h', 'RANGE', 'FUR-PROC', 'D01', 'Variables críticas del proceso', true, 10],
  ['ABERTURA_DE_CRIBADO_PROC_D01', 'Abertura de cribado', 'mm', 'NUMBER', 'FUR-PROC', 'D01', 'Variables críticas del proceso', true, 20],
  ['TAMANO_DE_ROCA_ROM_PROC_D01', 'Tamaño de roca (ROM)', 'mm', 'RANGE', 'FUR-PROC', 'D01', 'Variables críticas del proceso', false, 30],
  ['TIPO_DE_CRIBA_PROC_D01', 'Tipo de criba', null, 'TEXT', 'FUR-PROC', 'D01', 'Variables críticas del proceso', false, 40],
  ['REVESTIMIENTO_PROC_D01', 'Revestimiento', null, 'TEXT', 'FUR-PROC', 'D01', 'Variables críticas del proceso', false, 50],
  ['INSTRUMENTACION_CLAVE_PROC_D01', 'Instrumentación clave', null, 'LIST', 'FUR-PROC', 'D01', 'Variables críticas del proceso', false, 60],
  // Red de potencia (aplican a todas las etapas)
  ['POTENCIA_INSTALADA_TOTAL_PTE', 'Potencia instalada total', 'kW', 'NUMBER', 'FUR-PTE', null, 'Variables críticas del proceso', true, 10],
  ['POTENCIA_DEMANDADA_TIPICA_PTE', 'Potencia demandada (típica)', 'kW', 'RANGE', 'FUR-PTE', null, 'Variables críticas del proceso', false, 20],
  ['TENSION_DE_SUMINISTRO_PTE', 'Tensión de suministro', 'kV', 'NUMBER', 'FUR-PTE', null, 'Variables críticas del proceso', true, 30],
  ['CORRIENTE_NOMINAL_PTE', 'Corriente nominal', 'A', 'RANGE', 'FUR-PTE', null, 'Variables críticas del proceso', true, 40],
  ['FACTOR_DE_POTENCIA_PTE', 'Factor de potencia', null, 'RANGE', 'FUR-PTE', null, 'Variables críticas del proceso', true, 50],
  ['SISTEMA_DE_ARRANQUE_PTE', 'Sistema de arranque', null, 'TEXT', 'FUR-PTE', null, 'Variables críticas del proceso', false, 60],
  ['RED_DE_DISTRIBUCION_PTE', 'Red de distribución', null, 'TEXT', 'FUR-PTE', null, 'Variables críticas del proceso', false, 70],
]

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

/** El catálogo de ejemplo es optativo; la inicialización normal deja sus tablas vacías. */
export async function runSeed(url: string, { includeDemoAssets = false }: { includeDemoAssets?: boolean } = {}) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  const db = drizzle(pool)

  try {
    // Idempotente (clave: code): solo crea las etapas base que falten. No pisa lo que el administrador edite en /masters
    // (nombre, grupo, color, orden, descripción, imagen), igual que las redes.
    await db
      .insert(stageMaster)
      .values(STAGES.map(([code, name, stageGroup, colorToken, description], i) => ({ code, name, stageGroup, colorToken, description, sequenceDefault: i + 1 })))
      .onConflictDoNothing({ target: stageMaster.code })

    // Las redes se administran desde el panel (crear, editar, eliminar): el seed solo crea las que faltan y no pisa
    // lo que el administrador haya cambiado.
    await db
      .insert(networkMaster)
      .values(NETWORKS.map(([code, name, icon, colorToken], i) => ({ code, name, icon, colorToken, sequence: i + 1 })))
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

    if (!includeDemoAssets) {
      console.log(`Seed base OK: ${STAGES.length} etapas, ${NETWORKS.length} redes, roles y permisos. Catálogo de ejemplo desactivado.`)
      return
    }

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

    // Etapas posibles por defecto de cada tipo. Solo se siembran los tipos que aún no tienen ninguna: lo que el
    // administrador cambie después no se pisa al volver a ejecutar el seed.
    const typeId = new Map((await db.select({ id: assetTypes.id, code: assetTypes.code }).from(assetTypes)).map((t) => [t.code, t.id]))
    const stageId = new Map((await db.select({ id: stageMaster.id, code: stageMaster.code }).from(stageMaster)).map((s) => [s.code, s.id]))
    const networkId = new Map((await db.select({ id: networkMaster.id, code: networkMaster.code }).from(networkMaster)).map((n) => [n.code, n.id]))
    const stagedTypes = new Set((await db.select({ id: assetTypeStages.assetTypeId }).from(assetTypeStages)).map((r) => r.id))
    for (const [code, id] of typeId) {
      if (!stagedTypes.has(id) && TYPE_STAGES[code]) {
        await db.insert(assetTypeStages).values(TYPE_STAGES[code].map((s) => ({ assetTypeId: id, stageMasterId: stageId.get(s)! }))).onConflictDoNothing()
      }
    }

    // Definiciones de variables: solo se crean las que faltan (no pisan lo que el administrador haya editado).
    for (const [code, label, unit, valueType, network, stage, groupLabel, isKey, sortOrder] of VARIABLES) {
      const [created] = await db
        .insert(variableDefinitions)
        .values({ code, label, unit, valueType, groupLabel, isKey, sortOrder })
        .onConflictDoNothing({ target: variableDefinitions.code })
        .returning({ id: variableDefinitions.id })
      if (!created) continue // ya existía: su alcance es el que tenga
      await db.insert(variableNetworks).values({ variableId: created.id, networkMasterId: networkId.get(network)! })
      if (stage) await db.insert(variableStages).values({ variableId: created.id, stageMasterId: stageId.get(stage)! })
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
