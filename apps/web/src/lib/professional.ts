export type Package = {
    id: string;
    name: string;
    description: string;
    price: number;
    deliveryDays: number;
    revisions: number;
    deliverables: string[];
};
export type Offer = {
    name: string;
    description: string;
    specialty: string;
    stageCodes: string[];
    status: 'DRAFT' | 'PUBLISHED' | 'PAUSED';
    currency: string;
    mode: 'FIXED' | 'QUOTE';
    packages: Package[];
    extras: Array<{
        id: string;
        name: string;
        price: number;
        extraDays: number;
    }>;
    requirements: Array<{
        id: string;
        question: string;
        required: boolean;
    }>;
    faq: Array<{
        question: string;
        answer: string;
    }>;
    terms: string;
    videoUrl: string;
};
export type Media = {
    id: string;
    url: string;
    name: string;
    kind?: string;
};
export type Proposal = {
    name: string;
    scope: string;
    currency: string;
    price: number;
    deliveryDays: number;
    revisions: number;
    deliverables: string[];
    expiresAt: string;
    milestones: Array<{
        name: string;
        deliverables: string[];
    }>;
};
export type Review = {
    id: string;
    rating: number;
    comment: string;
    response: string | null;
    buyer?: string;
    createdAt: string;
};
export type Order = {
    id: string;
    contractorId: string;
    serviceId: string;
    title: string;
    status: string;
    version: number;
    contractorName: string;
    buyer: {
        name: string;
        email: string;
    };
    proposal: Proposal | null;
    paymentInstructions: {
        bank: string;
        beneficiary: string;
        account: string;
        instructions: string;
    } | null;
    paymentReference: string | null;
    refundReference: string | null;
    requirements: Record<string, string>;
    requirementQuestions: Array<{
        id: string;
        question: string;
        required: boolean;
    }>;
    dueAt: string | null;
    paidAt: string | null;
    revisionsUsed: number;
    completedMilestones: number;
    changeRequest: {
        kind: string;
        reason: string;
        days?: number;
        by: string;
    } | null;
    dispute: {
        reason: string;
        resolution?: string;
        outcome?: string;
    } | null;
    late: boolean;
    capabilities: {
        isBuyer: boolean;
        isSeller: boolean;
        isAdmin: boolean;
        canRespondChange: boolean;
        permissions: string[];
    };
    messages: Array<{
        id: string;
        kind: string;
        author: string;
        authorId: string;
        body: string;
        fileName: string | null;
        fileUrl: string | null;
        createdAt: string;
    }>;
    events: Array<{
        id: string;
        action: string;
        createdAt: string;
    }>;
    review: Review | null;
};
export type OrderRow = Pick<Order, 'id' | 'title' | 'status' | 'version' | 'proposal' | 'dueAt' | 'contractorName'> & {
    buyerName: string;
    updatedAt: string;
};
export type Page<T> = {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
};
export type Notification = {
    id: string;
    orderId: string;
    title: string;
    readAt: string | null;
    createdAt: string;
};
export const STATES: Record<string, string> = { REQUESTED: 'Solicitud recibida', PROPOSED: 'Propuesta enviada', AWAITING_REQUIREMENTS: 'Faltan requisitos', PENDING_PAYMENT: 'Pendiente de transferencia', PAYMENT_REVIEW: 'Transferencia en revisión', IN_PROGRESS: 'En ejecución', DELIVERED: 'Entrega por aprobar', REVISION: 'En corrección', COMPLETED: 'Completado', CANCELLED: 'Cancelado', REFUND_PENDING: 'Reembolso pendiente', REFUNDED: 'Reembolsado', DISPUTED: 'En mediación' };
export const ACTIONS: Record<string, string> = { PROPOSE: 'Enviar propuesta', REQUEST_PROPOSAL_CHANGE: 'Solicitar cambios a la propuesta', ACCEPT: 'Aceptar propuesta', REQUIREMENTS: 'Enviar requisitos', PAYMENT_SUBMIT: 'Informar transferencia', PAYMENT_CONFIRM: 'Confirmar pago recibido', PAYMENT_REJECT: 'Rechazar comprobación', DELIVER: 'Registrar entrega', REVISE: 'Solicitar corrección', APPROVE: 'Aprobar entrega', CANCEL: 'Cancelar solicitud', REQUEST_CANCEL: 'Solicitar cancelación', REQUEST_EXTENSION: 'Solicitar ampliación del plazo', ACCEPT_CHANGE: 'Aceptar cambio solicitado', REJECT_CHANGE: 'Rechazar cambio solicitado', REFUND_CONFIRM: 'Confirmar reembolso realizado', DISPUTE: 'Solicitar mediación', RESOLVE: 'Registrar resolución', MESSAGE: 'Nuevo mensaje', REQUESTED: 'Nueva solicitud', REVIEW: 'Nueva reseña' };
export const money = (amount: number, currency: string) => new Intl.NumberFormat('es-VE', { style: 'currency', currency }).format(amount);
export const date = (value: string | null) => value ? new Date(value).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const emptyOffer = (name = ''): Offer => ({ name, description: '', specialty: '', stageCodes: [], status: 'DRAFT', currency: 'USD', mode: 'FIXED', packages: [{ id: crypto.randomUUID(), name: 'Esencial', description: '', price: 0, deliveryDays: 7, revisions: 1, deliverables: ['Informe del servicio'] }], extras: [], requirements: [], faq: [], terms: '', videoUrl: '' });
