export const LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED'] as const
export const LEVEL_LABELS: Record<string, string> = { BASIC: 'Básico', INTERMEDIATE: 'Intermedio', ADVANCED: 'Avanzado' }
export const COURSE_STATUS_LABELS: Record<string, string> = { DRAFT: 'Borrador', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado' }
export const OWNER_LABELS: Record<string, string> = { ECOSYSTEM: 'Ecosistema FUR', PROVIDER: 'Proveedor', CONTRACTOR: 'Contratista' }

export const levelLabel = (l: string) => LEVEL_LABELS[l] ?? l

/** 95 → "1 h 35 min"; 40 → "40 min"; 0 → "—" (curso sin lecciones con duración). */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}
