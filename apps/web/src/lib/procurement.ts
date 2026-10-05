import { Ban, CheckCircle2, CircleDashed, FileSearch, PackageCheck, Send, ShoppingCart, XCircle, type LucideIcon } from 'lucide-react'

export const REQUISITION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RFQ', 'ORDERED', 'RECEIVED', 'CANCELLED'] as const
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number]

export const REQUISITION_STATUS_META: Record<RequisitionStatus, { label: string; icon: LucideIcon; color: string }> = {
  DRAFT: { label: 'Borrador', icon: CircleDashed, color: 'var(--fur-steel-500)' },
  SUBMITTED: { label: 'Por aprobar', icon: Send, color: 'var(--fur-blue-500)' },
  APPROVED: { label: 'Aprobada', icon: CheckCircle2, color: 'var(--fur-green-500)' },
  REJECTED: { label: 'Rechazada', icon: XCircle, color: 'var(--fur-red-500)' },
  RFQ: { label: 'En cotización', icon: FileSearch, color: 'var(--fur-orange-500)' },
  ORDERED: { label: 'Pedida', icon: ShoppingCart, color: 'var(--fur-cyan-500)' },
  RECEIVED: { label: 'Recibida', icon: PackageCheck, color: 'var(--fur-navy-700)' },
  CANCELLED: { label: 'Cancelada', icon: Ban, color: 'var(--fur-red-500)' },
}

export const requisitionStatusLabel = (s: string) => REQUISITION_STATUS_META[s as RequisitionStatus]?.label ?? s

export const RFQ_STATUS_LABELS: Record<string, string> = { OPEN: 'Abierta', AWARDED: 'Adjudicada', CANCELLED: 'Cancelada' }
export const QUOTE_STATUS_LABELS: Record<string, string> = { SUBMITTED: 'Enviada', AWARDED: 'Adjudicada', REJECTED: 'No adjudicada', WITHDRAWN: 'Retirada' }

/** Fecha límite de una RFQ: se muestra en hora local y se envía en ISO con zona. Mínimo = ahora + 1 hora. */
export const defaultDeadlineLocal = (days = 5) => {
  const d = new Date(Date.now() + days * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}
