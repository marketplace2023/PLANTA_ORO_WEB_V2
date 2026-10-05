import { AlertCircle, CheckCircle2, CircleDashed, ClipboardList, Lock, PauseCircle, PlayCircle, UserCheck, XCircle, type LucideIcon } from 'lucide-react'

export const WORK_ORDER_STATUSES = ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED'] as const
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

/** Columnas del Kanban (design.md §38). Las canceladas no tienen columna. */
export const KANBAN_COLUMNS: readonly WorkOrderStatus[] = ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED']

export const WORK_ORDER_TYPES = ['CORRECTIVE', 'PREVENTIVE', 'PREDICTIVE', 'INSPECTION'] as const
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number]

export const WORK_ORDER_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number]

export const STATUS_META: Record<WorkOrderStatus, { label: string; icon: LucideIcon; color: string }> = {
  REQUESTED: { label: 'Solicitada', icon: ClipboardList, color: 'var(--fur-steel-500)' },
  PLANNED: { label: 'Planificada', icon: CircleDashed, color: 'var(--fur-blue-500)' },
  ASSIGNED: { label: 'Asignada', icon: UserCheck, color: 'var(--fur-cyan-500)' },
  IN_PROGRESS: { label: 'En ejecución', icon: PlayCircle, color: 'var(--fur-orange-500)' },
  ON_HOLD: { label: 'En espera', icon: PauseCircle, color: 'var(--fur-yellow-500)' },
  COMPLETED: { label: 'Completada', icon: CheckCircle2, color: 'var(--fur-green-500)' },
  CLOSED: { label: 'Cerrada', icon: Lock, color: 'var(--fur-navy-700)' },
  CANCELLED: { label: 'Cancelada', icon: XCircle, color: 'var(--fur-red-500)' },
}

export const TYPE_LABELS: Record<WorkOrderType, string> = {
  CORRECTIVE: 'Correctivo',
  PREVENTIVE: 'Preventivo',
  PREDICTIVE: 'Predictivo',
  INSPECTION: 'Inspección',
}

export const PRIORITY_META: Record<WorkOrderPriority, { label: string; color: string; icon: LucideIcon }> = {
  LOW: { label: 'Baja', color: 'var(--fur-steel-500)', icon: CircleDashed },
  MEDIUM: { label: 'Media', color: 'var(--fur-blue-500)', icon: CircleDashed },
  HIGH: { label: 'Alta', color: 'var(--fur-orange-500)', icon: AlertCircle },
  URGENT: { label: 'Urgente', color: 'var(--fur-red-500)', icon: AlertCircle },
}

/** Costos de una orden distintos de los repuestos (que salen del inventario). */
export const COST_KINDS = ['LABOR', 'EQUIPMENT', 'TRANSPORT', 'SERVICE', 'OTHER'] as const
export type CostKind = (typeof COST_KINDS)[number]
export const COST_KIND_LABELS: Record<CostKind, string> = {
  LABOR: 'Mano de obra',
  EQUIPMENT: 'Equipo',
  TRANSPORT: 'Transporte',
  SERVICE: 'Servicio externo',
  OTHER: 'Otro',
}

export const FREQUENCY_UNITS = ['DAYS', 'WEEKS', 'MONTHS'] as const
export type FrequencyUnit = (typeof FREQUENCY_UNITS)[number]
export const FREQUENCY_LABELS: Record<FrequencyUnit, { one: string; many: string }> = {
  DAYS: { one: 'día', many: 'días' },
  WEEKS: { one: 'semana', many: 'semanas' },
  MONTHS: { one: 'mes', many: 'meses' },
}

export const PLAN_TYPES = ['PREVENTIVE', 'PREDICTIVE', 'CONDITION'] as const
export const PLAN_TYPE_LABELS: Record<(typeof PLAN_TYPES)[number], string> = { PREVENTIVE: 'Preventivo', PREDICTIVE: 'Predictivo', CONDITION: 'Por condición' }

export const statusLabel = (s: string) => STATUS_META[s as WorkOrderStatus]?.label ?? s
export const typeLabel = (t: string) => TYPE_LABELS[t as WorkOrderType] ?? t
export const priorityLabel = (p: string) => PRIORITY_META[p as WorkOrderPriority]?.label ?? p

export function frequencyText(value: number, unit: string): string {
  const label = FREQUENCY_LABELS[unit as FrequencyUnit]
  if (!label) return `${value} ${unit}`
  return value === 1 ? `Cada ${label.one}` : `Cada ${value} ${label.many}`
}

/**
 * Espejo del backend (apps/api/src/modules/maintenance/workflow.ts): la UI nunca ofrece una transición
 * que el servidor rechazaría. El servidor sigue siendo la barrera real.
 */
export function canMoveTo(
  to: WorkOrderStatus,
  wo: { assignedTo: { id: string } | null },
  ctx: { permissions: readonly string[]; userId: string | undefined },
): boolean {
  const needed = to === 'CLOSED' ? 'maintenance.close' : 'maintenance.update'
  if (ctx.permissions.includes(needed)) return true
  const assigneeMay = to === 'IN_PROGRESS' || to === 'ON_HOLD' || to === 'COMPLETED'
  return assigneeMay && !!ctx.userId && wo.assignedTo?.id === ctx.userId
}

/** `datetime-local` (hora del navegador) → ISO UTC para la API. */
export const localToIso = (value: string): string | undefined => (value ? new Date(value).toISOString() : undefined)

/** ISO → valor para un input `datetime-local` en hora local. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Texto del botón para pasar de un estado a otro (verbos, no nombres de estado). */
export function actionLabel(from: WorkOrderStatus, to: WorkOrderStatus): string {
  if (to === 'PLANNED') return from === 'ASSIGNED' ? 'Devolver a planificada' : 'Planificar'
  if (to === 'ASSIGNED') return 'Asignar'
  if (to === 'IN_PROGRESS') return from === 'ON_HOLD' ? 'Reanudar' : from === 'COMPLETED' ? 'Reabrir' : 'Iniciar'
  if (to === 'ON_HOLD') return 'Poner en espera'
  if (to === 'COMPLETED') return 'Completar'
  if (to === 'CLOSED') return 'Cerrar'
  if (to === 'CANCELLED') return 'Cancelar'
  return statusLabel(to)
}

/** Abierta = aún requiere trabajo o seguimiento (espejo del backend). */
export const isOpenStatus = (s: WorkOrderStatus) => ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(s)
