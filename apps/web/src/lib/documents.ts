import { File, FileImage, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react'

export const DOCUMENT_TYPES = ['MANUAL', 'PLANO', 'SOP', 'PROCEDIMIENTO', 'DATASHEET', 'CERTIFICADO', 'INFORME', 'FOTO', 'OTRO'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  MANUAL: 'Manuales',
  PLANO: 'Planos',
  SOP: 'SOP',
  PROCEDIMIENTO: 'Procedimientos',
  DATASHEET: 'Hojas de datos',
  CERTIFICADO: 'Certificados',
  INFORME: 'Informes',
  FOTO: 'Fotografías',
  OTRO: 'Otros',
}

export const typeLabel = (t: string) => DOCUMENT_TYPE_LABELS[t as DocumentType] ?? t

export const DOCUMENT_VISIBILITIES = ['INTERNAL', 'PUBLIC'] as const
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number]
export const DOCUMENT_VISIBILITY_LABELS: Record<DocumentVisibility, string> = { INTERNAL: 'Interno', PUBLIC: 'Público' }

/** Extensiones que acepta el backend (apps/api/src/modules/documents/file-validation.ts). */
export const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'csv', 'txt'] as const
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/** Solo PDF e imágenes se pueden previsualizar en el navegador. */
export const canPreview = (mimeType: string) => /^(application\/pdf|image\/(png|jpeg|webp))$/.test(mimeType)

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function iconForMime(mimeType: string): LucideIcon {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel') return FileSpreadsheet
  if (mimeType === 'application/pdf' || mimeType.includes('word') || mimeType.startsWith('text/')) return FileText
  return File
}

/** Guarda un Blob como archivo (descarga). El object URL se libera de inmediato. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Valida en el cliente lo mismo que el backend (que sigue siendo la barrera real). */
export function validateFile(file: File | null): string | undefined {
  if (!file) return 'Selecciona un archivo'
  const ext = extensionOf(file.name)
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return `Tipo no permitido (.${ext || '?'}). Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`
  if (file.size === 0) return 'El archivo está vacío'
  if (file.size > MAX_UPLOAD_BYTES) return `El archivo supera el máximo de ${formatBytes(MAX_UPLOAD_BYTES)}`
  return undefined
}

