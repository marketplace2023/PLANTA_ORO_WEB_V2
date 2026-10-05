import {
  Activity,
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Hammer,
  Package,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

export const ASSET_STATUSES = [
  'OPERATIVE',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
  'CRITICAL',
  'STANDBY',
  'COMMISSIONING',
  'STOCK',
  'REPAIR',
  'DECOMMISSIONED',
] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export const ASSET_CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type AssetCriticality = (typeof ASSET_CRITICALITIES)[number]

/** Estados del activo: icono + texto + color, nunca solo color (design.md §16). */
export const STATUS_META: Record<AssetStatus, { label: string; icon: LucideIcon; color: string }> = {
  OPERATIVE: { label: 'Operativo', icon: CheckCircle2, color: 'var(--fur-green-500)' },
  MAINTENANCE: { label: 'En mantenimiento', icon: Wrench, color: 'var(--fur-orange-500)' },
  OUT_OF_SERVICE: { label: 'Fuera de servicio', icon: XCircle, color: 'var(--fur-red-500)' },
  CRITICAL: { label: 'Crítico', icon: AlertCircle, color: '#9b1c1c' },
  STANDBY: { label: 'En espera', icon: Clock, color: 'var(--fur-yellow-500)' },
  COMMISSIONING: { label: 'Comisionamiento', icon: Activity, color: 'var(--fur-cyan-500)' },
  STOCK: { label: 'En stock', icon: Package, color: 'var(--fur-blue-500)' },
  REPAIR: { label: 'En reparación', icon: Hammer, color: 'var(--fur-purple-500)' },
  DECOMMISSIONED: { label: 'Dado de baja', icon: Archive, color: 'var(--fur-steel-500)' },
}

export const CRITICALITY_META: Record<AssetCriticality, { label: string; color: string }> = {
  LOW: { label: 'Baja', color: 'var(--fur-steel-500)' },
  MEDIUM: { label: 'Media', color: 'var(--fur-blue-500)' },
  HIGH: { label: 'Alta', color: 'var(--fur-orange-500)' },
  CRITICAL: { label: 'Crítica', color: 'var(--fur-red-500)' },
}

export const statusLabel = (s: string) => STATUS_META[s as AssetStatus]?.label ?? s
export const criticalityLabel = (c: string) => CRITICALITY_META[c as AssetCriticality]?.label ?? c
