import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, Download, MessageSquare, Paperclip, Send, ShieldCheck } from 'lucide-react';
import { api, apiBlob, jsonBody } from '@/lib/api';
import { ACTIONS, STATES, date, money, type Order, type Proposal } from '@/lib/professional';
function permitted(o: Order) {
    const a: string[] = [];
    const { isBuyer: b, isSeller: s, permissions: p, isAdmin: admin } = o.capabilities;
    const work = s && p.includes('PROJECTS');
    const finance = s && p.includes('FINANCE');
    if (work && ['REQUESTED', 'PROPOSED'].includes(o.status))
        a.push('PROPOSE');
    if (b && o.status === 'PROPOSED')
        a.push('ACCEPT', 'REQUEST_PROPOSAL_CHANGE');
    if (b && o.status === 'AWAITING_REQUIREMENTS')
        a.push('REQUIREMENTS');
    if (b && o.status === 'PENDING_PAYMENT')
        a.push('PAYMENT_SUBMIT');
    if (finance && o.status === 'PAYMENT_REVIEW')
        a.push('PAYMENT_CONFIRM', 'PAYMENT_REJECT');
    if (work && ['IN_PROGRESS', 'REVISION'].includes(o.status))
        a.push('DELIVER');
    if (b && o.status === 'DELIVERED') {
        a.push('APPROVE');
        if (o.revisionsUsed < (o.proposal?.revisions ?? 0))
            a.push('REVISE');
    }
    if (b && ['REQUESTED', 'PROPOSED', 'AWAITING_REQUIREMENTS', 'PENDING_PAYMENT'].includes(o.status))
        a.push('CANCEL');
    if (finance && o.status === 'REFUND_PENDING')
        a.push('REFUND_CONFIRM');
    if ((b || work) && !['COMPLETED', 'CANCELLED', 'REFUNDED', 'DISPUTED', 'REFUND_PENDING'].includes(o.status) && !o.changeRequest) {
        a.push('REQUEST_CANCEL');
        if (o.dueAt)
            a.push('REQUEST_EXTENSION');
    }
    if (o.changeRequest && o.capabilities.canRespondChange)
        a.push('ACCEPT_CHANGE', 'REJECT_CHANGE');
    if ((b || work) && !['REQUESTED', 'PROPOSED', 'CANCELLED', 'REFUNDED', 'DISPUTED'].includes(o.status))
        a.push('DISPUTE');
    if (admin && o.status === 'DISPUTED')
        a.push('RESOLVE');
    return a;
}
function ActionForm({ o, onSaved }: {
    o: Order;
    onSaved: () => void;
}) {
    const available = permitted(o);
    const [selected, setSelected] = useState('');
    const action = available.includes(selected) ? selected : available[0] ?? '';
    const [note, setNote] = useState('');
    const [reference, setReference] = useState('');
    const [days, setDays] = useState(3);
    const [outcome, setOutcome] = useState('RESUME');
    const [requirements, setRequirements] = useState(o.requirements);
    const [file, setFile] = useState<File | null>(null);
    const [proposal, setProposal] = useState<Proposal>(() => o.proposal ?? { name: 'Propuesta personalizada', scope: '', currency: 'USD', price: 0, deliveryDays: 7, revisions: 1, deliverables: ['Informe del trabajo'], expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), milestones: [] });
    const m = useMutation({ mutationFn: async () => {
            if (action === 'DELIVER') {
                const form = new FormData();
                form.append('version', String(o.version));
                form.append('note', note);
                if (file)
                    form.append('file', file);
                return api(`/professional-market/orders/${o.id}/delivery`, { method: 'POST', body: form });
            }
            return api(`/professional-market/orders/${o.id}`, { method: 'PATCH', ...jsonBody({ action, version: o.version, ...(note ? { note } : {}), ...(['PAYMENT_SUBMIT', 'REFUND_CONFIRM'].includes(action) ? { reference } : {}), ...(action === 'PROPOSE' ? { proposal } : {}), ...(action === 'REQUIREMENTS' ? { requirements } : {}), ...(action === 'REQUEST_EXTENSION' ? { days } : {}), ...(action === 'RESOLVE' ? { outcome } : {}) }) });
        }, onSuccess: () => { setNote(''); setReference(''); setFile(null); onSaved(); } });
    if (!action)
        return <p className="pro-muted">No hay acciones pendientes para tu rol en este estado.</p>;
    const needsNote = ['REQUEST_PROPOSAL_CHANGE', 'PAYMENT_REJECT', 'DELIVER', 'REVISE', 'REQUEST_CANCEL', 'REQUEST_EXTENSION', 'DISPUTE', 'RESOLVE'].includes(action);
    return <form className="pro-form" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
    <label>Acción disponible<select value={action} onChange={e => { setSelected(e.target.value); m.reset(); }}>{available.map(a => <option key={a} value={a}>{ACTIONS[a]}</option>)}</select></label>
    {action === 'PROPOSE' && <fieldset className="pro-form"><legend>Alcance y precio</legend><label>Nombre<input required maxLength={200} value={proposal.name} onChange={e => setProposal({ ...proposal, name: e.target.value })}/></label><label>Alcance<textarea required minLength={10} value={proposal.scope} onChange={e => setProposal({ ...proposal, scope: e.target.value })}/></label><div className="pro-form-grid"><label>Precio total<input type="number" min="0" max="100000000" step="0.01" required value={proposal.price} onChange={e => setProposal({ ...proposal, price: Number(e.target.value) })}/></label><label>Moneda<input required pattern="[A-Z]{3}" maxLength={3} value={proposal.currency} onChange={e => setProposal({ ...proposal, currency: e.target.value.toUpperCase() })}/></label><label>Entrega en días<input required type="number" min="1" max="365" value={proposal.deliveryDays} onChange={e => setProposal({ ...proposal, deliveryDays: Number(e.target.value) })}/></label><label>Revisiones incluidas<input required type="number" min="0" max="20" value={proposal.revisions} onChange={e => setProposal({ ...proposal, revisions: Number(e.target.value) })}/></label></div><label>Entregables, uno por línea<textarea required value={proposal.deliverables.join('\n')} onChange={e => setProposal({ ...proposal, deliverables: e.target.value.split('\n') })}/></label><label>Válida hasta<input type="date" required min={new Date().toISOString().slice(0, 10)} value={proposal.expiresAt.slice(0, 10)} onChange={e => e.target.value && setProposal({ ...proposal, expiresAt: new Date(`${e.target.value}T23:59:59`).toISOString() })}/></label>
    <div className="pro-inline"><strong>Hitos de entrega</strong><button className="pro-link" type="button" disabled={proposal.milestones.length >= 5} onClick={() => setProposal({ ...proposal, milestones: [...proposal.milestones, { name: '', deliverables: [''] }] })}>+ Añadir hito</button></div><p className="pro-muted">Hasta cinco aprobaciones parciales. El pago por transferencia cubre el importe total acordado.</p>{proposal.milestones.map((h, i) => <div className="pro-subpanel" key={i}><label>Hito {i + 1}<input required value={h.name} onChange={e => setProposal({ ...proposal, milestones: proposal.milestones.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })}/></label><label>Entregables<textarea required value={h.deliverables.join('\n')} onChange={e => setProposal({ ...proposal, milestones: proposal.milestones.map((x, j) => j === i ? { ...x, deliverables: e.target.value.split('\n') } : x) })}/></label><button type="button" className="pro-link" onClick={() => setProposal({ ...proposal, milestones: proposal.milestones.filter((_, j) => j !== i) })}>Quitar hito</button></div>)}</fieldset>}
    {action === 'ACCEPT' && <p className="pro-notice">Al aceptar confirmas el alcance, precio, plazo y revisiones de esta versión de la propuesta.</p>}
    {action === 'REQUIREMENTS' && o.requirementQuestions.map(r => <label key={r.id}>{r.question}{r.required ? ' *' : ''}<textarea required={r.required} value={requirements[r.id] ?? ''} onChange={e => setRequirements({ ...requirements, [r.id]: e.target.value })}/></label>)}
    {['PAYMENT_SUBMIT', 'REFUND_CONFIRM'].includes(action) && <label>Referencia de la transferencia<input required maxLength={200} value={reference} onChange={e => setReference(e.target.value)}/></label>}
    {action === 'PAYMENT_CONFIRM' && <p className="pro-notice">Confirma únicamente después de verificar que el dinero está recibido en tu cuenta bancaria. Esta acción inicia el plazo de entrega.</p>}
    {action === 'REFUND_CONFIRM' && <p className="pro-notice">Registra la referencia después de realizar el reembolso por tu banco.</p>}
    {action === 'REQUEST_EXTENSION' && <label>Días adicionales<input required type="number" min="1" max="365" value={days} onChange={e => setDays(Number(e.target.value))}/></label>}
    {action === 'RESOLVE' && <label>Resultado<select value={outcome} onChange={e => setOutcome(e.target.value)}><option value="RESUME">Reanudar el trabajo</option><option value="REFUND">Requerir reembolso</option><option value="COMPLETE">Dar por completado</option></select></label>}
    {needsNote && <label>{action === 'DELIVER' ? 'Describe la entrega' : 'Motivo o detalle'}<textarea required minLength={10} maxLength={8000} value={note} onChange={e => setNote(e.target.value)}/></label>}
    {action === 'DELIVER' && <label>Archivo de entrega (opcional, hasta 5 MB)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>}
    {m.isError && <p role="alert" className="pro-error">{m.error.message}</p>}<button className="pro-button" disabled={m.isPending}>{m.isPending ? 'Guardando…' : ACTIONS[action]}</button>
  </form>;
}
export function ServiceOrderWorkspace({ id, back = '/service-orders', seller = false }: {
    id: string;
    back?: string;
    seller?: boolean;
}) {
    const cache = useQueryClient();
    const q = useQuery({ queryKey: ['professional', 'order', id], queryFn: () => api<Order>(`/professional-market/orders/${id}`), refetchInterval: 30000 });
    const [body, setBody] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [response, setResponse] = useState('');
    const [downloadError, setDownloadError] = useState('');
    const refresh = () => { void cache.invalidateQueries({ queryKey: ['professional'] }); void cache.invalidateQueries({ queryKey: ['org'] }); };
    const send = useMutation({ mutationFn: () => { const form = new FormData(); form.append('body', body); if (file)
            form.append('file', file); return api(`/professional-market/orders/${id}/messages`, { method: 'POST', body: form }); }, onSuccess: () => { setBody(''); setFile(null); refresh(); } });
    const review = useMutation({ mutationFn: () => api(`/professional-market/orders/${id}/reviews`, { method: 'POST', ...jsonBody({ rating, comment }) }), onSuccess: refresh });
    const reply = useMutation({ mutationFn: () => api(`/contractors/${q.data!.contractorId}/workspace/reviews/${q.data!.review!.id}/response`, { method: 'POST', ...jsonBody({ response }) }), onSuccess: refresh });
    async function download(path: string, name: string) { try {
        setDownloadError('');
        const blob = await apiBlob(path);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    catch (e) {
        setDownloadError(e instanceof Error ? e.message : 'No se pudo descargar el archivo');
    } }
    if (q.isLoading)
        return <div className="pro-loading" aria-busy="true">Cargando contratación…</div>;
    if (q.isError || !q.data)
        return <div className="pro-error" role="alert">No se pudo cargar la contratación. <button onClick={() => void q.refetch()}>Reintentar</button></div>;
    const o = q.data;
    const p = o.proposal;
    const canMessage = o.capabilities.isBuyer || o.capabilities.isAdmin || o.capabilities.permissions.some(p => ['PROJECTS', 'FINANCE'].includes(p));
    return <div className="pro-workspace"><Link className="pro-back" to={back}><ArrowLeft size={16}/> Volver a {seller ? 'trabajos' : 'mis contrataciones'}</Link><header className="pro-page-heading"><div><p className="pro-eyebrow">Contratación · {id.slice(-8).toUpperCase()}</p><h1>{o.title}</h1><p>{o.contractorName} · Cliente: {o.buyer.name}</p></div><span className={`pro-status pro-status-${o.status.toLowerCase()}`}>{STATES[o.status] ?? o.status}</span></header>
  <div className="pro-order-layout"><div className="pro-stack"><section className="pro-panel"><div className="pro-inline"><h2><ShieldCheck size={18}/> Condiciones acordadas</h2>{p && <strong className="pro-price">{money(p.price, p.currency)}</strong>}</div>{p ? <><h3>{p.name}</h3><p className="pro-preserve">{p.scope}</p><ul className="pro-checklist">{p.deliverables.map((d, i) => <li key={i}><CheckCircle2 size={15}/>{d}</li>)}</ul><div className="pro-meta"><span><Clock3 size={15}/>{p.deliveryDays} días</span><span>{o.revisionsUsed} / {p.revisions} revisiones utilizadas</span></div>{o.status === 'PROPOSED' && <p className="pro-muted">Propuesta válida hasta {date(p.expiresAt)}</p>}{p.milestones.length > 0 && <ol className="pro-milestones">{p.milestones.map((m, i) => <li key={i} className={i < o.completedMilestones ? 'is-complete' : ''}><strong>{i + 1}. {m.name}</strong><span>{i < o.completedMilestones ? 'Aprobado' : i === o.completedMilestones ? 'Hito actual' : 'Pendiente'}</span><p>{m.deliverables.join(' · ')}</p></li>)}</ol>}</> : <p className="pro-muted">El profesional preparará una propuesta según tu solicitud.</p>}{o.dueAt && <p className={o.late ? 'pro-error' : 'pro-notice'}>Fecha de entrega: {date(o.dueAt)}{o.late ? ' · Plazo vencido' : ''}</p>}</section>
  {o.requirementQuestions.length > 0 && <section className="pro-panel"><h2>Requisitos del trabajo</h2><dl className="pro-definitions">{o.requirementQuestions.map(r => <div key={r.id}><dt>{r.question}</dt><dd className="pro-preserve">{o.requirements[r.id] || 'Pendiente'}</dd></div>)}</dl></section>}
  {o.changeRequest && <section className="pro-panel pro-notice"><h2>{o.changeRequest.kind === 'CANCEL' ? 'Cancelación solicitada' : 'Ampliación de plazo solicitada'}</h2><p>{o.changeRequest.reason}</p>{o.changeRequest.days && <p>{o.changeRequest.days} días adicionales</p>}<p className="pro-muted">Debe responder la otra parte desde las acciones de la contratación.</p></section>}
  {o.dispute && <section className="pro-panel"><h2>Mediación</h2><p className="pro-preserve">{o.dispute.reason}</p>{o.dispute.resolution && <p className="pro-notice">Resolución: {o.dispute.resolution}</p>}</section>}
  <section className="pro-panel"><h2><MessageSquare size={18}/> Conversación y entregas</h2><div className="pro-conversation">{o.messages.map(m => <article className={m.kind === 'DELIVERY' ? 'pro-message is-delivery' : 'pro-message'} key={m.id}><div className="pro-inline"><strong>{m.author}</strong><time>{date(m.createdAt)}</time></div>{m.kind !== 'MESSAGE' && <span className="pro-eyebrow">{ACTIONS[m.kind] ?? m.kind}</span>}<p className="pro-preserve">{m.body}</p>{m.fileUrl && <button className="pro-link" onClick={() => void download(m.fileUrl!, m.fileName!)}><Download size={15}/>{m.fileName}</button>}</article>)}</div>{downloadError && <p role="alert" className="pro-error">{downloadError}</p>}{canMessage && <form className="pro-form" onSubmit={(e: FormEvent) => { e.preventDefault(); send.mutate(); }}><label>Mensaje<textarea maxLength={8000} value={body} onChange={e => setBody(e.target.value)} placeholder="Comparte avances, consultas o archivos del trabajo…"/></label><label className="pro-file-label"><Paperclip size={15}/> Adjunto (máximo 5 MB)<input key={file?.name ?? 'empty'} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>{send.isError && <p role="alert" className="pro-error">{send.error.message}</p>}<button className="pro-button" disabled={send.isPending || (!body.trim() && !file)}><Send size={15}/> Enviar mensaje</button></form>}</section>
  </div><aside className="pro-stack pro-order-aside"><section className="pro-panel"><h2>Gestionar contratación</h2><ActionForm key={`${o.id}-${o.version}`} o={o} onSaved={refresh}/></section>
  {o.paymentInstructions && p && p.price > 0 && <section className="pro-panel"><h2>Transferencia bancaria</h2><dl className="pro-definitions"><div><dt>Banco</dt><dd>{o.paymentInstructions.bank}</dd></div><div><dt>Beneficiario</dt><dd>{o.paymentInstructions.beneficiary}</dd></div><div><dt>Cuenta</dt><dd>{o.paymentInstructions.account}</dd></div></dl><p className="pro-preserve">{o.paymentInstructions.instructions}</p>{o.paymentReference && <p>Referencia informada: {o.paymentReference}</p>}{o.refundReference && <p>Referencia del reembolso: {o.refundReference}</p>}<p className="pro-muted">El cliente transfiere directamente al profesional. La confirmación y los reembolsos se registran manualmente.</p></section>}
  {(o.review || o.status === 'COMPLETED') && <section className="pro-panel"><h2>Reseña del trabajo</h2>{o.review ? <><strong>{o.review.rating} / 5</strong><p>{o.review.comment}</p>{o.review.response && <blockquote>{o.review.response}</blockquote>}{o.capabilities.permissions.includes('PROJECTS') && <form className="pro-form" onSubmit={e => { e.preventDefault(); reply.mutate(); }}><label>Respuesta del profesional<textarea required minLength={10} maxLength={4000} value={response} onChange={e => setResponse(e.target.value)}/></label>{reply.isError && <p className="pro-error" role="alert">{reply.error.message}</p>}<button className="pro-button" disabled={reply.isPending}>Publicar respuesta</button></form>}</> : o.capabilities.isBuyer ? <form className="pro-form" onSubmit={e => { e.preventDefault(); review.mutate(); }}><label>Calificación<select value={rating} onChange={e => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map(v => <option key={v} value={v}>{v} estrellas</option>)}</select></label><label>Tu experiencia<textarea required minLength={10} maxLength={8000} value={comment} onChange={e => setComment(e.target.value)}/></label>{review.isError && <p className="pro-error" role="alert">{review.error.message}</p>}<button className="pro-button" disabled={review.isPending}>Publicar reseña</button></form> : <p className="pro-muted">El cliente puede calificar el trabajo completado.</p>}</section>}
  <section className="pro-panel"><h2>Actividad</h2><ol className="pro-timeline">{o.events.map(e => <li key={e.id}><strong>{ACTIONS[e.action] ?? e.action}</strong><time>{date(e.createdAt)}</time></li>)}</ol></section></aside></div></div>;
}
