import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BadgeCheck, CheckCircle2, Clock3, Search, Star } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { imageSrc } from '@/lib/media';
import { useAuth } from '@/features/auth/auth-context';
import { useStageCatalog } from '@/features/catalog/use-catalog';
import { ServiceOrderWorkspace } from '@/components/service-order-workspace';
import { ServiceOrdersList } from '@/components/service-orders-list';
import { money, type Media, type Offer, type Order, type Page, type Review } from '@/lib/professional';
const PROFESSIONAL_PORTAL = (import.meta.env.VITE_PROFESSIONAL_PORTAL_URL ?? 'http://localhost:5179').replace(/\/$/, '');
type Item = {
    id: string;
    name: string;
    description: string;
    specialty: string;
    version: number;
    currency: string;
    mode: string;
    fromPrice: number;
    deliveryDays: number;
    coverUrl: string | null;
    rating: number | null;
    ratingCount: number;
    contractor: {
        id: string;
        name: string;
        verified: boolean;
        availability: string;
        city: string | null;
        countryCode: string;
    };
};
type Detail = Offer & {
    id: string;
    version: number;
    canManage: boolean;
    canContract: boolean;
    gallery: Media[];
    reviews: Review[];
    rating: number | null;
    ratingCount: number;
    contractor: Item['contractor'] & {
        displayName: string;
        headline: string;
        bio: string;
        languages: string[];
        skills: string[];
        portfolio: Array<{
            title: string;
            description: string;
            url: string;
        }>;
        avatarUrl: string | null;
        certifications: string[];
        portfolioImages: Media[];
    };
};
export function ProfessionalsStudioPage() {
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState(params.get('search') ?? '');
    const stage = useStageCatalog();
    const q = useQuery({ queryKey: ['professional', 'services', params.toString()], queryFn: () => api<Page<Item>>(`/professional-market/services?${params.toString()}`) });
    function filter(key: string, value: string) { const next = new URLSearchParams(params); if (value)
        next.set(key, value);
    else
        next.delete(key); next.delete('page'); setParams(next); }
    const page = Number(params.get('page') ?? 1);
    return <div className="pro-workspace"><header className="pro-hero"><span className="pro-eyebrow">Especialistas del ecosistema FUR</span><div className="pro-inline"><div><h1>Experiencia para tu próximo proyecto.</h1><p>Encuentra profesionales, define el alcance y sigue cada entrega desde un mismo lugar.</p></div><div className="pro-stack"><Link className="pro-secondary" to="/service-orders">Mis contrataciones <ArrowUpRight size={16}/></Link><a className="pro-link" href={PROFESSIONAL_PORTAL} target="_blank" rel="noreferrer">Ofrecer mis servicios <ArrowUpRight size={14}/></a></div></div></header><div className="pro-directory-layout"><aside className="pro-panel pro-form"><h2>Encuentra tu especialista</h2><form className="pro-form" onSubmit={e => { e.preventDefault(); filter('search', search); }}><label>Servicio o profesional<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Diagnóstico, consultoría…"/></label><button className="pro-button"><Search size={15}/> Buscar</button></form><label>Especialidad<input maxLength={80} placeholder="Mecánica, instrumentación…" value={params.get('specialty') ?? ''} onChange={e => filter('specialty', e.target.value)}/></label><label>Ubicación<input maxLength={120} placeholder="Ciudad" value={params.get('location') ?? ''} onChange={e => filter('location', e.target.value)}/></label><label>Etapa (opcional)<select value={params.get('stage') ?? ''} onChange={e => filter('stage', e.target.value)}><option value="">Todas</option>{stage.data?.map(s => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label><label>Disponibilidad<select value={params.get('availability') ?? ''} onChange={e => filter('availability', e.target.value)}><option value="">Todas</option><option value="AVAILABLE">Disponible</option><option value="LIMITED">Limitada</option></select></label><label>Verificación<select value={params.get('verified') ?? ''} onChange={e => filter('verified', e.target.value)}><option value="">Todos</option><option value="1">Verificados</option></select></label><label>Moneda<select value={params.get('currency') ?? ''} onChange={e => { const n = new URLSearchParams(params); if (e.target.value)
        n.set('currency', e.target.value);
    else {
        n.delete('currency');
        n.delete('minPrice');
        n.delete('maxPrice');
        if (n.get('sort') === 'price')
            n.delete('sort');
    } n.delete('page'); setParams(n); }}><option value="">Todas</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="VES">VES</option></select></label>{params.get('currency') && <label>Precio máximo<input type="number" min="0" step=".01" value={params.get('maxPrice') ?? ''} onChange={e => filter('maxPrice', e.target.value)}/></label>}<label>Ordenar<select value={params.get('sort') ?? 'name'} onChange={e => filter('sort', e.target.value)}><option value="name">Nombre</option><option value="rating">Mejor valorados</option>{params.get('currency') && <option value="price">Menor precio</option>}</select></label><button className="pro-link" onClick={() => { setSearch(''); setParams({}); }}>Limpiar filtros</button></aside><section>{q.isLoading ? <p className="pro-loading">Buscando profesionales…</p> : q.isError ? <p className="pro-error" role="alert">{q.error.message} <button onClick={() => void q.refetch()}>Reintentar</button></p> : !q.data?.items.length ? <div className="pro-panel pro-empty"><h2>No hay servicios publicados con estos filtros</h2><p>Los profesionales aparecerán al completar y publicar sus ofertas.</p></div> : <><p className="pro-muted mb-4">{q.data.total} servicios disponibles</p><div className="pro-service-grid">{q.data.items.map(s => <Link to={`/professionals/${s.id}`} key={s.id} className="pro-service-card">{s.coverUrl && <img loading="lazy" src={imageSrc(s.coverUrl) ?? ''} alt={s.name}/>}<div className="pro-service-card-content"><p className="pro-eyebrow">{s.specialty}</p><h2>{s.name}</h2><p className="pro-muted inline-flex items-center gap-1">{s.contractor.name} {s.contractor.verified && <BadgeCheck size={14} aria-label="Verificado"/>}</p><div className="pro-meta"><span><Star size={14}/>{s.rating?.toFixed(1) ?? 'Nuevo'}{s.ratingCount ? ` (${s.ratingCount})` : ''}</span><span><Clock3 size={14}/>{s.deliveryDays} días</span></div><footer><span className="pro-muted">{s.mode === 'QUOTE' ? 'Referencia desde' : 'Desde'}</span><strong>{money(s.fromPrice, s.currency)}</strong></footer></div></Link>)}</div>{q.data.total > 12 && <nav className="pro-inline mt-6" aria-label="Páginas de servicios"><button className="pro-secondary" disabled={page === 1} onClick={() => { const n = new URLSearchParams(params); n.set('page', String(page - 1)); setParams(n); }}>Anterior</button><span>{page} / {Math.ceil(q.data.total / 12)}</span><button className="pro-secondary" disabled={page * 12 >= q.data.total} onClick={() => { const n = new URLSearchParams(params); n.set('page', String(page + 1)); setParams(n); }}>Siguiente</button></nav>}</>}</section></div></div>;
}
export function ProfessionalServicePage() {
    const { id } = useParams();
    const q = useQuery({ queryKey: ['professional', 'service', id], queryFn: () => api<Detail>(`/professional-market/services/${id}`) });
    if (q.isLoading)
        return <p className="pro-loading">Cargando servicio…</p>;
    if (q.isError || !q.data)
        return <p className="pro-error" role="alert">No se pudo cargar el servicio. <Link to="/professionals">Volver al directorio</Link></p>;
    return <ServiceDetail key={`${id}-${q.data.version}`} d={q.data}/>;
}
function ServiceDetail({ d }: {
    d: Detail;
}) {
    const [selected, setSelected] = useState(d.packages[0].id);
    const [extras, setExtras] = useState<string[]>([]);
    const [requirements, setRequirements] = useState<Record<string, string>>({});
    const [brief, setBrief] = useState('');
    const [requesting, setRequesting] = useState(false);
    const [quote, setQuote] = useState(d.mode === 'QUOTE');
    const [photo, setPhoto] = useState(d.gallery[0]?.url);
    const [key, setKey] = useState(() => crypto.randomUUID());
    const navigate = useNavigate();
    const { user } = useAuth();
    const p = d.packages.find(p => p.id === selected)!;
    const chosen = d.extras.filter(e => extras.includes(e.id));
    const total = (Math.round(p.price * 100) + chosen.reduce((a, e) => a + Math.round(e.price * 100), 0)) / 100;
    const m = useMutation({ mutationFn: () => api<Order>('/professional-market/orders', { method: 'POST', ...jsonBody({ key, serviceId: d.id, mode: quote ? 'QUOTE' : 'FIXED', ...(quote ? {} : { packageId: selected, extras, expectedTotal: total }), requirements, brief, expectedVersion: d.version }) }), onSuccess: o => navigate(`/service-orders/${o.id}`) });
    function change() { if (m.isError) {
        m.reset();
        setKey(crypto.randomUUID());
    } }
    const unavailable = d.contractor.availability === 'UNAVAILABLE' || d.status !== 'PUBLISHED';
    return <div className="pro-workspace"><Link to="/professionals" className="pro-back"><ArrowLeft size={15}/> Servicios profesionales</Link><header className="pro-page-heading"><div><span className="pro-eyebrow">{d.specialty}</span><h1>{d.name}</h1><p>{d.contractor.name} · {[d.contractor.city, d.contractor.countryCode].filter(Boolean).join(', ')}</p><div className="pro-meta"><span><Star size={15}/>{d.rating?.toFixed(1) ?? 'Sin reseñas'} {d.ratingCount ? `(${d.ratingCount})` : ''}</span>{d.contractor.verified && <span><BadgeCheck size={15}/> Profesional verificado</span>}</div></div><Link className="pro-secondary" to="/service-orders">Mis contrataciones</Link></header><div className="pro-detail-layout"><div className="pro-stack">{photo && <section><img className="pro-detail-cover" src={imageSrc(photo) ?? ''} alt={d.name}/><div className="pro-gallery">{d.gallery.map((g, i) => <button key={g.id} onClick={() => setPhoto(g.url)} aria-label={`Ver imagen ${i + 1}`}><img src={imageSrc(g.url) ?? ''} alt={g.name}/></button>)}</div></section>}<section className="pro-panel"><h2>Sobre este servicio</h2><p className="pro-preserve">{d.description}</p>{d.terms && <><h3>Condiciones y exclusiones</h3><p className="pro-preserve">{d.terms}</p></>}{d.videoUrl && <a className="pro-link" href={d.videoUrl} target="_blank" rel="noreferrer">Ver presentación en video <ArrowUpRight size={15}/></a>}</section><section className="pro-panel"><div className="pro-profile-top">{d.contractor.avatarUrl && <img src={imageSrc(d.contractor.avatarUrl) ?? ''} alt={d.contractor.displayName || d.contractor.name}/>}<div><span className="pro-eyebrow">Tu profesional</span><h2>{d.contractor.displayName || d.contractor.name}</h2><p>{d.contractor.headline}</p></div></div><p className="pro-preserve">{d.contractor.bio || 'Este profesional todavía no ha añadido su presentación.'}</p><div className="pro-tags">{[...d.contractor.skills, ...d.contractor.languages, ...d.contractor.certifications].map((s, i) => <span key={i}>{s}</span>)}</div>{d.contractor.portfolio.length > 0 && <><h3 className="mt-5">Proyectos y experiencia</h3>{d.contractor.portfolio.map((p, i) => <article className="pro-subpanel mt-3" key={i}><strong>{p.title}</strong><p className="pro-muted">{p.description}</p>{p.url && <a href={p.url} target="_blank" rel="noreferrer" className="pro-link">Ver proyecto <ArrowUpRight size={13}/></a>}</article>)}</>}{d.contractor.portfolioImages.length > 0 && <div className="pro-media-grid mt-4">{d.contractor.portfolioImages.map(m => <figure key={m.id}><img loading="lazy" src={imageSrc(m.url) ?? ''} alt="Proyecto del profesional"/></figure>)}</div>}</section>{d.faq.length > 0 && <section className="pro-panel"><h2>Antes de contratar</h2>{d.faq.map((f, i) => <article key={i} className="pro-subpanel mb-3"><h3>{f.question}</h3><p className="pro-muted">{f.answer}</p></article>)}</section>}<section className="pro-panel"><h2>Experiencias de clientes</h2>{!d.reviews.length ? <p className="pro-muted">Este servicio aún no tiene reseñas de trabajos completados.</p> : d.reviews.map(r => <article key={r.id} className="pro-subpanel mb-3"><div className="pro-inline"><strong>{r.buyer}</strong><span>{r.rating} / 5</span></div><p className="pro-preserve">{r.comment}</p>{r.response && <blockquote>{r.response}</blockquote>}</article>)}</section></div><aside className="pro-panel"><div className="pro-package-tabs">{d.packages.map(x => <button className={selected === x.id ? 'is-active' : ''} key={x.id} disabled={m.isPending} onClick={() => { setSelected(x.id); change(); }}>{x.name}</button>)}</div><h2>{p.name}</h2><strong className="pro-price">{money(p.price, d.currency)}</strong><p className="pro-preserve">{p.description}</p><ul className="pro-checklist">{p.deliverables.map((s, i) => <li key={i}><CheckCircle2 size={15}/>{s}</li>)}</ul><p className="pro-muted">Entrega en {p.deliveryDays} días · {p.revisions} revisiones incluidas</p>{d.mode === 'QUOTE' && <p className="pro-notice">Precio de referencia. El profesional preparará una propuesta para tu proyecto.</p>}{unavailable ? <p className="pro-notice">Este profesional no recibe nuevas solicitudes en este momento.</p> : d.canContract===false ? <a className="pro-secondary mt-4" href={`${PROFESSIONAL_PORTAL}/services/${d.id}`} target="_blank" rel="noreferrer">Gestionar en el portal profesional <ArrowUpRight size={15}/></a> : !requesting ? <div className="pro-form mt-5"><button className="pro-button" onClick={() => { setQuote(d.mode === 'QUOTE'); setRequesting(true); }}>{d.mode === 'QUOTE' ? 'Solicitar propuesta' : 'Contratar este paquete'}</button>{d.mode === 'FIXED' && <button className="pro-link" onClick={() => { setQuote(true); setRequesting(true); }}>Necesito una propuesta personalizada</button>}</div> : <form className="pro-checkout pro-form" onSubmit={e => { e.preventDefault(); m.mutate(); }}><h3>{quote ? 'Cuéntanos qué necesitas' : 'Preparar contratación'}</h3>{!quote && d.extras.map(x => <label className="pro-check-label" key={x.id}><input type="checkbox" disabled={m.isPending} checked={extras.includes(x.id)} onChange={e => { setExtras(e.target.checked ? [...extras, x.id] : extras.filter(id => id !== x.id)); change(); }}/>{x.name} (+{money(x.price, d.currency)}, {x.extraDays} días)</label>)}<label>Describe tu proyecto<textarea required minLength={10} maxLength={8000} disabled={m.isPending} value={brief} onChange={e => { setBrief(e.target.value); change(); }}/></label>{d.requirements.map(r => <label key={r.id}>{r.question}{r.required && !quote ? ' *' : ''}<textarea disabled={m.isPending} required={r.required && !quote} maxLength={8000} value={requirements[r.id] ?? ''} onChange={e => { setRequirements({ ...requirements, [r.id]: e.target.value }); change(); }}/></label>)}{!quote && <><div className="pro-inline"><span>Total</span><strong>{money(total, d.currency)}</strong></div><p className="pro-muted">Plazo: {p.deliveryDays + chosen.reduce((a, e) => a + e.extraDays, 0)} días desde la confirmación del pago.</p><p className="pro-notice">Al contratar aceptas los entregables y condiciones publicados. El pago se realiza por transferencia al profesional.</p></>}{m.isError && <p role="alert" className="pro-error">{m.error.message}</p>}<button className="pro-button" disabled={m.isPending || !user}>{m.isPending ? 'Enviando…' : quote ? 'Enviar solicitud' : 'Confirmar contratación'}</button><button type="button" className="pro-link" disabled={m.isPending} onClick={() => setRequesting(false)}>Volver a los paquetes</button></form>}</aside></div></div>;
}
export function MyServiceOrdersPage() { return <ServiceOrdersList />; }
export function MyServiceOrderPage() { const { id } = useParams(); return <ServiceOrderWorkspace key={id} id={id!}/>; }
