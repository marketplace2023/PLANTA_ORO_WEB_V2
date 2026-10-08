import type { AssetDetail, AssetFur, AssetItem } from '@/features/assets/use-assets'

export const PLANT = {
  id: 'p1',
  code: 'REV-II',
  name: 'REVEMIN II',
  slug: 'revemin-ii',
  description: 'Planta de beneficio',
  countryCode: 'PE',
  timezone: 'America/Lima',
  status: 'ACTIVE',
  visibility: 'PUBLIC',
  logoUrl: null,
  heroImageUrl: null,
  settings: null,
}

export const plantDetail = (roles: string[] = [], permissions: string[] = []) => ({ ...PLANT, access: { roles, permissions } })

export const STAGES = [
  { id: 's6', code: 'D06', name: 'Molienda Primaria', displayName: 'Molienda Primaria', stageGroup: 'MOLIENDA', colorToken: 'blue', sequence: 6, isEnabled: true, isPublic: true },
  { id: 's7', code: 'D07', name: 'Molienda Secundaria', displayName: 'Molienda Secundaria', stageGroup: 'MOLIENDA', colorToken: 'blue', sequence: 7, isEnabled: true, isPublic: true },
  { id: 's11', code: 'D11', name: 'Lixiviación', displayName: 'Lixiviación', stageGroup: 'LIXIVIACION', colorToken: 'green', sequence: 11, isEnabled: false, isPublic: false },
]

export const NETWORKS = [
  { id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', colorToken: 'network-iot', isEnabled: true, isPublic: true },
  { id: 'n2', code: 'FUR-PTE', name: 'Potencia Eléctrica', colorToken: 'network-pte', isEnabled: true, isPublic: false },
  { id: 'n3', code: 'FUR-MNT', name: 'Mantenimiento', colorToken: 'network-mnt', isEnabled: false, isPublic: false },
]

export const FAMILIES = [
  { id: 'f1', code: 'MOLINOS', name: 'Molinos', icon: 'cog' },
  { id: 'f2', code: 'MOTORES', name: 'Motores', icon: 'zap' },
]

export const MODELS = [
  {
    id: 'm1',
    modelName: 'Bolas 16.5x24 ft',
    status: 'ACTIVE',
    specifications: { diameterFt: 16.5, powerKw: 3000 },
    technicalData: {},
    type: { id: 't1', code: 'MOLINO_BOLAS', name: 'Molino de bolas', stageCodes: ['D06', 'D07'], networkCodes: ['FUR-PTE'] },
    family: { id: 'f1', code: 'MOLINOS', name: 'Molinos', icon: 'cog' },
    manufacturer: { id: 'mf1', name: 'Metso', countryCode: 'FI' },
  },
  {
    id: 'm2',
    modelName: 'Motor 4.0 MW 6 polos',
    status: 'ACTIVE',
    specifications: { powerKw: 4000 },
    technicalData: {},
    type: { id: 't2', code: 'MOTOR_ELECTRICO', name: 'Motor eléctrico', stageCodes: [], networkCodes: [] },
    family: { id: 'f2', code: 'MOTORES', name: 'Motores', icon: 'zap' },
    manufacturer: null,
  },
]

export const asset = (over: Partial<AssetItem> = {}): AssetItem => ({
  id: 'a1',
  furCode: 'FUR-REV-II-00001',
  tag: 'MB-301',
  name: 'Molino de bolas 1',
  status: 'OPERATIVE',
  criticality: 'CRITICAL',
  location: 'Nave de molienda',
  isPublic: true,
  updatedAt: '2026-10-01T18:00:00.000Z',
  mapPosition: null,
  stage: { code: 'D06', name: 'Molienda Primaria', group: 'MOLIENDA' },
  model: { id: 'm1', name: 'Bolas 16.5x24 ft', imageUrl: null },
  type: { code: 'MOLINO_BOLAS', name: 'Molino de bolas' },
  family: { code: 'MOLINOS', name: 'Molinos' },
  manufacturer: 'Metso',
  networks: [{ code: 'FUR-IOT', name: 'IoT / Instrumentación', colorToken: 'network-iot' }],
  ...over,
})

export const page = <T>(items: T[], total = items.length, pageNo = 1, pageSize = 25) => ({ items, total, page: pageNo, pageSize })

export const detail = (over: Partial<AssetDetail> = {}): AssetDetail => ({
  ...asset(),
  specifications: { diameterFt: 16.5, powerKw: 3000 },
  installationDate: '2022-03-15',
  commissionDate: null,
  createdAt: '2026-10-01T18:00:00.000Z',
  serialNumber: 'SN-0001',
  parentAssetId: null,
  metadata: {},
  technicalData: { weightT: 400 },
  ...over,
})

export const fur = (over: Partial<AssetFur> = {}, assetOver: Partial<AssetDetail> = {}): AssetFur => {
  const a = detail(assetOver)
  return {
    asset: a,
    plant: { id: 'p1', name: 'REVEMIN II', slug: 'revemin-ii', code: 'REV-II' },
    stage: a.stage,
    networks: a.networks,
    documents: [],
    maintenance: {},
    inventory: {},
    telemetry: {},
    kpis: [],
    history: [
      { id: 'h2', oldStatus: 'OPERATIVE', newStatus: 'MAINTENANCE', reason: 'Cambio de rodamientos', changedAt: '2026-10-02T15:30:00.000Z', changedBy: 'Gabriel Gerente' },
      { id: 'h1', oldStatus: null, newStatus: 'OPERATIVE', reason: 'Alta del activo', changedAt: '2026-10-01T18:00:00.000Z', changedBy: 'Gabriel Gerente' },
    ],
    ...over,
  }
}
