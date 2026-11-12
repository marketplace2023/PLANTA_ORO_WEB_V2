import { Leaf } from 'lucide-react'
import { BrandLogo } from './brand-logo'

export function AppFooter() {
  return <footer className="app-footer"><BrandLogo /><p>Minería digital, más oro, mayor eficiencia</p><span className="footer-motto"><Leaf aria-hidden /> Operación sostenible<br />para un mejor mañana</span></footer>
}
