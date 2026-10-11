import { useEffect, useState, type RefObject } from 'react'

/**
 * Alto actual de un elemento, solo mientras se cumpla la media query (por defecto, pantallas anchas: `xl`). Sirve para que
 * una columna tome la altura de otra y su contenido se desplace por dentro. Fuera de la media query devuelve `undefined`.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>, query = '(min-width: 80rem)'): number | undefined {
  const [height, setHeight] = useState<number | undefined>()

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const measure = (h?: number) => setHeight(mq.matches ? Math.round(h ?? el.getBoundingClientRect().height) : undefined)
    const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.height))
    observer.observe(el)
    const onChange = () => measure()
    mq.addEventListener('change', onChange)
    measure()
    return () => {
      observer.disconnect()
      mq.removeEventListener('change', onChange)
    }
  }, [ref, query])

  return height
}
