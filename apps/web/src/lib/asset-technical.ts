export type SpecificationRow = { key: string; value: unknown }
export type AssetTechnicalDraft = { specifications: SpecificationRow[]; components: string[] }

export function technicalDraft(specifications: Record<string, unknown> = {}, technicalData: Record<string, unknown> = {}): AssetTechnicalDraft {
  return {
    specifications: Object.entries(specifications).map(([key, value]) => ({ key, value })),
    components: Array.isArray(technicalData.componentes) ? technicalData.componentes.filter((value): value is string => typeof value === 'string') : [],
  }
}

export function technicalPayload(draft: AssetTechnicalDraft) {
  const rows = draft.specifications.filter(row => row.key.trim() || row.value !== '')
  if (rows.some(row => !row.key.trim())) throw new Error('Indica el nombre de cada especificación.')
  const names = rows.map(row => row.key.trim())
  if (new Set(names.map(name => name.toLocaleLowerCase())).size !== names.length) throw new Error('Hay nombres de especificación repetidos.')
  return {
    specifications: Object.fromEntries(rows.map(row => [row.key.trim(), row.value])),
    components: draft.components.map(value => value.trim()).filter(Boolean),
  }
}
