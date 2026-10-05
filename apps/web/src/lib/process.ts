export const STAGE_GROUP_LABELS: Record<string, string> = {
  TRITURACION: 'Trituración',
  MOLIENDA: 'Molienda y clasificación',
  LIXIVIACION: 'Lixiviación',
  CARBON: 'Carbón',
  ELUCION: 'Elución y fundición',
  RELAVES: 'Relaves',
}

export const STAGE_COLORS: Record<string, string> = {
  orange: 'var(--fur-orange-500)',
  blue: 'var(--fur-blue-500)',
  green: 'var(--fur-green-500)',
  purple: 'var(--fur-purple-500)',
  yellow: 'var(--fur-yellow-500)',
  cyan: 'var(--fur-cyan-500)',
}

export const FLOW_TYPES = ['MATERIAL', 'SOLUTION', 'WATER', 'REAGENT'] as const
export const FLOW_LABELS: Record<string, string> = { MATERIAL: 'Material', SOLUTION: 'Solución', WATER: 'Agua', REAGENT: 'Reactivo' }

export const stageGroupLabel = (g: string) => STAGE_GROUP_LABELS[g] ?? g
export const flowLabel = (f: string) => FLOW_LABELS[f] ?? f

/** Color de una red transversal (los tokens vienen como `network-iot` y existen como variables CSS). */
export const networkColor = (token: string | null) => (token ? `var(--${token})` : 'var(--fur-navy-800)')
