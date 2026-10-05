/** FUR-<código de planta>-<secuencia de 5 dígitos>, p. ej. FUR-REV-II-00042. */
export function buildFurCode(plantCode: string, seq: number): string {
  const code = plantCode.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'PLANTA'
  return `FUR-${code}-${String(seq).padStart(5, '0')}`
}
