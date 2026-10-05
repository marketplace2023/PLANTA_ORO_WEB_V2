/**
 * Mapa (diagrama) de cada planta, servido desde /public. Se asocia por código de planta: es el dato estable
 * (el nombre y el slug pueden editarse). Una planta nueva sin mapa simplemente no lo muestra.
 */
const MAPS: Record<string, string> = {
  'REV-II': 'MAPA REVERMIN.png',
  'CAR-01': 'MAPA CARATAL.jpeg',
  'MSM-01': 'MAPA MINA SOSA.jpeg',
  // El diagrama de Mina Colombia se titula "Mina Colombia / MINERVEN" (red eléctrica SW-5 y Nivel 1).
  'MCO-01': 'MAPA MINERVEN.jpeg',
}

/** URL pública del mapa de una planta, o `null` si no tiene. Los nombres de archivo llevan espacios: se codifican. */
export function plantMapUrl(plantCode: string | null | undefined): string | null {
  const file = plantCode ? MAPS[plantCode] : undefined
  return file ? `/${encodeURIComponent(file)}` : null
}
