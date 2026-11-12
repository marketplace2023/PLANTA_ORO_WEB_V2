import { ArrowLeft, ArrowRight, Maximize2, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const MAPS = [
  { name: 'Caratal', file: 'MAPA CARATAL.jpeg' },
  { name: 'Mina Colombia', file: 'MAPA MINACOLOMBIA.jpeg' },
  { name: 'Revemin', file: 'MAPA REVEMIN.png' },
  { name: 'Mina Sosa', file: 'MAPA MINA SOSA.jpeg' },
].map((map) => ({ ...map, url: `/${encodeURIComponent(map.file)}` }))

/** Tarjetas apiladas inspiradas en Animated Testimonials, usando los mapas originales. */
export function PlantMapCards() {
  const [active, setActive] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const current = MAPS[active]

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!playing || hovered || focused || zoomed || reducedMotion) return
    const timer = window.setInterval(() => setActive((previous) => (previous + 1) % MAPS.length), 6000)
    return () => window.clearInterval(timer)
  }, [playing, hovered, focused, zoomed, reducedMotion])

  const choose = (index: number) => { setActive(index); setPlaying(false) }
  const move = (direction: number) => choose((active + direction + MAPS.length) % MAPS.length)

  return (
    <section className="hero-map-carousel" aria-labelledby="home-maps-title" aria-roledescription="carrusel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => setFocused(!(event.target as HTMLElement).closest('.hero-map-play'))} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
      onKeyDown={(event) => {
        if (zoomed) return
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}>
      <div className="hero-map-heading"><h3 id="home-maps-title">Mapas de las plantas</h3><span aria-hidden>{String(active + 1).padStart(2, '0')} <i>/ {String(MAPS.length).padStart(2, '0')}</i></span></div>
      <div className="hero-map-stack">
        {MAPS.map((map, index) => (
          <div key={map.name} className="hero-map-card" data-order={(index - active + MAPS.length) % MAPS.length} data-active={index === active} aria-hidden={index !== active} inert={index !== active}>
            <button type="button" onClick={() => setZoomed(true)} aria-label={`Ampliar el mapa de ${map.name}`} tabIndex={index === active ? 0 : -1}>
              <img src={map.url} alt={`Mapa de ${map.name}`} loading={index === 0 ? 'eager' : 'lazy'} draggable={false} />
              <span className="hero-map-expand"><Maximize2 aria-hidden /> Ampliar</span>
              <span className="hero-map-paper-caption"><span>FUR / Mapas del ecosistema</span><strong>{map.name}</strong></span>
            </button>
          </div>
        ))}
      </div>
      <div className="hero-map-detail" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
        <div key={current.name} className="hero-map-detail-text"><h4>{current.name}</h4><p>Explora el mapa de la planta y amplía sus áreas y referencias.</p></div>
      </div>
      <div className="hero-map-controls">
        <div className="hero-map-arrows"><button type="button" onClick={() => move(-1)} aria-label="Planta anterior"><ArrowLeft aria-hidden /></button><button type="button" onClick={() => move(1)} aria-label="Planta siguiente"><ArrowRight aria-hidden /></button></div>
        <div className="hero-map-dots" role="group" aria-label="Elegir mapa de planta">{MAPS.map((map, index) => <button key={map.name} type="button" aria-label={`Ver mapa de ${map.name}`} aria-pressed={active === index} onClick={() => choose(index)}><span /></button>)}</div>
        {!reducedMotion && <button type="button" className="hero-map-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pausar mapas' : 'Reproducir mapas'} aria-pressed={playing}>{playing ? <Pause aria-hidden /> : <Play aria-hidden />}</button>}
      </div>
      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="w-[96vw] max-w-[96vw] gap-2 p-2 sm:max-w-[96vw]">
          <DialogTitle className="sr-only">Mapa de {current.name}</DialogTitle>
          <DialogDescription className="sr-only">Imagen del mapa a tamaño completo.</DialogDescription>
          <div className="max-h-[88vh] overflow-auto rounded-md bg-white"><img src={current.url} alt={`Mapa de ${current.name}`} className="mx-auto h-auto w-full max-w-none" /></div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
