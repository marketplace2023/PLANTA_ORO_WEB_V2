import { WORK_ORDER_STATUSES, type WorkOrderStatus } from '../../database/schema'
import { addFrequency, assigneeMayTransition, BACKLOG_STATUSES, canTransition, isOpen, isOverdue, OPEN_STATUSES, permissionFor, TRANSITIONS } from './workflow'

describe('flujo de la orden de trabajo', () => {
  it('define transiciones para todos los estados y solo hacia estados válidos', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...WORK_ORDER_STATUSES].sort())
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const to of targets) {
        expect(WORK_ORDER_STATUSES).toContain(to)
        expect(to).not.toBe(from) // sin autotransiciones
      }
    }
  })

  it('CLOSED y CANCELLED son terminales', () => {
    expect(TRANSITIONS.CLOSED).toEqual([])
    expect(TRANSITIONS.CANCELLED).toEqual([])
  })

  it('el camino feliz es posible de principio a fin', () => {
    const path: WorkOrderStatus[] = ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED']
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true)
  })

  it('no se puede saltar pasos', () => {
    expect(canTransition('REQUESTED', 'IN_PROGRESS')).toBe(false)
    expect(canTransition('REQUESTED', 'COMPLETED')).toBe(false)
    expect(canTransition('PLANNED', 'IN_PROGRESS')).toBe(false) // hay que asignar primero
    expect(canTransition('IN_PROGRESS', 'CLOSED')).toBe(false) // hay que completar primero
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(false) // no se cancela trabajo ya ejecutándose
  })

  it('una orden completada se puede reabrir, pero una cerrada no', () => {
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(true)
    expect(canTransition('CLOSED', 'IN_PROGRESS')).toBe(false)
  })

  it('todo estado no terminal puede llegar a uno terminal (no hay callejones sin salida)', () => {
    const reachesTerminal = (s: WorkOrderStatus, seen = new Set<WorkOrderStatus>()): boolean => {
      if (TRANSITIONS[s].length === 0) return true
      if (seen.has(s)) return false
      seen.add(s)
      return TRANSITIONS[s].some((n) => reachesTerminal(n, seen))
    }
    for (const s of WORK_ORDER_STATUSES) expect({ s, ok: reachesTerminal(s) }).toEqual({ s, ok: true })
  })

  it('cerrar exige maintenance.close; el resto, maintenance.update', () => {
    expect(permissionFor('CLOSED')).toBe('maintenance.close')
    for (const s of WORK_ORDER_STATUSES.filter((x) => x !== 'CLOSED')) expect(permissionFor(s)).toBe('maintenance.update')
  })

  it('el técnico asignado puede reportar avance, pero no planificar, asignar, cerrar ni cancelar', () => {
    for (const s of ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const) expect(assigneeMayTransition(s)).toBe(true)
    for (const s of ['PLANNED', 'ASSIGNED', 'CLOSED', 'CANCELLED', 'REQUESTED'] as const) expect(assigneeMayTransition(s)).toBe(false)
  })

  it('abiertas y backlog son coherentes', () => {
    expect(OPEN_STATUSES).toEqual(['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'])
    for (const s of BACKLOG_STATUSES) expect(isOpen(s)).toBe(true)
    expect(isOpen('COMPLETED')).toBe(false)
    expect(isOpen('CANCELLED')).toBe(false)
  })
})

describe('isOverdue', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const past = new Date('2026-10-09T12:00:00Z')
  const future = new Date('2026-10-11T12:00:00Z')

  it('atrasada = abierta con fecha límite vencida', () => {
    expect(isOverdue({ status: 'PLANNED', plannedEnd: past }, now)).toBe(true)
    expect(isOverdue({ status: 'IN_PROGRESS', plannedEnd: past }, now)).toBe(true)
    expect(isOverdue({ status: 'PLANNED', plannedEnd: future }, now)).toBe(false)
  })

  it('sin fecha límite nunca está atrasada', () => {
    expect(isOverdue({ status: 'PLANNED', plannedEnd: null }, now)).toBe(false)
  })

  it('una orden terminada o cancelada no está atrasada aunque la fecha haya pasado', () => {
    for (const status of ['COMPLETED', 'CLOSED', 'CANCELLED'] as const) expect(isOverdue({ status, plannedEnd: past }, now)).toBe(false)
  })
})

describe('addFrequency', () => {
  const d = (s: string) => new Date(s)

  it('días y semanas', () => {
    expect(addFrequency(d('2026-10-01T08:00:00Z'), { value: 10, unit: 'DAYS' }).toISOString()).toBe('2026-10-11T08:00:00.000Z')
    expect(addFrequency(d('2026-10-01T08:00:00Z'), { value: 2, unit: 'WEEKS' }).toISOString()).toBe('2026-10-15T08:00:00.000Z')
  })

  it('cruza fin de mes y de año', () => {
    expect(addFrequency(d('2026-12-25T00:00:00Z'), { value: 10, unit: 'DAYS' }).toISOString()).toBe('2027-01-04T00:00:00.000Z')
  })

  it('meses: conserva el día y la hora', () => {
    expect(addFrequency(d('2026-10-15T14:30:00Z'), { value: 3, unit: 'MONTHS' }).toISOString()).toBe('2027-01-15T14:30:00.000Z')
  })

  it('meses: el día 31 se ajusta al último día del mes destino', () => {
    expect(addFrequency(d('2026-01-31T00:00:00Z'), { value: 1, unit: 'MONTHS' }).toISOString()).toBe('2026-02-28T00:00:00.000Z')
    expect(addFrequency(d('2028-01-31T00:00:00Z'), { value: 1, unit: 'MONTHS' }).toISOString()).toBe('2028-02-29T00:00:00.000Z') // bisiesto
    expect(addFrequency(d('2026-08-31T00:00:00Z'), { value: 1, unit: 'MONTHS' }).toISOString()).toBe('2026-09-30T00:00:00.000Z')
  })

  it('12 meses = 1 año; no muta la fecha original', () => {
    const base = d('2026-03-10T00:00:00Z')
    expect(addFrequency(base, { value: 12, unit: 'MONTHS' }).toISOString()).toBe('2027-03-10T00:00:00.000Z')
    expect(base.toISOString()).toBe('2026-03-10T00:00:00.000Z')
  })
})
