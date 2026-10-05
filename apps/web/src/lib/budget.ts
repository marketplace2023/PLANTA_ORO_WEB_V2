export const RESOURCE_TYPES = ['MATERIAL', 'LABOR', 'EQUIPMENT', 'TRANSPORT'] as const
export type ResourceType = (typeof RESOURCE_TYPES)[number]
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = { MATERIAL: 'Material', LABOR: 'Mano de obra', EQUIPMENT: 'Equipo', TRANSPORT: 'Transporte' }

export const BUDGET_STATUS_LABELS: Record<string, string> = { DRAFT: 'Borrador', APPROVED: 'Aprobado', CLOSED: 'Cerrado' }
export const VALUATION_STATUS_LABELS: Record<string, string> = { DRAFT: 'Borrador', APPROVED: 'Aprobada' }

export const resourceTypeLabel = (t: string) => RESOURCE_TYPE_LABELS[t as ResourceType] ?? t

/** Mano de obra y equipo se calculan por cuadrilla y rendimiento; material y transporte, por cantidad y desperdicio. */
export const isCrewBased = (t: string) => t === 'LABOR' || t === 'EQUIPMENT'
