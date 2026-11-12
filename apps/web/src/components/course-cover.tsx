import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { apiBlob } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Uploaded covers go through the shared API with auth; remote URLs remain browser image requests. */
export function CourseCover({ src, alt = 'Portada del curso', className, showError = false }: {src?: string | null; alt?: string; className?: string; showError?: boolean}) {
  const internal = !!src && /^\/(?:courses\/[0-9a-f-]+\/cover|instructors\/[0-9a-f-]+\/avatar)(?:\?v=\d+)?$/i.test(src)
  const [loaded, setLoaded] = useState<{source:string; url:string | null; failed:boolean} | null>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  useEffect(() => {
    if (!src || !internal) return
    const controller = new AbortController()
    let active = true
    let objectUrl: string | undefined
    void apiBlob(src, {signal:controller.signal}).then(blob => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setLoaded({source:src,url:objectUrl,failed:false})
    }).catch(() => { if (active) setLoaded({source:src,url:null,failed:true}) })
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src, internal])
  let remote: string | null = null
  if (src && !internal) {
    try { const url = new URL(src); if (['https:', 'http:', 'blob:'].includes(url.protocol)) remote = src } catch { /* Invalid sources use the same fallback. */ }
  }
  const loading = internal && loaded?.source !== src
  const url = internal ? loaded?.source === src ? loaded.url : null : remote
  const failed = !!src && !loading && (!url || failedSource === src || (internal && loaded?.source === src && loaded.failed))
  return <div className={cn('course-cover relative grid place-items-center overflow-hidden bg-muted',className)} data-state={loading ? 'loading' : failed ? 'unavailable' : src ? 'image' : 'empty'}>
    {url && !failed ? <img src={url} alt={alt} className="absolute inset-0 size-full object-cover" referrerPolicy="no-referrer" onError={() => setFailedSource(src!)} /> : <div className="flex flex-col items-center gap-2 p-4 text-center text-muted-foreground">
      {loading ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <ImageOff className="size-7" aria-hidden />}
      <span className="text-xs">{loading ? 'Cargando portada…' : src ? 'Portada no disponible' : 'Sin portada'}</span>
      {showError && failed && <p role="alert" className="max-w-sm text-xs leading-relaxed">El enlace no entrega una imagen accesible. Sube un archivo desde tu equipo o usa una URL directa que permita mostrar la imagen.</p>}
    </div>}
  </div>
}
