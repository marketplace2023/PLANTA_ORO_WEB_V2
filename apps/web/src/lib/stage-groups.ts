const STAGE_GROUPS: Record<string, string> = {
  TRITURACION: 'Trituración',
  MOLIENDA: 'Molienda',
  LIXIVIACION: 'Lixiviación',
  CARBON: 'Carbón',
  ELUCION: 'Elución y fundición',
  RELAVES: 'Relaves y soluciones',
}

const humanizeGroup = (g: string) => g.charAt(0) + g.slice(1).toLowerCase().replaceAll('_', ' ')

/** Nombre legible del grupo de etapas («TRITURACION» → «Trituración»); un grupo nuevo se muestra en minúsculas con inicial mayúscula. */
export const stageGroupLabel = (group: string) => STAGE_GROUPS[group] ?? humanizeGroup(group)
