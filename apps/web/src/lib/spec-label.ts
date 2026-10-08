const WORDS: Record<string, string> = {
  power: 'Potencia',
  voltage: 'Tensión',
  diameter: 'Diámetro',
  length: 'Longitud',
  height: 'Altura',
  size: 'Tamaño',
  suction: 'Succión',
  discharge: 'Descarga',
  capacity: 'Capacidad',
  range: 'Rango',
  area: 'Área',
  opening: 'Abertura',
  decks: 'Pisos',
  poles: 'Polos',
  cubicles: 'Celdas',
  output: 'Salida',
  primary: 'Primario',
  secondary: 'Secundario',
  speed: 'Velocidad',
  flow: 'Caudal',
  pressure: 'Presión',
  weight: 'Peso',
}

const UNITS: Record<string, string> = { kw: 'kW', mw: 'MW', kva: 'kVA', mva: 'MVA', kv: 'kV', v: 'V', ft: 'ft', ft2: 'ft²', in: 'in', m: 'm', mm: 'mm', kg: 'kg', t: 't', tph: 't/h', rpm: 'rpm', hp: 'hp', bar: 'bar', psi: 'psi', hz: 'Hz' }

/** "powerKw" → "Potencia (kW)", "suctionIn" → "Succión (in)": las claves del modelo vienen en camelCase con la unidad al final. */
export function specLabel(key: string): string {
  const parts = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(' ')
  const unit = parts.length > 1 ? UNITS[parts[parts.length - 1]] : undefined
  const words = (unit ? parts.slice(0, -1) : parts).map((w) => WORDS[w] ?? w)
  const text = words.join(' ')
  const label = text.charAt(0).toUpperCase() + text.slice(1)
  return unit ? `${label} (${unit})` : label
}
