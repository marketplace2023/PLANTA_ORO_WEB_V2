import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function MagicSurface({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cn('portal-magic-surface', className)} style={style} onPointerMove={(event) => {
    if (event.pointerType === 'touch') return
    const box = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--light-x', `${event.clientX - box.left}px`)
    event.currentTarget.style.setProperty('--light-y', `${event.clientY - box.top}px`)
  }}>{children}</div>
}

export function BorderBeam() { return <span className="portal-border-beam" aria-hidden><i /></span> }
