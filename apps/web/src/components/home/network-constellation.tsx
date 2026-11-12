import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowUpRight, Cable, Camera, ClipboardCheck, FlaskConical, Network, Pause, Play, Radio, Settings2, ShoppingBag, ShoppingCart, Wrench, Zap, type LucideIcon } from 'lucide-react'
import type { NetworkMaster } from '@/features/catalog/use-catalog'
import { networkColor } from '@/lib/process'
import { Button } from '@/components/ui/button'

const ICONS: Record<string, LucideIcon> = {
  'FUR-PROC': Settings2, 'FUR-PTE': Zap, 'FUR-IOT': Radio, 'FUR-GPON': Cable,
  'FUR-CC': ClipboardCheck, 'FUR-LAB': FlaskConical, 'FUR-MNT': Wrench,
  'FUR-RQ': ShoppingCart, 'FUR-OF': ShoppingBag, 'FUR-CAM': Camera,
}
const NODE_HEIGHT = 84
const GAP = 16

/** Todas las redes comparten un núcleo visual; las conexiones no representan un orden de proceso. */
export function NetworkConstellation({ networks, onSelect, suspended = false }: {
  networks: NetworkMaster[]
  onSelect: (network: NetworkMaster) => void
  suspended?: boolean
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [width, setWidth] = useState(0)
  const map = useRef<HTMLDivElement>(null)
  const activeId = focusedId ?? hoveredId
  const hasNetworks = networks.length > 0
  const rows = Math.ceil(networks.length / 2)
  const nodesHeight = rows * NODE_HEIGHT + Math.max(0, rows - 1) * GAP
  const height = Math.max(240, nodesHeight)

  useEffect(() => {
    const element = map.current
    if (!element) return
    const measure = () => setWidth(element.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasNetworks])

  if (!hasNetworks) return <p className="network-empty">Aún no hay redes registradas.</p>

  return (
    <div className="network-constellation" data-paused={paused || suspended}>
      <div className="network-toolbar">
        <div><span className="network-eyebrow">Conexiones que dan valor</span><p>Un ecosistema. Múltiples especialidades.</p><span className="network-subtitle">Explora cada red y descubre su función en la planta.</span></div>
        <Button variant="outline" size="sm" onClick={() => setPaused(!paused)} aria-label={paused ? 'Reanudar animación de redes' : 'Pausar animación de redes'}>{paused ? <Play /> : <Pause />}{paused ? 'Reanudar' : 'Pausar'}</Button>
      </div>
      <div className="network-map" ref={map} style={{ '--network-rows': rows } as CSSProperties} data-emphasized={activeId !== null}>
        {width > 0 && <svg className="network-links" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {networks.map((network, index) => {
            const left = index < rows
            const y = (height - nodesHeight) / 2 + (index % rows) * (NODE_HEIGHT + GAP) + NODE_HEIGHT / 2
            const x = left ? (width - 332) / 2 : (width + 332) / 2
            const startX = width / 2 + (left ? -76 : 76)
            const bend = left ? startX - 48 : startX + 48
            const path = `M ${startX} ${height / 2} C ${bend} ${height / 2}, ${bend} ${y}, ${x} ${y}`
            return <g key={network.id} className="network-link" data-active={activeId === network.id} style={{ '--network-color': networkColor(network.colorToken), '--network-delay': `${index * -.45}s` } as CSSProperties}><path d={path} className="network-link-base" /><path d={path} className="network-link-signal" /><circle cx={x} cy={y} r="3" /></g>
          })}
        </svg>}
        <div className="network-hub">
          <span className="network-orbit network-orbit-outer" aria-hidden /><span className="network-orbit network-orbit-inner" aria-hidden />
          <div className="network-core"><Network aria-hidden /><strong>FUR</strong><span>Ecosistema conectado</span><small>{networks.length} {networks.length === 1 ? 'red transversal' : 'redes transversales'}</small></div>
        </div>
        <ul className="network-nodes" aria-label="Redes del ecosistema">
          {networks.map((network, index) => {
            const Icon = ICONS[network.code] ?? Network
            return <li key={network.id} style={{ '--network-column': index < rows ? 1 : 3, '--network-row': index % rows + 1, '--network-color': networkColor(network.colorToken) } as CSSProperties}>
              <button className="network-node" data-active={activeId === network.id} type="button" aria-label={`Ver la red ${network.code}: ${network.name}`} onClick={() => onSelect(network)} onMouseEnter={() => setHoveredId(network.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setFocusedId(network.id)} onBlur={() => setFocusedId(null)}>
                <span className="network-node-icon"><Icon aria-hidden /></span>
                <span className="network-node-copy"><span className="fur-code">{network.code}</span><strong>{network.name}</strong></span>
                <ArrowUpRight className="network-node-arrow" aria-hidden />
              </button>
            </li>
          })}
        </ul>
      </div>
      <p className="network-legend"><span aria-hidden /> Especialidades conectadas a la planta <span className="network-legend-hint">Selecciona una red para ver su ficha <ArrowUpRight aria-hidden /></span></p>
    </div>
  )
}
