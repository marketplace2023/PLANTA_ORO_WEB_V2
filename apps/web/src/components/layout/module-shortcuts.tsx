import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PORTAL_NAV_GROUPS, navTarget, type NavItem } from '@/lib/nav'
import { usePlant } from '@/features/plant/plant-context'
import { useIsAnonymous } from '@/features/auth/auth-context'

function CategoryCarousel({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  useEffect(() => {
    const element = track.current
    if (!element) return
    const measure = () => setEdges({ start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    element.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', measure)
    }
  }, [])

  const behavior = (): ScrollBehavior => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  const move = (direction: number) => {
    const element = track.current
    if (!element) return
    const first = element.firstElementChild
    const step = (first?.getBoundingClientRect().width ?? 0) + (parseFloat(getComputedStyle(element).columnGap) || 0)
    const distance = step > 0 ? Math.max(1, Math.floor(element.clientWidth / step)) * step : element.clientWidth
    element.scrollBy({ left: direction * distance, behavior: behavior() })
  }

  return (
    <nav className="module-shortcuts category-carousel" data-variant="featured" aria-label="Explorar el ecosistema">
      <div className="category-carousel-heading">
        <p>Explora las categorías</p>
        <div className="category-carousel-controls">
          <button type="button" aria-label="Categorías anteriores" aria-controls="category-carousel-track" disabled={edges.start} onClick={() => move(-1)}><ArrowLeft aria-hidden /></button>
          <button type="button" aria-label="Categorías siguientes" aria-controls="category-carousel-track" disabled={edges.end} onClick={() => move(1)}><ArrowRight aria-hidden /></button>
        </div>
      </div>
      <div className="module-group-links category-carousel-track" id="category-carousel-track" ref={track} role="group" aria-roledescription="carrusel" aria-label="Todas las categorías" tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            move(event.key === 'ArrowLeft' ? -1 : 1)
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            track.current?.scrollTo({ left: event.key === 'Home' ? 0 : track.current.scrollWidth, behavior: behavior() })
          }
        }}>
        {children}
      </div>
    </nav>
  )
}

/** Accesos visuales a los módulos existentes, conservando el contexto de planta. */
export function ModuleShortcuts({ variant = 'compact' }: { variant?: 'compact' | 'featured' | 'icons' }) {
  const { currentPlant } = usePlant()
  const anonymous = useIsAnonymous()
  const renderShortcut = (item: NavItem) => {
    const content = variant === 'icons' ? <>
      <span className="module-shortcut-icon"><item.icon aria-hidden /></span>
      <span className="module-shortcut-label">{item.label}</span>
    </> : <>
      <span className="module-shortcut-art">
        {/* La etiqueta del enlace ya identifica la categoría para lectores de pantalla. */}
        <img src={item.image} alt="" width={1600} height={900} loading="lazy" decoding="async" />
        <span className="module-shortcut-glint" aria-hidden />
      </span>
      <span className="module-shortcut-caption">
        <span className="module-shortcut-label">{item.label}</span>
        <ArrowUpRight className="module-shortcut-arrow" aria-hidden />
      </span>
    </>
    const to = anonymous && item.path === 'budgets' ? '/budgets' : navTarget(item, currentPlant?.slug)
    return item.scope === 'plant' && !currentPlant && !item.globalPath
      ? <Link key={item.path} to={to} className="module-shortcut" title="Elige una planta para abrir esta sección">{content}</Link>
      : <NavLink key={item.path} to={to} className="module-shortcut">{content}</NavLink>
  }

  if (variant === 'featured') {
    return <CategoryCarousel>{PORTAL_NAV_GROUPS.flatMap((group) => group.items).map(renderShortcut)}</CategoryCarousel>
  }

  return (
    <nav className="module-shortcuts" data-variant={variant} aria-label="Explorar el ecosistema">
      {PORTAL_NAV_GROUPS.map((group) => (
        <div key={group.id} className="module-shortcut-group" role="group" aria-label={group.label}>
          <div className="module-group-heading">
            <p className="module-group-title"><group.icon aria-hidden />{group.label}</p>
          </div>
          <div className="module-group-links">
            {group.items.map(renderShortcut)}
          </div>
        </div>
      ))}
    </nav>
  )
}
