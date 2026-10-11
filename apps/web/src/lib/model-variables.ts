import type { ModelVariable } from '@/features/assets/use-assets'
import { formatVariableValue } from '@/lib/variable-value'

/** «FUR-PROC» → «PROC»: el sufijo con el que se arman los códigos de registro por red. */
export const networkSuffix = (code: string) => code.replace(/^FUR-/, '')

/** «D04» → «04». */
const stageNum = (code: string) => code.replace(/^D/i, '')

/** Texto corto del alcance para el título de la sección: «(Etapa 01)», «(Etapas 01, 02)», «(Red PTE)»… */
export function scopeSuffix(def: ModelVariable): string {
  const stages = def.stageCodes.map(stageNum)
  if (stages.length > 0 && stages.length <= 3) return ` (${stages.length === 1 ? 'Etapa' : 'Etapas'} ${stages.join(', ')})`
  const networks = def.networkCodes.map(networkSuffix)
  if (stages.length === 0 && networks.length > 0 && networks.length <= 3) return ` (${networks.length === 1 ? 'Red' : 'Redes'} ${networks.join(', ')})`
  return ''
}

export type VariableItem = { def: ModelVariable; text: string | null; general: boolean }
export type VariableSection = { title: string; items: VariableItem[] }

/**
 * Agrupa por sección (el título lleva la etapa o la red). Cada variable se muestra con el valor propio del modelo, con el
 * valor general de la variable (`general: true`) o sin texto, que la pantalla muestra como «Sin registrar».
 */
function toSections(defs: ModelVariable[]): VariableSection[] {
  const sections = new Map<string, VariableSection>()
  for (const def of defs) {
    const own = def.value === null ? null : formatVariableValue(def.valueType, def.value, def.unit)
    const general = own === null && def.defaultValue !== null && def.defaultValue !== undefined ? formatVariableValue(def.valueType, def.defaultValue, def.unit) : null
    const title = `${def.group ?? 'Datos del fabricante'}${scopeSuffix(def)}`
    const section = sections.get(title) ?? { title, items: [] }
    section.items.push({ def, text: own ?? general, general: own === null && general !== null })
    sections.set(title, section)
  }
  return [...sections.values()]
}

const stageOk = (def: ModelVariable, stageCode: string | null | undefined) => def.stageCodes.length === 0 || (!!stageCode && def.stageCodes.includes(stageCode))

/**
 * Variables que corresponden a un activo: las de su etapa y las de las redes a las que pertenece (o solo la red elegida);
 * una variable sin etapas o sin redes aplica a todas.
 */
export function variableSections(defs: ModelVariable[], asset: { stage: { code: string } | null; networks: Array<{ code: string }> }, networkCode?: string): VariableSection[] {
  const shown = defs.filter((d) => {
    const networkOk = d.networkCodes.length === 0 || (networkCode ? d.networkCodes.includes(networkCode) : d.networkCodes.some((c) => asset.networks.some((n) => n.code === c)))
    return stageOk(d, asset.stage?.code) && networkOk
  })
  return toSections(shown)
}

/** Variables que la red nombra de forma explícita y que aplican a la etapa del activo (pestaña de esa red). */
export function networkVariableSections(defs: ModelVariable[], stageCode: string | null | undefined, networkCode: string): VariableSection[] {
  return toSections(defs.filter((d) => d.networkCodes.includes(networkCode) && stageOk(d, stageCode)))
}

/** Variables generales: no pertenecen a una red concreta (aplican a todas) y sí a la etapa del activo. */
export function generalVariableSections(defs: ModelVariable[], stageCode: string | null | undefined): VariableSection[] {
  return toSections(defs.filter((d) => d.networkCodes.length === 0 && stageOk(d, stageCode)))
}
