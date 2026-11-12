import { BrandLogo } from './brand-logo'
import { Link, Outlet } from 'react-router-dom'
import { ArrowLeft, Boxes, Factory, Network, Users, Workflow } from 'lucide-react'
import { BorderBeam } from '@/components/ui/magic-surface'

/**
 * Acceso al ecosistema: presentación visual y formulario, sin navegación operativa.
 */
export function AuthLayout() {
  return (
    <div className="auth-experience">
      <header className="auth-experience-header">
        <BrandLogo />
        <Link to="/" className="auth-back"><ArrowLeft aria-hidden /> Volver al inicio</Link>
      </header>
      <aside className="auth-story" aria-labelledby="auth-story-title">
        <div className="auth-story-content">
          <p className="auth-story-eyebrow"><span /> Ecosistema Digital FUR</p>
          <h2 id="auth-story-title">Tu planta.<br />Tu equipo.<br /><span>Todo conectado.</span></h2>
          <p className="auth-story-description">El punto de encuentro entre tus activos, los procesos y las personas que hacen posible la operación.</p>
          <div className="auth-network-art" aria-hidden>
            <BorderBeam />
            <div className="auth-art-heading"><span /><span /><span /><small>FUR / Un ecosistema compartido</small></div>
            <div className="auth-art-canvas">
              <svg viewBox="0 0 420 190" preserveAspectRatio="none"><path d="M 82 45 C 155 45 155 95 210 95 M 82 145 C 155 145 155 95 210 95 M 210 95 C 275 95 265 45 338 45 M 210 95 C 275 95 265 145 338 145" className="auth-art-track" /><path d="M 82 45 C 155 45 155 95 210 95 M 82 145 C 155 145 155 95 210 95 M 210 95 C 275 95 265 45 338 45 M 210 95 C 275 95 265 145 338 145" className="auth-art-beam" /></svg>
              <span className="auth-art-core"><Factory /><strong>FUR</strong></span>
              <span className="auth-art-node art-assets"><Boxes /><small>Activos</small></span>
              <span className="auth-art-node art-process"><Workflow /><small>Procesos</small></span>
              <span className="auth-art-node art-people"><Users /><small>Personas</small></span>
              <span className="auth-art-node art-networks"><Network /><small>Conocimiento</small></span>
            </div>
            <p>Una cuenta. Todas las posibilidades.</p>
          </div>
        </div>
        <p className="auth-story-footer">Del mineral a un mayor valor <span>Planta de Beneficio de Oro</span></p>
      </aside>
      <main className="auth-workspace">
        <div className="auth-form-container"><Outlet /></div>
        <p className="auth-workspace-footer">FUR · Ecosistema Digital</p>
      </main>
    </div>
  )
}
