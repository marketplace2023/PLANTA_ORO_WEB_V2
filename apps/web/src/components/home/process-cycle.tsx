import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Pause, Play, Repeat2 } from 'lucide-react'
import type { StageMaster } from '@/features/catalog/use-catalog'
import { stageGroupLabel } from '@/lib/stage-groups'
import { Button } from '@/components/ui/button'

const NODE_HEIGHT = 108
const GAP = 36
const PADDING = 32

/** Recorrido del catálogo: mantiene el orden de lectura aunque el trazado serpentee. */
export function ProcessCycle({ stages, onSelect, suspended = false }: {
  stages: StageMaster[]
  onSelect: (stage: StageMaster) => void
  suspended?: boolean
}) {
  const ordered = [...stages].sort((a, b) => a.sequenceDefault - b.sequenceDefault)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [width, setWidth] = useState(0)
  const canvas = useRef<HTMLDivElement>(null)
  const markerId = useId().replaceAll(':', '')
  const active = Math.max(0, ordered.findIndex((stage) => stage.id === activeId))
  const running = !paused && !suspended && !reducedMotion
  const sequenceKey = ordered.map((stage) => stage.id).join(',')
  const hasStages = ordered.length > 0

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const measure = () => setWidth(element.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasStages])

  useEffect(() => {
    if (!running || stages.length < 2) return
    const ids = [...stages].sort((a, b) => a.sequenceDefault - b.sequenceDefault).map((stage) => stage.id)
    const timer = window.setInterval(() => {
      setActiveId((previous) => ids[(Math.max(0, ids.indexOf(previous ?? '')) + 1) % ids.length])
    }, 2400)
    return () => window.clearInterval(timer)
  }, [running, sequenceKey, stages])

  const columns = width >= 1000 ? 4 : width >= 740 ? 3 : width >= 480 ? 2 : 1
  const rows = Math.ceil(ordered.length / columns)
  const height = rows * NODE_HEIGHT + Math.max(0, rows - 1) * GAP + PADDING * 2
  const nodeWidth = (width - PADDING * 2 - (columns - 1) * GAP) / columns
  const position = (index: number) => {
    const row = Math.floor(index / columns)
    const column = row % 2 === 0 ? index % columns : columns - 1 - index % columns
    return { row, column, x: PADDING + column * (nodeWidth + GAP), y: PADDING + row * (NODE_HEIGHT + GAP) }
  }
  const connections = ordered.slice(0, -1).map((stage, index) => {
    const from = position(index)
    const to = position(index + 1)
    const forward = from.row % 2 === 0
    const path = from.row === to.row
      ? `M ${from.x + (forward ? nodeWidth : 0)} ${from.y + NODE_HEIGHT / 2} H ${to.x + (forward ? 0 : nodeWidth)}`
      : `M ${from.x + nodeWidth / 2} ${from.y + NODE_HEIGHT} V ${to.y}`
    return { id: stage.id, path, active: active === index }
  })
  const last = position(Math.max(0, ordered.length - 1))
  const loop = `M ${last.x + nodeWidth / 2} ${last.y + NODE_HEIGHT} V ${height - 12} H 12 Q 6 ${height - 12} 6 ${height - 20} V 16 Q 6 8 16 8 H ${PADDING + nodeWidth / 2} V ${PADDING}`

  if (!ordered.length) return <p className="process-cycle-empty">Aún no hay etapas registradas.</p>

  return (
    <div className="process-cycle" data-running={running}>
      <div className="process-cycle-toolbar">
        <p><Repeat2 aria-hidden /><span>Un proceso conectado<span>Selecciona una etapa para explorar su ficha</span></span></p>
        <div className="process-cycle-controls">
          <span className="process-cycle-counter">{String(active + 1).padStart(2, '0')} <span>/ {String(ordered.length).padStart(2, '0')} etapas</span></span>
          {!reducedMotion && <Button variant="outline" size="sm" onClick={() => setPaused(!paused)} aria-label={paused ? 'Reanudar recorrido' : 'Pausar recorrido'}>{paused ? <Play /> : <Pause />}{paused ? 'Reanudar' : 'Pausar'}</Button>}
        </div>
      </div>
      <div ref={canvas} className="process-cycle-canvas" style={{ '--cycle-columns': columns } as CSSProperties}>
        {width > 0 && ordered.length > 1 && (
          <svg className="process-cycle-connections" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" strokeWidth="1.7" /></marker></defs>
            <path d={loop} className={`cycle-return ${active === ordered.length - 1 ? 'is-active' : ''}`} markerEnd={`url(#${markerId})`} />
            {connections.map((connection) => <g key={connection.id}><path d={connection.path} className={`cycle-connection ${connection.active ? 'is-active' : ''}`} markerEnd={`url(#${markerId})`} />{connection.active && <circle r="3" className="cycle-particle" style={{ offsetPath: `path('${connection.path}')` }} />}</g>)}
          </svg>
        )}
        <ol className="process-cycle-nodes" aria-label="Recorrido de las etapas del proceso">
          {ordered.map((stage, index) => {
            const { row, column } = position(index)
            return (
              <li key={stage.id} style={{ gridRow: row + 1, gridColumn: column + 1 }}>
                <button type="button" className="process-cycle-node" data-highlighted={index === active} onClick={() => { setActiveId(stage.id); onSelect(stage) }} aria-label={`Ver la etapa ${stage.code}: ${stage.name}`}>
                  <span className="cycle-node-top"><span className="fur-code">{stage.code}</span><span className="cycle-node-group">{stageGroupLabel(stage.stageGroup)}</span><ArrowRight aria-hidden /></span>
                  <span className="cycle-node-name">{stage.name}</span>
                  <span className="cycle-node-dot" aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="process-cycle-legend"><span><i /> Recorrido visual de las etapas</span><span><Repeat2 aria-hidden /> Ciclo continuo</span></div>
    </div>
  )
}
