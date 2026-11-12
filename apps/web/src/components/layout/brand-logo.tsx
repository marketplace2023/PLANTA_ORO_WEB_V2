import { Link } from 'react-router-dom'

export function BrandLogo() {
  return (
    <Link to="/" className="brand-logo" aria-label="Ecosistema FUR — inicio">
      <img src="/brand/fur-mark.svg" alt="" width="64" height="44" />
      <span><strong>FUR</strong><span>Ecosistema Digital</span><small>Planta de Beneficio de Oro</small></span>
    </Link>
  )
}
