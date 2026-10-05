import type { DocumentDetail, DocumentItem } from '@/features/documents/use-documents'

export const doc = (over: Partial<DocumentItem> = {}): DocumentItem => ({
  id: 'd1',
  title: 'Manual de operación MB-301',
  documentType: 'MANUAL',
  visibility: 'INTERNAL',
  status: 'ACTIVE',
  currentVersion: 2,
  createdAt: '2026-10-01T18:00:00.000Z',
  updatedAt: '2026-10-02T15:30:00.000Z',
  file: { originalName: 'Manual MB-301 rev B.pdf', mimeType: 'application/pdf', sizeBytes: 2_621_440 },
  assets: [{ id: 'a1', tag: 'MB-301', name: 'Molino de bolas 1' }],
  stages: [{ code: 'D06', name: 'Molienda Primaria' }],
  ...over,
})

export const detail = (over: Partial<DocumentDetail> = {}): DocumentDetail => ({
  ...doc(),
  createdBy: 'Marta Mantenimiento',
  versions: [
    { version: 2, originalName: 'Manual MB-301 rev B.pdf', mimeType: 'application/pdf', sizeBytes: 2_621_440, createdAt: '2026-10-02T15:30:00.000Z', isCurrent: true, checksum: 'abc', note: 'Corrige torques', uploadedBy: 'Marta Mantenimiento' },
    { version: 1, originalName: 'Manual MB-301.pdf', mimeType: 'application/pdf', sizeBytes: 2_000_000, createdAt: '2026-10-01T18:00:00.000Z', isCurrent: false, checksum: 'def', note: null, uploadedBy: 'Marta Mantenimiento' },
  ],
  ...over,
})

/** Detalle como lo ve un visitante: sin autor, checksum ni notas, y solo la versión vigente. */
export const publicDetail = (over: Partial<DocumentDetail> = {}): DocumentDetail => {
  const d = detail({ visibility: 'PUBLIC', ...over })
  const { createdBy: _c, ...rest } = d
  void _c
  return { ...rest, versions: [{ version: 2, originalName: d.file.originalName, mimeType: d.file.mimeType, sizeBytes: d.file.sizeBytes, createdAt: d.updatedAt, isCurrent: true }] }
}

/** Respuesta de descarga/vista previa de un PDF. */
export const pdfDownload = { raw: '%PDF-1.4 demo', headers: { 'Content-Type': 'application/pdf' } }
export const pngDownload = { raw: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), headers: { 'Content-Type': 'image/png' } }
