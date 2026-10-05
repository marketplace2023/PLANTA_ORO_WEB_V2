export const ITEM_TYPES = ['SPARE', 'CONSUMABLE', 'TOOL'] as const
export type ItemType = (typeof ITEM_TYPES)[number]
export const ITEM_TYPE_LABELS: Record<ItemType, string> = { SPARE: 'Repuesto', CONSUMABLE: 'Consumible', TOOL: 'Herramienta' }

export const LOCATION_TYPES = ['ZONE', 'RACK', 'SHELF', 'BIN'] as const
export type LocationType = (typeof LOCATION_TYPES)[number]
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = { ZONE: 'Zona', RACK: 'Rack', SHELF: 'Estante', BIN: 'Bin' }

export const MOVEMENT_TYPES = ['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]
export const MOVEMENT_LABELS: Record<MovementType, string> = { RECEIPT: 'Ingreso', ISSUE: 'Salida', TRANSFER: 'Transferencia', ADJUSTMENT: 'Ajuste' }

export const REFERENCE_LABELS: Record<string, string> = { MANUAL: 'Manual', WORK_ORDER: 'Orden de trabajo', REQUISITION: 'Requisición' }

export const itemTypeLabel = (t: string) => ITEM_TYPE_LABELS[t as ItemType] ?? t
export const locationTypeLabel = (t: string) => LOCATION_TYPE_LABELS[t as LocationType] ?? t
export const movementLabel = (t: string) => MOVEMENT_LABELS[t as MovementType] ?? t
