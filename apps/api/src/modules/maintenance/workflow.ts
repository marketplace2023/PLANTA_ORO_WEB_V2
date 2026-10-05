import type { PermissionCode } from '../iam/permissions.catalog'
import type { WorkOrderStatus } from '../../database/schema'

/**
 * Flujo de la orden de trabajo (design.md §38, Kanban):
 * Solicitada → Planificada → Asignada → En ejecución ⇄ En espera → Completada → Cerrada
 * Cancelar es posible antes de ejecutar (o desde "En espera"); Completada se puede reabrir.
 */
export const TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  REQUESTED: ['PLANNED', 'CANCELLED'],
  PLANNED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
}

/** Abierta = aún requiere trabajo o seguimiento. */
export const OPEN_STATUSES: readonly WorkOrderStatus[] = ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD']
/** Backlog = trabajo identificado que todavía no empezó. */
export const BACKLOG_STATUSES: readonly WorkOrderStatus[] = ['REQUESTED', 'PLANNED', 'ASSIGNED']
export const DONE_STATUSES: readonly WorkOrderStatus[] = ['COMPLETED', 'CLOSED']

export const canTransition = (from: WorkOrderStatus, to: WorkOrderStatus) => TRANSITIONS[from].includes(to)

/** Transiciones que puede ejecutar quien tiene asignada la OT aunque no tenga maintenance.update. */
const ASSIGNEE_TRANSITIONS: readonly WorkOrderStatus[] = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED']

/**
 * Permiso exigido para pasar a `to`. Cerrar es una aprobación (maintenance.close);
 * el resto lo planifica quien tiene maintenance.update.
 */
export function permissionFor(to: WorkOrderStatus): PermissionCode {
  return to === 'CLOSED' ? 'maintenance.close' : 'maintenance.update'
}

/** El técnico asignado puede reportar avance (iniciar, pausar, completar) con solo maintenance.read. */
export function assigneeMayTransition(to: WorkOrderStatus): boolean {
  return ASSIGNEE_TRANSITIONS.includes(to)
}

export type Frequency = { value: number; unit: 'DAYS' | 'WEEKS' | 'MONTHS' }

/** Suma una frecuencia en UTC; los meses se ajustan al último día (31 ene + 1 mes = 28/29 feb). */
export function addFrequency(from: Date, { value, unit }: Frequency): Date {
  const d = new Date(from.getTime())
  if (unit === 'DAYS') d.setUTCDate(d.getUTCDate() + value)
  else if (unit === 'WEEKS') d.setUTCDate(d.getUTCDate() + value * 7)
  else {
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + value)
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, lastDay))
  }
  return d
}

export const isOpen = (status: WorkOrderStatus) => OPEN_STATUSES.includes(status)

/** Atrasada: sigue abierta y su fecha límite ya pasó. */
export function isOverdue(wo: { status: WorkOrderStatus; plannedEnd: Date | null }, now = new Date()): boolean {
  return isOpen(wo.status) && !!wo.plannedEnd && wo.plannedEnd.getTime() < now.getTime()
}
