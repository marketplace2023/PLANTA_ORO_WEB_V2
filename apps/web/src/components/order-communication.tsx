import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob, formBody, jsonBody } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
type Message = {
    id: string;
    author: string;
    body: string;
    fileName: string | null;
    createdAt: string;
};
type Case = {
    id: string;
    kind: string;
    subject: string;
    description: string;
    status: string;
    resolution: string | null;
    orderId: string;
};
const STATUS: Record<string, string> = { OPEN: 'Abierta', SELLER_REVIEW: 'En revisión de la tienda', ESCALATED: 'En mediación', RESOLVED: 'Resuelta', REJECTED: 'Rechazada' };
export function OrderCommunication({ id, seller, admin = false }: {
    id: string;
    seller: boolean;
    admin?: boolean;
}) { const client = useQueryClient(), [body, setBody] = useState(''), [file, setFile] = useState<File | null>(null), [error, setError] = useState(''), [kind, setKind] = useState('DISPUTE'), [subject, setSubject] = useState(''), [description, setDescription] = useState(''), [resolution, setResolution] = useState(''); const path = `/marketplace/orders/${id}`; const messages = useQuery({ queryKey: ['commerce', 'messages', id], queryFn: () => api<Message[]>(`${path}/messages`), refetchInterval: 15000 }); const cases = useQuery({ queryKey: ['commerce', 'cases', id], queryFn: () => api<Case[]>(`${path}/cases`), refetchInterval: 30000 }); const refresh = () => void client.invalidateQueries({ queryKey: ['commerce'] }); const send = useMutation({ mutationFn: () => api(`${path}/messages`, { method: 'POST', ...(file ? formBody({ body }, file) : jsonBody({ body })) }), onSuccess: () => { setBody(''); setFile(null); setError(''); refresh(); }, onError: (e: Error) => setError(e.message) }); const issue = useMutation({ mutationFn: () => api(`${path}/cases`, { method: 'POST', ...jsonBody({ kind, subject, description }) }), onSuccess: () => { setSubject(''); setDescription(''); setError(''); refresh(); }, onError: (e: Error) => setError(e.message) }); const update = useMutation({ mutationFn: ({ caseId, status }: {
        caseId: string;
        status: string;
    }) => api(`${path}/cases/${caseId}`, { method: 'PATCH', ...jsonBody({ status, resolution }) }), onSuccess: () => { setResolution(''); setError(''); refresh(); }, onError: (e: Error) => setError(e.message) }); async function download(message: Message) { try {
    const blob = await apiBlob(`${path}/messages/${message.id}/file`), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = message.fileName ?? 'adjunto';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
catch (e) {
    setError(e instanceof Error ? e.message : 'No se pudo descargar');
} } return <div className="space-y-6 border-t border-border pt-5"><section className="space-y-4"><header className="flex justify-between gap-3"><h3 className="font-semibold">Conversación del pedido</h3><span className="text-xs text-muted-foreground">Actualización cada 15 segundos</span></header>{messages.isError ? <p role="alert" className="text-sm">No se pudo cargar la conversación o tu rol no tiene permiso.</p> : <ol className="max-h-80 space-y-3 overflow-y-auto">{messages.data?.map(m => <li key={m.id} className="rounded-xl bg-muted p-3 text-sm"><strong>{m.author}</strong><time className="ml-3 text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</time><p className="mt-2 whitespace-pre-wrap break-words">{m.body}</p>{m.fileName && <Button className="mt-2 max-w-full truncate" variant="outline" size="sm" onClick={() => void download(m)}>{m.fileName}</Button>}</li>)}</ol>}<form className="space-y-3" onSubmit={e => { e.preventDefault(); send.mutate(); }}><label className="block space-y-2 text-sm">Mensaje<Textarea required maxLength={4000} value={body} onChange={e => setBody(e.target.value)} placeholder="Consulta cantidades, especificaciones o condiciones de entrega."/></label><label className="block space-y-2 text-xs">Adjunto opcional (PDF o imagen, hasta 5 MB)<Input key={file?.name ?? 'empty'} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>{file && <p className="text-xs text-muted-foreground">{file.name}</p>}<Button type="submit" disabled={send.isPending}>Enviar mensaje</Button></form></section><details className="space-y-4 rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold">Incidencias y garantías ({cases.data?.length ?? 0})</summary>{cases.isError && <p role="alert" className="text-sm">No se pudieron cargar las incidencias.</p>}{cases.data?.map(c => <article key={c.id} className="space-y-2 rounded-xl bg-muted p-4"><h4 className="font-semibold">{c.subject}</h4><p className="text-xs text-muted-foreground">{c.kind === 'WARRANTY' ? 'Garantía' : 'Incidencia'} · {STATUS[c.status]}</p><p className="whitespace-pre-wrap text-sm">{c.description}</p>{c.resolution && <p className="text-sm"><strong>Última respuesta: </strong>{c.resolution}</p>}{(!['RESOLVED', 'REJECTED'].includes(c.status) || (!seller && !admin)) && <div className="space-y-3"><label className="block space-y-2 text-sm">Respuesta o motivo<Textarea value={resolution} minLength={3} onChange={e => setResolution(e.target.value)}/></label><div className="flex flex-wrap gap-2">{(admin ? ['SELLER_REVIEW', 'RESOLVED', 'REJECTED'] : seller && c.status !== 'ESCALATED' ? ['SELLER_REVIEW', 'RESOLVED', 'REJECTED'] : !seller && c.status !== 'ESCALATED' ? ['ESCALATED'] : []).map(status => <Button key={status} size="sm" variant="outline" disabled={update.isPending || resolution.trim().length < 3} onClick={() => update.mutate({ caseId: c.id, status })}>{status === 'ESCALATED' ? 'Solicitar mediación' : STATUS[status]}</Button>)}</div>{c.status === 'ESCALATED' && !admin && <p className="text-xs text-muted-foreground">El administrador del ecosistema resolverá la mediación.</p>}</div>}</article>)}{!seller && !admin && <form className="space-y-3" onSubmit={e => { e.preventDefault(); issue.mutate(); }}><label className="block text-sm">Tipo<select className="shop-select" value={kind} onChange={e => setKind(e.target.value)}><option value="DISPUTE">Incidencia de compra</option><option value="WARRANTY">Solicitud de garantía</option></select></label><label className="block space-y-2 text-sm">Asunto<Input required minLength={3} maxLength={200} value={subject} onChange={e => setSubject(e.target.value)}/></label><label className="block space-y-2 text-sm">Descripción<Textarea required minLength={10} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)}/></label><Button type="submit" disabled={issue.isPending}>Abrir solicitud</Button></form>}<p className="text-xs text-muted-foreground">Resolver una incidencia registra la decisión; los reembolsos y ajustes de inventario se confirman desde el flujo del pedido.</p></details>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</div>; }
export function ShopNotifications({ providerId }: {
    providerId?: string;
}) { const client = useQueryClient(); const q = useQuery({ queryKey: ['commerce', 'notifications', providerId ?? 'buyer'], queryFn: () => api<Array<{
        id: string;
        orderId: string;
        title: string;
        readAt: string | null;
        providerId: string;
        buyerId: string;
    }>>(`/marketplace/notifications${providerId ? `?providerId=${providerId}` : ''}`), refetchInterval: 15000 }); const [open, setOpen] = useState(false); const read = useMutation({ mutationFn: (id: string) => api(`/marketplace/notifications/${id}`, { method: 'PATCH' }), onSuccess: () => void client.invalidateQueries({ queryKey: ['commerce', 'notifications'] }) }); return <section className="rounded-xl border border-border bg-card p-4"><Button variant="ghost" onClick={() => setOpen(v => !v)}>Notificaciones ({q.data?.filter(n => !n.readAt).length ?? 0} sin leer)</Button>{open && <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto">{q.isError ? <li className="text-sm">No se pudieron cargar las notificaciones.</li> : !q.data?.length ? <li className="text-sm text-muted-foreground">Sin notificaciones.</li> : q.data.map(n => <li key={n.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-xs"><a href={`${providerId ? '/orders' : '/marketplace/orders'}?order=${n.orderId}`} onClick={() => read.mutate(n.id)}>{n.title} · #{n.orderId.slice(-8)}</a>{!n.readAt && <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)}>Marcar leída</Button>}</li>)}</ul>}</section>; }
