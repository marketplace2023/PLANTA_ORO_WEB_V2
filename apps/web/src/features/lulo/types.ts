export type LuloInput = {
  referenceMode?: boolean;
  workId?: string | null; priceListId?: string | null; baseDate?: string;
  priceListSnapshot?: { id: string; name: string; currency: string; revision: number };
  workSnapshot?: { id: string; code: string; name: string; location: string; contractReference: string; clientId: string; clientName: string; taxId: string; address: string; contact: string };
  title: string; project: string; client: string; notes: string; publicationId: string | null; currency: string; precision: number;
  rates: { fcasPct: string; overheadPct: string; utilityPct: string; financePct: string; taxPct: string };
  chapters: { id: string; name: string; parentId: string | null }[];
  lines: { id: string; chapterId: string; mode: 'CALCULATED' | 'MANUAL' | 'ASSUMED'; apuId: string | null; sourceMasterId?: string; assetId?: string | null; assetSnapshot?: { id: string; tag: string; name: string; stageCode: string | null; networkCodes: string[] }; computationId?: string; pendingReason?: string; code: string; description: string; unit: string; quantity: string; manualPrice: string | null; reason: string; taxable: boolean }[];
  overrides: { resourceId: string; amount: string; baseDate: string; validUntil: string; reason: string }[];
}
export type Publication = { id: string; label: string; version: number; demo: boolean; profile: string; historical?: boolean }
export type ApuChoice = { id: string; code: string; name: string; unit: string }
export type LuloResource = { id: string; code: string; name: string; type: string; unit: string; amount: string; costBasis: string; currency: string; denomination: string; baseDate: string; validUntil: string }
export type Catalog = { publicationId: string | null; label: string; version: number; demo: boolean; currency: string; denomination: string; hash: string; apus: { id: string; code: string; name: string; unit: string; yieldValue: string; yieldBasis: string; hoursPerDay: string | null; methodNote: string; publicationId: string; components: { resource: LuloResource; quantity: string; wastePct: string }[] }[] }
export type LuloResult = {
  profile: string; currency: string; precision: number; demo: boolean;
  lines: (LuloInput['lines'][number] & { price: string; amount: string; apu: { id: string; code: string; name: string; yieldValue: string; yieldBasis: string; hoursPerDay: string | null; methodNote: string; price: string; breakdown: Record<string, string>; components: { resourceId: string; code: string; name: string; type: string; unit: string; quantity: string; wastePct: string; consumption: string; price: string; cost: string; privatePrice: boolean }[] } | null })[];
  chapters: (LuloInput['chapters'][number] & { subtotal: string })[];
  totals: { subtotal: string; taxable: string; tax: string; total: string };
}
export type Calculation = { result: LuloResult; catalog: Catalog; warnings: string[]; hash: string }
export type LuloDocument = { id: string; code: string; title: string; version: number; revision: number; groupId: string; predecessorId: string | null; status: 'DRAFT' | 'IN_REVIEW' | 'ISSUED'; input: LuloInput; catalog: Catalog; result: LuloResult; contentHash: string; issuedAt: string | null; warnings: string[]; history: { id: string; occurredAt: string; action: string; data: { reason: string; actorName: string } }[] }
export const stateLabels = { DRAFT: 'Borrador', IN_REVIEW: 'En revisión', ISSUED: 'Emitido' }
export const reportKinds = { budget: 'Presupuesto', chapters: 'Por capítulos', apus: 'Hoja de APU', resources: 'Relación de insumos' }
export const rateLabels = { fcasPct: 'Recargo FCAS', overheadPct: 'Administración', utilityPct: 'Utilidad', financePct: 'Financiamiento', taxPct: 'Impuesto' }
export function decimalText(value: string) {
  const [integer, decimals] = value.split('.')
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${decimals ? `,${decimals}` : ''}`
}
export const newLuloInput = (): LuloInput => ({ title: 'Nueva estimación', project: '', client: '', notes: '', publicationId: null, currency: 'USD', precision: 2, rates: { fcasPct: '0', overheadPct: '0', utilityPct: '0', financePct: '0', taxPct: '0' }, chapters: [{ id: crypto.randomUUID(), name: 'Trabajos de planta', parentId: null }], lines: [], overrides: [] })
