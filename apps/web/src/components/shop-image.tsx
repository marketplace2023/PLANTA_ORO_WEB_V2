import { useEffect, useState } from 'react';
import { apiBlob } from '@/lib/api';
export function ShopImage({ src, alt, className }: {
    src: string;
    alt: string;
    className?: string;
}) { const [image, setImage] = useState<{
    src: string;
    url: string;
} | null>(null); useEffect(() => { let active = true, url: string | undefined; void apiBlob(src).then(blob => { if (active) {
    url = URL.createObjectURL(blob);
    setImage({ src, url });
} }).catch(() => undefined); return () => { active = false; if (url)
    URL.revokeObjectURL(url); }; }, [src]); return image?.src === src ? <img src={image.url} alt={alt} className={className}/> : <span className={`grid place-items-center bg-muted text-xs text-muted-foreground ${className ?? ''}`}>{alt}</span>; }
