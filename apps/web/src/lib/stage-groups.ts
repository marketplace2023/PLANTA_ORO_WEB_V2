const STAGE_GROUPS: Record<string, string> = {
  TRITURACION: 'Trituración',
  MOLIENDA: 'Molienda',
  LIXIVIACION: 'Lixiviación',
  CARBON: 'Carbón',
  ELUCION: 'Elución y fundición',
  RELAVES: 'Relaves y soluciones',
}

/** Nombre legible del grupo de etapas («TRITURACION» → «Trituración»). */
export const stageGroupLabel = (group: string) => STAGE_GROUPS[group] ?? group
