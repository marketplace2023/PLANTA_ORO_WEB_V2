/**
 * Datos ILUSTRATIVOS para desarrollo local (no son fichas técnicas reales de los fabricantes).
 * Sirven para ejercitar la UI: catálogo, filtros, estados y ficha FUR.
 */

export const MANUFACTURERS: Array<[name: string, countryCode: string]> = [
  ['Metso', 'FI'],
  ['FLSmidth', 'DK'],
  ['Weir Minerals', 'GB'],
  ['WEG', 'BR'],
  ['ABB', 'CH'],
  ['Siemens', 'DE'],
  ['Schneider Electric', 'FR'],
  ['Endress+Hauser', 'CH'],
]

// [typeCode, manufacturer | null, modelName, specifications]
export const MODELS: Array<[string, string | null, string, Record<string, unknown>]> = [
  ['CHANCADORA_MANDIBULAS', 'Metso', 'Mandíbulas 42x30 in', { openingIn: '42x30', powerKw: 160 }],
  ['CHANCADORA_CONICA', 'Metso', 'Cónica secundaria 4.25 ft', { sizeFt: 4.25, powerKw: 250 }],
  ['MOLINO_SAG', 'FLSmidth', 'SAG 28x14 ft', { diameterFt: 28, lengthFt: 14, powerKw: 5000 }],
  ['MOLINO_BOLAS', 'Metso', 'Bolas 16.5x24 ft', { diameterFt: 16.5, lengthFt: 24, powerKw: 3000 }],
  ['MOLINO_BOLAS', 'FLSmidth', 'Bolas 20x32 ft', { diameterFt: 20, lengthFt: 32, powerKw: 5600 }],
  ['ZARANDA_VIBRATORIA', 'Metso', 'Zaranda doble piso 8x20 ft', { areaFt2: 160, decks: 2 }],
  ['HIDROCICLON', 'Weir Minerals', 'Hidrociclón 26 in', { diameterIn: 26 }],
  ['BOMBA_CENTRIFUGA_PULPA', 'Weir Minerals', 'Bomba de pulpa 10x8', { dischargeIn: 8, suctionIn: 10 }],
  ['BOMBA_CENTRIFUGA_AGUA', 'WEG', 'Bomba de agua 6x4', { dischargeIn: 4, suctionIn: 6 }],
  ['ESPESADOR_ALTA_CAPACIDAD', 'FLSmidth', 'Espesador alta capacidad 30 m', { diameterM: 30 }],
  ['TANQUE_AGITADO_CIL', 'FLSmidth', 'Tanque CIL 12x12 m', { diameterM: 12, heightM: 12 }],
  ['HORNO_FUNDICION', null, 'Horno basculante 250 kg', { capacityKg: 250 }],
  ['MOTOR_ELECTRICO', 'WEG', 'Motor 4.0 MW 6 polos', { powerKw: 4000, poles: 6, voltageV: 4160 }],
  ['MOTOR_ELECTRICO', 'ABB', 'Motor 250 kW 4 polos', { powerKw: 250, poles: 4, voltageV: 460 }],
  ['VALVULA_CUCHILLA', 'Weir Minerals', 'Válvula de cuchilla 8 in', { sizeIn: 8 }],
  ['VALVULA_MARIPOSA', 'ABB', 'Válvula de mariposa 12 in', { sizeIn: 12 }],
  ['CCM', 'Schneider Electric', 'CCM 4160 V 12 celdas', { voltageV: 4160, cubicles: 12 }],
  ['TRANSFORMADOR_POTENCIA', 'Siemens', 'Transformador 10 MVA 33/4.16 kV', { powerMva: 10, primaryKv: 33, secondaryKv: 4.16 }],
  ['TRANSMISOR_NIVEL', 'Endress+Hauser', 'Transmisor de nivel por radar', { rangeM: 30, output: '4-20 mA HART' }],
  ['TRANSMISOR_FLUJO', 'Endress+Hauser', 'Transmisor de flujo electromagnético', { sizeIn: 8, output: '4-20 mA HART' }],
]

// [tag, nombre, modelo, etapa, redes, estado, criticidad, ubicación, público]
export const DEMO_ASSETS: Array<{
  tag: string
  name: string
  model: string
  stage: string | null
  networks: string[]
  status: string
  criticality: string
  location: string
  isPublic: boolean
}> = [
  { tag: 'CH-201', name: 'Chancadora primaria de mandíbulas', model: 'Mandíbulas 42x30 in', stage: 'D02', networks: ['FUR-PROC', 'FUR-MNT'], status: 'REPAIR', criticality: 'HIGH', location: 'Chancado primario', isPublic: true },
  { tag: 'CC-205', name: 'Chancadora cónica secundaria', model: 'Cónica secundaria 4.25 ft', stage: 'D03', networks: ['FUR-PROC'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Chancado secundario', isPublic: true },
  { tag: 'ZV-301', name: 'Zaranda vibratoria primaria', model: 'Zaranda doble piso 8x20 ft', stage: 'D01', networks: ['FUR-PROC'], status: 'OPERATIVE', criticality: 'MEDIUM', location: 'Chancado primario', isPublic: false },
  { tag: 'SAG-601', name: 'Molino SAG', model: 'SAG 28x14 ft', stage: 'D05', networks: ['FUR-PROC', 'FUR-IOT', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'CRITICAL', location: 'Nave de molienda', isPublic: true },
  { tag: 'MB-301', name: 'Molino de bolas', model: 'Bolas 16.5x24 ft', stage: 'D06', networks: ['FUR-PROC', 'FUR-IOT', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'CRITICAL', location: 'Nave de molienda', isPublic: true },
  { tag: 'MT-301', name: 'Motor del molino de bolas', model: 'Motor 4.0 MW 6 polos', stage: 'D06', networks: ['FUR-PTE', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'CRITICAL', location: 'Nave de molienda', isPublic: false },
  { tag: 'HC-801', name: 'Batería de hidrociclones', model: 'Hidrociclón 26 in', stage: 'D07', networks: ['FUR-PROC'], status: 'OPERATIVE', criticality: 'MEDIUM', location: 'Nave de molienda', isPublic: true },
  { tag: 'BP-501', name: 'Bomba de alimentación a ciclones', model: 'Bomba de pulpa 10x8', stage: 'D07', networks: ['FUR-PROC', 'FUR-MNT'], status: 'STANDBY', criticality: 'HIGH', location: 'Nave de molienda', isPublic: false },
  { tag: 'ESP-1001', name: 'Espesador pre-lixiviación', model: 'Espesador alta capacidad 30 m', stage: 'D09', networks: ['FUR-PROC'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Planta de lixiviación', isPublic: true },
  { tag: 'TK-1101', name: 'Tanque CIL 1', model: 'Tanque CIL 12x12 m', stage: 'D10', networks: ['FUR-PROC', 'FUR-MNT'], status: 'MAINTENANCE', criticality: 'HIGH', location: 'Planta de lixiviación', isPublic: true },
  { tag: 'LT-1101', name: 'Transmisor de nivel del tanque CIL 1', model: 'Transmisor de nivel por radar', stage: 'D10', networks: ['FUR-IOT'], status: 'OPERATIVE', criticality: 'MEDIUM', location: 'Planta de lixiviación', isPublic: false },
  { tag: 'HF-1701', name: 'Horno de fundición', model: 'Horno basculante 250 kg', stage: 'D16', networks: ['FUR-PROC', 'FUR-PTE'], status: 'COMMISSIONING', criticality: 'HIGH', location: 'Sala de fundición', isPublic: false },
  { tag: 'TX-001', name: 'Transformador principal', model: 'Transformador 10 MVA 33/4.16 kV', stage: null, networks: ['FUR-PTE'], status: 'OPERATIVE', criticality: 'CRITICAL', location: 'Subestación', isPublic: false },
  { tag: 'CCM-01', name: 'Centro de control de motores principal', model: 'CCM 4160 V 12 celdas', stage: null, networks: ['FUR-PTE'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Sala eléctrica', isPublic: false },
  { tag: 'BA-020', name: 'Bomba de agua de proceso (repuesto)', model: 'Bomba de agua 6x4', stage: null, networks: [], status: 'STOCK', criticality: 'LOW', location: 'Almacén central', isPublic: false },
]

/** PDF mínimo pero válido (1 página, Helvetica) para que la vista previa funcione con archivos reales. */
export function makePdf(lines: string[]): Buffer {
  const ascii = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?')
  const esc = (s: string) => ascii(s).replace(/[\()]/g, (c) => `\${c}`)
  const text = lines.map((l, i) => `${i === 0 ? '' : '0 -28 Td '}(${esc(l)}) Tj`).join(' ')
  const stream = `BT /F1 20 Tf 72 740 Td ${text} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body))
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body)
}

// [título, tipo, visibilidad, tag de activo | null, etapa | null, líneas del PDF]
export const DEMO_DOCS: Array<{ title: string; type: string; visibility: 'PUBLIC' | 'INTERNAL'; assetTag: string | null; stage: string | null; fileName: string; lines: string[] }> = [
  { title: 'Manual de operación del molino de bolas', type: 'MANUAL', visibility: 'PUBLIC', assetTag: 'MB-301', stage: 'D06', fileName: 'Manual MB-301.pdf', lines: ['Manual de operacion', 'Molino de bolas MB-301', 'Documento de demostracion'] },
  { title: 'SOP de arranque y parada de molienda', type: 'SOP', visibility: 'INTERNAL', assetTag: 'SAG-601', stage: 'D05', fileName: 'SOP arranque molienda.pdf', lines: ['SOP - Arranque y parada', 'Circuito de molienda', 'Uso interno'] },
  { title: 'Plano unifilar de la subestación', type: 'PLANO', visibility: 'INTERNAL', assetTag: 'TX-001', stage: null, fileName: 'Unifilar subestacion.pdf', lines: ['Plano unifilar', 'Subestacion principal', 'Transformador TX-001'] },
  { title: 'Certificado de calibración LT-1101', type: 'CERTIFICADO', visibility: 'PUBLIC', assetTag: 'LT-1101', stage: 'D10', fileName: 'Calibracion LT-1101.pdf', lines: ['Certificado de calibracion', 'Transmisor de nivel LT-1101', 'Vigente'] },
  { title: 'Procedimiento de lixiviación y adsorción CIL', type: 'PROCEDIMIENTO', visibility: 'INTERNAL', assetTag: null, stage: 'D10', fileName: 'Procedimiento CIL.pdf', lines: ['Procedimiento CIL', 'Lixiviacion y adsorcion', 'Uso interno'] },
]

const DAY = 86_400_000
const HOUR = 3_600_000

/** Datos de mantenimiento ILUSTRATIVOS. Las fechas son relativas a "ahora" para que el tablero siempre tenga sentido. */
export const DEMO_PLANS: Array<{ name: string; assetTag: string; planType: 'PREVENTIVE' | 'PREDICTIVE' | 'CONDITION'; priority: string; every: number; unit: 'DAYS' | 'WEEKS' | 'MONTHS'; dueInDays: number }> = [
  { name: 'Lubricación mensual de rodamientos', assetTag: 'MB-301', planType: 'PREVENTIVE', priority: 'MEDIUM', every: 1, unit: 'MONTHS', dueInDays: 5 },
  { name: 'Inspección de revestimientos', assetTag: 'SAG-601', planType: 'CONDITION', priority: 'HIGH', every: 3, unit: 'MONTHS', dueInDays: 20 },
  { name: 'Revisión de sellos', assetTag: 'BP-501', planType: 'PREVENTIVE', priority: 'MEDIUM', every: 2, unit: 'WEEKS', dueInDays: -3 }, // vencido
  { name: 'Análisis de vibraciones', assetTag: 'MT-301', planType: 'PREDICTIVE', priority: 'HIGH', every: 1, unit: 'MONTHS', dueInDays: 12 },
]

export type DemoWorkOrder = {
  title: string
  description: string
  assetTag: string
  type: 'CORRECTIVE' | 'PREVENTIVE' | 'PREDICTIVE' | 'INSPECTION'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: 'REQUESTED' | 'PLANNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CLOSED'
  assigned: boolean
  /** Fecha límite en días desde ahora (negativo = ya venció). */
  dueInDays: number | null
  /** Horas de ejecución real (solo COMPLETED/CLOSED), hace `endedDaysAgo` días. */
  workedHours?: number
  endedDaysAgo?: number
  notes?: string
}

export const DEMO_WORK_ORDERS: DemoWorkOrder[] = [
  { title: 'Ruido anormal en el reductor', description: 'Se escucha un golpeteo periódico en el lado motor.', assetTag: 'MB-301', type: 'CORRECTIVE', priority: 'HIGH', status: 'REQUESTED', assigned: false, dueInDays: 7 },
  { title: 'Cambio de aceite del reductor SAG', description: 'Cambio programado de lubricante ISO 320.', assetTag: 'SAG-601', type: 'PREVENTIVE', priority: 'MEDIUM', status: 'PLANNED', assigned: false, dueInDays: 3 },
  { title: 'Alineación de la bomba de ciclones', description: 'Vibración alta tras el último cambio de impulsor.', assetTag: 'BP-501', type: 'CORRECTIVE', priority: 'URGENT', status: 'ASSIGNED', assigned: true, dueInDays: 2 },
  { title: 'Reparación de mandíbula de la chancadora', description: 'Desgaste excesivo en la placa fija.', assetTag: 'CH-201', type: 'CORRECTIVE', priority: 'URGENT', status: 'IN_PROGRESS', assigned: true, dueInDays: -1 }, // atrasada
  { title: 'Cambio de rodamiento del agitador CIL 1', description: 'A la espera del repuesto importado.', assetTag: 'TK-1101', type: 'CORRECTIVE', priority: 'HIGH', status: 'ON_HOLD', assigned: true, dueInDays: -4 }, // atrasada
  { title: 'Inspección termográfica de CCM', description: 'Detección de puntos calientes.', assetTag: 'CCM-01', type: 'PREDICTIVE', priority: 'MEDIUM', status: 'IN_PROGRESS', assigned: true, dueInDays: null },
  { title: 'Reemplazo de manguera del hidrociclón', description: 'Fuga menor en la unión.', assetTag: 'HC-801', type: 'CORRECTIVE', priority: 'MEDIUM', status: 'COMPLETED', assigned: true, dueInDays: -6, workedHours: 4, endedDaysAgo: 5, notes: 'Se reemplazó la manguera y se ajustaron abrazaderas.' },
  { title: 'Ajuste de tensión de la correa', description: 'Deslizamiento en arranque.', assetTag: 'ZV-301', type: 'CORRECTIVE', priority: 'LOW', status: 'CLOSED', assigned: true, dueInDays: -12, workedHours: 2, endedDaysAgo: 11, notes: 'Tensión ajustada según especificación.' },
  { title: 'Lubricación mensual de rodamientos (agosto)', description: 'Plan preventivo mensual.', assetTag: 'MB-301', type: 'PREVENTIVE', priority: 'MEDIUM', status: 'CLOSED', assigned: true, dueInDays: -30, workedHours: 1, endedDaysAgo: 31, notes: 'Completado a tiempo.' },
]

/** Inventario de demostración (ilustrativo). Los saldos iniciales entran como ingresos para que el libro cuadre. */
export const DEMO_WAREHOUSE = { code: 'ALM-CEN', name: 'Almacén central' }
export const DEMO_LOCATIONS: Array<{ code: string; name: string; type: 'ZONE' | 'RACK' | 'SHELF' | 'BIN' }> = [
  { code: 'R-A1', name: 'Rack A1 · Rodamientos y sellos', type: 'RACK' },
  { code: 'R-B1', name: 'Rack B1 · Mecánicos', type: 'RACK' },
  { code: 'E-01', name: 'Estante 1 · Consumibles', type: 'SHELF' },
]
export const DEMO_ITEMS: Array<{
  sku: string
  name: string
  itemType: 'SPARE' | 'CONSUMABLE' | 'TOOL'
  uom: string
  minStock: number
  maxStock: number | null
  isCritical: boolean
  unitCost: number | null
  location: string
  onHand: number
}> = [
  { sku: 'ROD-22218', name: 'Rodamiento esférico 22218 E', itemType: 'SPARE', uom: 'UND', minStock: 4, maxStock: 12, isCritical: true, unitCost: 185.5, location: 'R-A1', onHand: 6 },
  { sku: 'ROD-6310', name: 'Rodamiento rígido 6310-2RS', itemType: 'SPARE', uom: 'UND', minStock: 6, maxStock: 20, isCritical: false, unitCost: 42.9, location: 'R-A1', onHand: 14 },
  { sku: 'SELLO-MEC-60', name: 'Sello mecánico 60 mm para bomba de pulpa', itemType: 'SPARE', uom: 'UND', minStock: 3, maxStock: 8, isCritical: true, unitCost: 640, location: 'R-A1', onHand: 1 }, // crítico bajo mínimo
  { sku: 'MANG-HC-10', name: 'Manguera de hidrociclón 10"', itemType: 'SPARE', uom: 'M', minStock: 10, maxStock: 40, isCritical: false, unitCost: 58.25, location: 'R-B1', onHand: 22 },
  { sku: 'CORREA-B85', name: 'Correa en V B85', itemType: 'SPARE', uom: 'UND', minStock: 4, maxStock: 10, isCritical: false, unitCost: 21.4, location: 'R-B1', onHand: 3 }, // bajo mínimo
  { sku: 'REV-SAG-PL', name: 'Placa de revestimiento SAG', itemType: 'SPARE', uom: 'UND', minStock: 8, maxStock: 24, isCritical: true, unitCost: 1280, location: 'R-B1', onHand: 16 },
  { sku: 'ACE-ISO320', name: 'Aceite lubricante ISO VG 320', itemType: 'CONSUMABLE', uom: 'L', minStock: 200, maxStock: 800, isCritical: false, unitCost: 4.8, location: 'E-01', onHand: 520 },
  { sku: 'GRASA-EP2', name: 'Grasa EP-2 (cartucho 400 g)', itemType: 'CONSUMABLE', uom: 'UND', minStock: 24, maxStock: 96, isCritical: false, unitCost: null, location: 'E-01', onHand: 48 }, // sin costo cargado
  { sku: 'HERR-TORQ-1', name: 'Llave de torque 200-1000 Nm', itemType: 'TOOL', uom: 'UND', minStock: 1, maxStock: null, isCritical: false, unitCost: 410, location: 'E-01', onHand: 2 },
]

/** Repuestos consumidos por órdenes de demostración (por título de OT). */
export const DEMO_WO_PARTS: Array<{ workOrderTitle: string; sku: string; quantity: number }> = [
  { workOrderTitle: 'Reemplazo de manguera del hidrociclón', sku: 'MANG-HC-10', quantity: 3 },
  { workOrderTitle: 'Ajuste de tensión de la correa', sku: 'CORREA-B85', quantity: 2 },
  { workOrderTitle: 'Lubricación mensual de rodamientos (agosto)', sku: 'GRASA-EP2', quantity: 6 },
  { workOrderTitle: 'Reparación de mandíbula de la chancadora', sku: 'ROD-6310', quantity: 2 },
]

/** Organizaciones externas de demostración (ilustrativas; no son empresas reales). */
export const DEMO_PROVIDERS: Array<{
  name: string
  taxId: string
  country: string
  city: string
  description: string
  certifications: string[]
  verified: boolean
  rating: number | null
  stages: string[]
  families: string[]
  owner: string | null
  listings: Array<{ title: string; description: string; family: string; type?: string; model?: string; price: number | null; currency: string; availability: 'IN_STOCK' | 'ON_REQUEST' | 'OUT_OF_STOCK'; stockText?: string; stages: string[]; featured?: boolean; status?: 'ACTIVE' | 'DRAFT' }>
}> = [
  {
    name: 'Repuestos Andinos S.A.C.',
    taxId: 'DEMO-20100000001',
    country: 'PE',
    city: 'Lima',
    description: 'Distribuidor de repuestos de molienda y bombeo de pulpa para plantas de beneficio.',
    certifications: ['ISO 9001'],
    verified: true,
    rating: 4.7,
    stages: ['D05', 'D06', 'D07'],
    families: ['MOLINOS', 'BOMBAS'],
    owner: 'proveedor@fur.local',
    listings: [
      { title: 'Placa de revestimiento para molino SAG', description: 'Aleación Cr-Mo, juego de 12 placas.', family: 'MOLINOS', type: 'MOLINO_SAG', price: 15360, currency: 'USD', availability: 'IN_STOCK', stockText: '3 juegos', stages: ['D05'], featured: true },
      { title: 'Sello mecánico 60 mm para bomba de pulpa', description: 'Cartucho de carburo de silicio, doble cara.', family: 'BOMBAS', type: 'BOMBA_CENTRIFUGA_PULPA', price: 640, currency: 'USD', availability: 'IN_STOCK', stockText: '14 unidades', stages: ['D07', 'D10'] },
      { title: 'Bolas de molienda forjadas 3"', description: 'Acero forjado, dureza 62 HRC. Venta por tonelada.', family: 'MOLINOS', price: 1150, currency: 'USD', availability: 'ON_REQUEST', stages: ['D06'] },
      { title: 'Rotor para bomba de pulpa 10x8', description: 'Pedido bajo especificación; plazo de fabricación 6 semanas.', family: 'BOMBAS', price: null, currency: 'USD', availability: 'ON_REQUEST', stages: ['D07'] },
      { title: 'Kit de reparación de chancadora (borrador)', description: 'Aún sin publicar.', family: 'TRITURADORAS', price: 4200, currency: 'USD', availability: 'ON_REQUEST', stages: ['D03'], status: 'DRAFT' },
    ],
  },
  {
    name: 'Instrumentación del Pacífico',
    taxId: 'DEMO-76000000002',
    country: 'CL',
    city: 'Santiago',
    description: 'Instrumentos de medición y válvulas para procesos de lixiviación y espesamiento.',
    certifications: ['ISO 9001', 'ISO 14001'],
    verified: true,
    rating: 4.2,
    stages: ['D10', 'D12'],
    families: ['INSTRUMENTOS', 'VALVULAS'],
    owner: null,
    listings: [
      { title: 'Transmisor de nivel por radar 80 GHz', description: 'Rango 30 m, salida 4-20 mA HART.', family: 'INSTRUMENTOS', type: 'TRANSMISOR_NIVEL', price: 2890, currency: 'USD', availability: 'IN_STOCK', stockText: '6 unidades', stages: ['D10'] },
      { title: 'Válvula de cuchilla 8 in', description: 'Cuerpo en acero inoxidable, accionamiento neumático.', family: 'VALVULAS', type: 'VALVULA_CUCHILLA', price: 1720.5, currency: 'USD', availability: 'ON_REQUEST', stages: ['D10', 'D12'] },
    ],
  },
  {
    name: 'Motores y Potencia Industrial',
    taxId: 'DEMO-30700000003',
    country: 'AR',
    city: 'Córdoba',
    description: 'Motores eléctricos de media tensión, reparación y repuestos.',
    certifications: [],
    verified: false,
    rating: null,
    stages: ['D05'],
    families: ['MOTORES'],
    owner: null,
    listings: [{ title: 'Motor 250 kW 4 polos 460 V', description: 'Nuevo, con certificado de fábrica.', family: 'MOTORES', type: 'MOTOR_ELECTRICO', price: 18900, currency: 'USD', availability: 'OUT_OF_STOCK', stages: ['D05'] }],
  },
]

export const DEMO_CONTRACTORS: Array<{
  name: string
  taxId: string
  country: string
  city: string
  description: string
  certifications: string[]
  availability: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE'
  verified: boolean
  rating: number | null
  owner: string | null
  services: Array<{ name: string; description: string; type: string; stages: string[] }>
}> = [
  {
    name: 'Mecánica Industrial Minera',
    taxId: 'DEMO-20500000011',
    country: 'PE',
    city: 'Arequipa',
    description: 'Mantenimiento mecánico en planta: alineación, balanceo y cambio de revestimientos.',
    certifications: ['OSHA 30', 'ISO 45001'],
    availability: 'AVAILABLE',
    verified: true,
    rating: 4.6,
    owner: 'contratista@fur.local',
    services: [
      { name: 'Alineación láser de equipos rotativos', description: 'Alineación de motor-reductor-molino con equipo láser.', type: 'MECANICA', stages: ['D05', 'D06', 'D07'] },
      { name: 'Cambio de revestimientos de molino', description: 'Desmontaje y montaje de placas, con grúa y personal certificado.', type: 'MECANICA', stages: ['D05', 'D06'] },
    ],
  },
  {
    name: 'Automatización y Control Andino',
    taxId: 'DEMO-20500000012',
    country: 'PE',
    city: 'Lima',
    description: 'Ingeniería de instrumentación, calibración y automatización de circuitos de proceso.',
    certifications: ['ISA CCST'],
    availability: 'LIMITED',
    verified: true,
    rating: 4.0,
    owner: null,
    services: [
      { name: 'Calibración de instrumentos de campo', description: 'Transmisores de nivel, flujo y presión con certificado trazable.', type: 'INSTRUMENTACION', stages: ['D10', 'D12'] },
      { name: 'Programación y puesta en marcha de PLC', description: 'Lazos de control del circuito de molienda y CIL.', type: 'AUTOMATIZACION', stages: ['D05', 'D10'] },
    ],
  },
]

/** Requisiciones de demostración (ilustrativas), en los distintos estados del flujo. */
export const DEMO_REQUISITIONS: Array<{
  justification: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RFQ' | 'ORDERED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  requestedBy: 'lead' | 'manager'
  neededInDays: number
  assetTag?: string
  note?: string
  quote?: { total: number; days: number }
  lines: Array<{ sku?: string; description: string; quantity: number; uom: string; price?: number }>
}> = [
  { justification: 'Reposición de sellos mecánicos críticos bajo mínimo', status: 'DRAFT', priority: 'HIGH', requestedBy: 'lead', neededInDays: 14, assetTag: 'BP-501', lines: [{ sku: 'SELLO-MEC-60', description: 'Sello mecánico 60 mm para bomba de pulpa', quantity: 4, uom: 'UND', price: 640 }] },
  { justification: 'Correas de repuesto para la zaranda (stock bajo mínimo)', status: 'SUBMITTED', priority: 'MEDIUM', requestedBy: 'lead', neededInDays: 21, lines: [{ sku: 'CORREA-B85', description: 'Correa en V B85', quantity: 6, uom: 'UND', price: 21.4 }] },
  { justification: 'Servicio de reparación de mandíbula de la chancadora', status: 'REJECTED', priority: 'URGENT', requestedBy: 'lead', neededInDays: 7, assetTag: 'CH-201', note: 'Se resolverá con el contrato marco vigente', lines: [{ description: 'Reparación de placa fija (servicio)', quantity: 1, uom: 'UND', price: 8500 }] },
  { justification: 'Juego de placas de revestimiento para el molino SAG', status: 'APPROVED', priority: 'HIGH', requestedBy: 'manager', neededInDays: 30, assetTag: 'SAG-601', lines: [{ sku: 'REV-SAG-PL', description: 'Placa de revestimiento SAG', quantity: 12, uom: 'UND', price: 1280 }] },
  { justification: 'Rodamientos esféricos 22218 para molino de bolas', status: 'RFQ', priority: 'HIGH', requestedBy: 'lead', neededInDays: 18, assetTag: 'MB-301', quote: { total: 1980, days: 12 }, lines: [{ sku: 'ROD-22218', description: 'Rodamiento esférico 22218 E', quantity: 10, uom: 'UND', price: 190 }] },
  { justification: 'Mangueras de hidrociclón para recambio trimestral', status: 'ORDERED', priority: 'MEDIUM', requestedBy: 'lead', neededInDays: 10, assetTag: 'HC-801', quote: { total: 1190, days: 8 }, lines: [{ sku: 'MANG-HC-10', description: 'Manguera de hidrociclón 10 in', quantity: 20, uom: 'M', price: 58.25 }] },
]

/** Cursos de demostración (ilustrativos). `owner`: ecosistema o el nombre de un proveedor/contratista del seed. */
export const DEMO_COURSES: Array<{
  title: string
  description: string
  level: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED'
  certificate: boolean
  instructor: string
  owner: { type: 'ECOSYSTEM' } | { type: 'PROVIDER' | 'CONTRACTOR'; name: string }
  stages: string[]
  status: 'DRAFT' | 'PUBLISHED'
  lessons: Array<{ title: string; content: string; minutes: number; videoUrl?: string }>
}> = [
  {
    title: 'Seguridad operativa en molienda',
    description: 'Bloqueo y etiquetado, riesgos mecánicos y trabajo en espacios confinados en el circuito de molienda.',
    level: 'BASIC',
    certificate: true,
    instructor: 'Ing. Rosa Quispe',
    owner: { type: 'ECOSYSTEM' },
    stages: ['D05', 'D06', 'D07'],
    status: 'PUBLISHED',
    lessons: [
      { title: 'Riesgos del circuito de molienda', content: 'Identificación de energías peligrosas: mecánica, eléctrica, hidráulica y cargas suspendidas.', minutes: 20 },
      { title: 'Bloqueo y etiquetado (LOTO)', content: 'Pasos del procedimiento: aviso, apagado, aislamiento, bloqueo, disipación y verificación de energía cero.', minutes: 30 },
      { title: 'Ingreso a molinos y espacios confinados', content: 'Permiso de trabajo, medición de atmósfera, vigía y plan de rescate.', minutes: 25 },
    ],
  },
  {
    title: 'Fundamentos de lixiviación y adsorción CIL',
    description: 'Química del cianuro, control de pH y oxígeno disuelto, y operación del circuito de carbón en pulpa.',
    level: 'INTERMEDIATE',
    certificate: true,
    instructor: 'M.Sc. Daniel Ríos',
    owner: { type: 'ECOSYSTEM' },
    stages: ['D08', 'D09', 'D10', 'D12'],
    status: 'PUBLISHED',
    lessons: [
      { title: 'Química de la disolución del oro', content: 'Reacción con cianuro, rol del oxígeno y factores que limitan la cinética.', minutes: 35 },
      { title: 'Control de pH, cianuro libre y oxígeno', content: 'Rangos operativos, puntos de muestreo y respuesta ante desviaciones.', minutes: 40 },
      { title: 'Adsorción en carbón y cargas', content: 'Isotermas de carga, transferencia de carbón entre tanques y pérdidas de finos.', minutes: 45 },
    ],
  },
  {
    title: 'Mantenimiento predictivo de equipos rotativos',
    description: 'Análisis de vibraciones y termografía aplicados a reductores, motores y bombas de pulpa.',
    level: 'ADVANCED',
    certificate: false,
    instructor: 'Equipo técnico de Repuestos Andinos',
    owner: { type: 'PROVIDER', name: 'Repuestos Andinos S.A.C.' },
    stages: ['D05', 'D07'],
    status: 'PUBLISHED',
    lessons: [
      { title: 'Espectros de vibración', content: 'Lectura de espectros, armónicos y fallas típicas de rodamientos y desalineación.', minutes: 50, videoUrl: 'https://example.com/video/vibraciones' },
      { title: 'Termografía en tableros y motores', content: 'Criterios de severidad por diferencia de temperatura y registro de hallazgos.', minutes: 40 },
    ],
  },
  {
    title: 'Alineación láser en campo',
    description: 'Preparación, medición y corrección de alineación motor–reductor con equipo láser.',
    level: 'INTERMEDIATE',
    certificate: true,
    instructor: 'Téc. Mario Cáceres',
    owner: { type: 'CONTRACTOR', name: 'Mecánica Industrial Minera' },
    stages: ['D05', 'D06'],
    status: 'PUBLISHED',
    lessons: [
      { title: 'Pie cojo y tolerancias', content: 'Detección y corrección de pie cojo; tolerancias por velocidad de giro.', minutes: 30 },
      { title: 'Medición y corrección', content: 'Procedimiento de medición, compensación térmica y verificación final.', minutes: 45 },
    ],
  },
  {
    title: 'Operación de la fundición y producto doré (borrador)',
    description: 'Curso en preparación.',
    level: 'ADVANCED',
    certificate: false,
    instructor: 'Por definir',
    owner: { type: 'ECOSYSTEM' },
    stages: ['D16'],
    status: 'DRAFT',
    lessons: [{ title: 'Introducción', content: 'Contenido en elaboración.', minutes: 10 }],
  },
]

export { DAY, HOUR }
