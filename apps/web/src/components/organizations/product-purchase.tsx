import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { api, apiUrl } from '@/lib/api';
import { commerceImage, effectivePrice, type Product, type Spec } from '@/lib/commerce';
import { readCart, writeCart } from '@/lib/shop-cart';
import { useAuth } from '@/features/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const specValue = (s: Spec) => s.type === 'BOOLEAN' ? s.value ? 'Sí' : 'No' : s.type === 'RANGE' ? `${(s.value as {
    min: number;
    max: number;
}).min} – ${(s.value as {
    min: number;
    max: number;
}).max}` : Array.isArray(s.value) ? s.value.join(', ') : String(s.value);
export function ProductPurchase({ id }: {
    id: string;
}) {
    const q = useQuery({ queryKey: ['commerce', 'product', id], queryFn: () => api<Product>(`/marketplace/products/${id}`) });
    const { user } = useAuth();
    const [selected, setSelected] = useState(''), [quantity, setQuantity] = useState(1), [photo, setPhoto] = useState<string | null>(null), [message, setMessage] = useState('');
    if (q.isLoading)
        return <p className="text-sm text-muted-foreground">Cargando variantes y ficha técnica…</p>;
    if (q.isError || !q.data)
        return <p className="text-sm text-muted-foreground">No se pudo cargar la ficha comercial. <Button variant="ghost" onClick={() => void q.refetch()}>Reintentar</Button></p>;
    const product = q.data, variants = product.variants.filter(v => v.active), variant = variants.find(v => v.id === selected) ?? variants[0], images = [...(product.imageUrl ? [{ id: 'cover', url: product.imageUrl }] : []), ...product.gallery], mode = product.commercial.saleMode ?? 'QUOTE';
    function add() { if (!user || !variant?.id)
        return; if(quantity<(variant.salesRules?.minQuantity??1)){setMessage(`Compra mínima: ${variant.salesRules?.minQuantity} unidades.`);return;}if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
        setMessage('Indica una cantidad válida.');
        return;
    } const lines = readCart(user.id), found = lines.find(l => l.variantId === variant.id), next = (found?.quantity ?? 0) + quantity; if (mode === 'DIRECT' && next > (variant.available ?? 0)) {
        setMessage('La cantidad supera las existencias disponibles.');
        return;
    } if (found)
        found.quantity = next;
    else
        lines.push({ productId: id, variantId: variant.id, quantity }); writeCart(user.id, lines); setMessage('Producto añadido al carrito.'); }
    return <section className="space-y-5">{images.length > 0 && <div className="space-y-3"><img src={commerceImage(photo ?? images[0].url, apiUrl)} alt={`Foto de ${product.title}`} className="aspect-[4/3] w-full rounded-xl bg-muted object-contain"/>{images.length > 1 && <div className="flex gap-2 overflow-x-auto">{images.map(image => <button key={image.id} onClick={() => setPhoto(image.url)} className="size-16 shrink-0 overflow-hidden rounded-lg border border-border" aria-label={`Ver foto ${image.id === 'cover' ? 'principal' : images.indexOf(image) + 1}`}><img src={commerceImage(image.url, apiUrl)} alt="" className="size-full object-cover"/></button>)}</div>}</div>}
 <div className="grid grid-cols-2 gap-3 text-sm">{product.commercial.brand && <p><span className="block text-xs text-muted-foreground">Marca</span>{product.commercial.brand}</p>}{product.commercial.model && <p><span className="block text-xs text-muted-foreground">Modelo del producto</span>{product.commercial.model}</p>}{product.commercial.condition && <p><span className="block text-xs text-muted-foreground">Condición</span>{{ NEW: 'Nuevo', USED: 'Usado', REFURBISHED: 'Reacondicionado' }[product.commercial.condition] ?? product.commercial.condition}</p>}{product.commercial.leadDays !== undefined && <p><span className="block text-xs text-muted-foreground">Preparación</span>{product.commercial.leadDays} días</p>}</div>
 {variants.length > 0 && <div className="space-y-3 rounded-xl border border-border p-4"><label className="block space-y-2 text-sm">Variante<select className="shop-select" value={variant?.id} onChange={e => { setSelected(e.target.value); setMessage(''); }}>{variants.map(v => <option key={v.id} value={v.id}>{v.name} · {v.sku}{mode === 'DIRECT' ? ` · ${product.currency} ${v.price.toFixed(2)}` : ''}</option>)}</select></label>{variant&&<div className="space-y-1 text-sm"><strong>{product.currency} {effectivePrice(variant,quantity).toFixed(2)} / unidad</strong><p className="text-xs text-muted-foreground">Compra mínima: {variant.salesRules?.minQuantity??1} unidades</p>{variant.salesRules?.tiers?.map(t=><p key={t.quantity} className="text-xs">Desde {t.quantity} unidades: {product.currency} {t.price.toFixed(2)} / unidad</p>)}</div>}{mode === 'DIRECT' && <p className="text-xs text-muted-foreground">{variant?.available ?? 0} unidades disponibles</p>}<label className="block space-y-2 text-sm">Cantidad<Input type="number" min={variant?.salesRules?.minQuantity??1} max={mode === 'DIRECT' ? variant?.available : 9999} value={quantity} onChange={e => setQuantity(Number(e.target.value))}/></label>{user ? <Button className="w-full" disabled={mode === 'DIRECT' && (variant?.available ?? 0) < 1} onClick={add}><ShoppingCart />{mode === 'DIRECT' ? 'Añadir al carrito' : 'Añadir para cotizar'}</Button> : <Button asChild><Link to="/login">Inicia sesión para comprar</Link></Button>}{message && <p role="status" className="text-sm">{message}</p>}<Button asChild variant="outline" className="w-full"><Link to="/marketplace/cart">Ver carrito</Link></Button>{!product.terms && <p className="text-xs text-muted-foreground">La tienda debe configurar las transferencias y entregas antes de recibir pedidos.</p>}{product.terms && <p className="text-xs leading-relaxed text-muted-foreground">{product.terms.shippingZones?.length?'Envío según la zona seleccionada en el carrito.':`Envío por pedido: ${product.terms.currency} ${product.terms.shippingFee.toFixed(2)}.`} {product.terms.coverage}</p>}</div>}
 {!!product.commercial.specifications?.length && <section><h3 className="mb-3 text-sm font-semibold">Ficha técnica del producto</h3><dl className="divide-y divide-border">{product.commercial.specifications.map((spec, i) => <div key={i} className="grid grid-cols-2 gap-3 py-2 text-sm"><dt className="text-muted-foreground">{spec.label}</dt><dd className="break-words">{specValue(spec)} {spec.unit}</dd></div>)}</dl></section>}{(product.ratingCount ?? 0) > 0 && <section className="space-y-3 border-t border-border pt-4"><h3 className="text-sm font-semibold">Opiniones de compradores</h3><p className="text-sm">{product.rating?.toFixed(1)} de 5 · {product.ratingCount} reseñas</p>{product.reviews?.map(review => <article key={review.id} className="rounded-xl bg-muted p-3 text-sm"><strong>{review.buyer} · {review.rating}/5</strong><p className="mt-1 text-xs text-muted-foreground">Compra verificada · {new Date(review.createdAt).toLocaleDateString()}</p><p className="mt-2 whitespace-pre-wrap">{review.comment}</p></article>)}</section>}{product.commercial.warranty && <p className="text-sm"><strong>Garantía:</strong> {product.commercial.warranty}</p>}
 </section>;
}
