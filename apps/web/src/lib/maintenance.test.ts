import { describe, expect, it } from 'vitest'
import { actionLabel, canMoveTo, frequencyText, isOpenStatus, isoToLocalInput, KANBAN_COLUMNS, localToIso, STATUS_META, WORK_ORDER_STATUSES } from './maintenance'

const none = { assignedTo: null }
const mine = { assignedTo: { id: 'me' } }
const theirs = { assignedTo: { id: 'otro' } }

describe('canMoveTo (espejo de las reglas del backend)', () => {
  it('quien planifica (maintenance.update) puede mover casi todo, pero no cerrar sin maintenance.close', () => {
    const ctx = { permissions: ['maintenance.read', 'maintenance.update'], userId: 'me' }
    for (const to of ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const) expect(canMoveTo(to, none, ctx)).toBe(true)
    expect(canMoveTo('CLOSED', none, ctx)).toBe(false)
  })

  it('cerrar exige maintenance.close (el gerente puede cerrar pero no planificar)', () => {
    const ctx = { permissions: ['maintenance.read', 'maintenance.close'], userId: 'me' }
    expect(canMoveTo('CLOSED', none, ctx)).toBe(true)
    expect(canMoveTo('PLANNED', none, ctx)).toBe(false)
  })

  it('el técnico asignado puede iniciar, pausar y completar con solo lectura', () => {
    const ctx = { permissions: ['maintenance.read'], userId: 'me' }
    for (const to of ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const) expect(canMoveTo(to, mine, ctx)).toBe(true)
  })

  it('el asignado no puede planificar, asignar, cerrar ni cancelar', () => {
    const ctx = { permissions: ['maintenance.read'], userId: 'me' }
    for (const to of ['PLANNED', 'ASSIGNED', 'CLOSED', 'CANCELLED'] as const) expect(canMoveTo(to, mine, ctx)).toBe(false)
  })

  it('otro técnico (no asignado) o un anónimo no pueden reportar avance', () => {
    expect(canMoveTo('IN_PROGRESS', theirs, { permissions: ['maintenance.read'], userId: 'me' })).toBe(false)
    expect(canMoveTo('IN_PROGRESS', mine, { permissions: ['maintenance.read'], userId: undefined })).toBe(false)
    expect(canMoveTo('IN_PROGRESS', none, { permissions: [], userId: 'me' })).toBe(false)
  })
})

describe('textos y utilidades', () => {
  it('cada estado tiene etiqueta, icono y color; el Kanban no incluye cancelada', () => {
    for (const s of WORK_ORDER_STATUSES) expect(STATUS_META[s]).toMatchObject({ label: expect.any(String), icon: expect.anything(), color: expect.any(String) })
    expect(new Set(WORK_ORDER_STATUSES.map((s) => STATUS_META[s].label)).size).toBe(WORK_ORDER_STATUSES.length)
    expect(KANBAN_COLUMNS).toHaveLength(7)
    expect(KANBAN_COLUMNS).not.toContain('CANCELLED')
  })

  it('actionLabel usa verbos según el origen', () => {
    expect(actionLabel('REQUESTED', 'PLANNED')).toBe('Planificar')
    expect(actionLabel('ASSIGNED', 'PLANNED')).toBe('Devolver a planificada')
    expect(actionLabel('ASSIGNED', 'IN_PROGRESS')).toBe('Iniciar')
    expect(actionLabel('ON_HOLD', 'IN_PROGRESS')).toBe('Reanudar')
    expect(actionLabel('COMPLETED', 'IN_PROGRESS')).toBe('Reabrir')
    expect(actionLabel('IN_PROGRESS', 'COMPLETED')).toBe('Completar')
    expect(actionLabel('COMPLETED', 'CLOSED')).toBe('Cerrar')
    expect(actionLabel('PLANNED', 'CANCELLED')).toBe('Cancelar')
  })

  it('frequencyText singular y plural', () => {
    expect(frequencyText(1, 'MONTHS')).toBe('Cada mes')
    expect(frequencyText(3, 'MONTHS')).toBe('Cada 3 meses')
    expect(frequencyText(2, 'WEEKS')).toBe('Cada 2 semanas')
    expect(frequencyText(1, 'DAYS')).toBe('Cada día')
    expect(frequencyText(5, 'RARO')).toBe('5 RARO')
  })

  it('isOpenStatus', () => {
    for (const s of ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] as const) expect(isOpenStatus(s)).toBe(true)
    for (const s of ['COMPLETED', 'CLOSED', 'CANCELLED'] as const) expect(isOpenStatus(s)).toBe(false)
  })

  it('datetime-local ⇄ ISO se corresponden (ida y vuelta) y tolera vacíos', () => {
    const iso = '2026-10-20T15:30:00.000Z'
    expect(localToIso(isoToLocalInput(iso))).toBe(iso)
    expect(localToIso('')).toBeUndefined()
    expect(isoToLocalInput(null)).toBe('')
    expect(isoToLocalInput(undefined)).toBe('')
  })
})
