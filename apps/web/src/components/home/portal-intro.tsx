import { ArrowRight, ArrowUpRight, Network, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MagicSurface, BorderBeam } from '@/components/ui/magic-surface'
import { useNetworkCatalog, useStageCatalog } from '@/features/catalog/use-catalog'
import { PlantMapCards } from './plant-map-cards'

const livePlantUrl = `${import.meta.env.BASE_URL}${encodeURIComponent('Gemelo digital 3D · Planta CIL de oro 500 t_d.html')}`

export function PortalIntro() {
  const stages = useStageCatalog()
  const networks = useNetworkCatalog()
  return (
    <section className="portal-bento" aria-label="Ecosistema conectado">
      <MagicSurface className="portal-feature">
        <BorderBeam />
        <div className="portal-feature-content">
          <p className="portal-eyebrow"><span />Ecosistema Digital FUR</p>
          <h2>Una planta conectada.<br /><span>Más posibilidades.</span></h2>
          <p>Activos, procesos y conocimiento conectados para llevar tu planta de beneficio al siguiente paso.</p>
          <div className="portal-feature-actions"><Link to="/catalog">Explorar el catálogo <ArrowUpRight aria-hidden /></Link><a className="portal-live-plant" href={livePlantUrl}><span className="portal-live-indicator" aria-hidden="true" />Planta en vivo <ArrowRight aria-hidden /></a></div>
        </div>
        <PlantMapCards />
        <span className="portal-feature-caption">Del mineral a un mayor valor</span>
      </MagicSurface>
      <MagicSurface className="portal-discovery discovery-stages">
        <div className="discovery-icon"><Workflow aria-hidden /><span>Explora el proceso</span></div>
        <div className="discovery-route" aria-hidden><i /><span /><i /><span /><i /></div>
        <h3>De principio a fin.</h3>
        <p>{stages.data ? `${stages.data.length} etapas para conocer cómo se transforma el mineral.` : 'Conoce las etapas de transformación del mineral.'}</p>
        <a href="#stages-title">Ver las etapas <ArrowUpRight aria-hidden /></a>
      </MagicSurface>
      <MagicSurface className="portal-discovery discovery-networks">
        <div className="discovery-icon"><Network aria-hidden /><span>Conecta especialidades</span></div>
        <h3>Una red de posibilidades.</h3>
        <p>{networks.data ? `${networks.data.length} redes que conectan la operación de tu planta.` : 'Especialidades que conectan la operación de tu planta.'}</p>
        <a href="#networks-title">Explorar las redes <ArrowUpRight aria-hidden /></a>
      </MagicSurface>
    </section>
  )
}
