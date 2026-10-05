/**
 * Catálogo de permisos y matriz rol → permisos (arquitectura §5, §6, §8.3).
 * Fuente única: la usan el seed (BD), los tests y la documentación.
 * Cambiar la matriz = editar aquí y volver a correr `npm run db:seed`.
 */

export const PERMISSIONS = [
  // Planta y su configuración
  'plant.read',
  'plant.update',
  'plant.configure', // habilitar/deshabilitar etapas y redes
  'user.read',
  'user.assign', // asignar roles de planta a usuarios
  // Activos
  'asset.read',
  'asset.create',
  'asset.update',
  'asset.delete',
  // Inventario
  'inventory.read',
  'inventory.create',
  'inventory.update',
  'inventory.move',
  // Mantenimiento
  'maintenance.read',
  'maintenance.create',
  'maintenance.update',
  'maintenance.close',
  // Compras
  'procurement.read',
  'procurement.create',
  'procurement.approve',
  // Presupuesto (LULO/APU)
  'budget.read',
  'budget.edit',
  'budget.approve', // aprobar (congelar) presupuestos y valorizaciones
  // Documentos
  'document.read',
  'document.upload',
  'document.delete',
  // Telemetría
  'telemetry.read',
  'telemetry.write',
  // Laboratorio / calidad
  'quality.read',
  'quality.write',
] as const

export type PermissionCode = (typeof PERMISSIONS)[number]

const ALL: readonly PermissionCode[] = PERMISSIONS
const ALL_READ = PERMISSIONS.filter((p) => p.endsWith('.read'))

export const ROLE_PERMISSIONS: Record<string, readonly PermissionCode[]> = {
  ECOSYSTEM_ADMIN: ALL,
  PLANT_ADMIN: ALL,
  PLANT_MANAGER: [...ALL_READ, 'procurement.approve', 'maintenance.close', 'budget.approve'],
  MAINTENANCE_LEAD: [
    'plant.read',
    'asset.read',
    'asset.update',
    'maintenance.read',
    'maintenance.create',
    'maintenance.update',
    'maintenance.close',
    'inventory.read',
    'procurement.read',
    'procurement.create',
    'document.read',
    'document.upload',
    'telemetry.read',
  ],
  WAREHOUSE: [
    'plant.read',
    'asset.read',
    'inventory.read',
    'inventory.create',
    'inventory.update',
    'inventory.move',
    'procurement.read',
    'document.read',
  ],
  PROCUREMENT: [
    'plant.read',
    'asset.read',
    'inventory.read',
    'procurement.read',
    'procurement.create',
    'procurement.approve',
    'document.read',
  ],
  BUDGET: ['plant.read', 'asset.read', 'procurement.read', 'budget.read', 'budget.edit', 'document.read'],
  LAB_QUALITY: [
    'plant.read',
    'asset.read',
    'quality.read',
    'quality.write',
    'telemetry.read',
    'document.read',
    'document.upload',
  ],
  OPERATOR: [
    'plant.read',
    'asset.read',
    'inventory.read',
    'maintenance.read',
    'maintenance.create', // solicitar mantenimiento
    'telemetry.read',
    'telemetry.write',
  ],
  TECHNICIAN: [
    'plant.read',
    'asset.read',
    'asset.update',
    'maintenance.read',
    'inventory.read', // consultar repuestos para registrar su consumo en las órdenes
    'telemetry.read',
    'telemetry.write',
    'document.read',
  ],
  // Usuario común: solo lectura (ADR-006). Las lecturas públicas no requieren asignación.
  CONSUMER: ALL_READ,
  // Roles externos: su trabajo vive en sus propios módulos globales, no en datos internos de planta.
  INSTRUCTOR: [],
  PROVIDER: [],
  CONTRACTOR: [],
}
