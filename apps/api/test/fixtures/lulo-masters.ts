import { LEGACY_MASTER_FILES, type LegacyFile } from '../../src/modules/budget/legacy-masters'

export function recoveryFixture():Record<LegacyFile,Buffer>{
  const family=[{id:'fm',codigo:'01',descripcion:'Metales',tipo:'material'},{id:'fe',codigo:'01',descripcion:'Equipos',tipo:'equipo'},{id:'fl',codigo:'01',descripcion:'Personal',tipo:'manoDeObra'}]
  const resources=[{id:'m',codigo:'001',descripcion:'Acero',familiaId:'fm',unidad:'KG',precio:'12.5000',fechaActualizacion:'2015-01-01'}]
  const items=[{id:'i',codigo:'P001',descripcion:'Instalación mecánica',unidad:'UND',rendimiento:2,precioUnitario:100}]
  const apus=[{id:'a',codigo:'P001',descripcion:null,unidad:'UND',proyectoId:'original-context',rendimiento:2,precioUnitario:100,insumos:[{insumoId:'m',codigoInsumo:'001',tipo:'material',cantidad:2,costoUnitario:'12.5000',subtotal:25}]}]
  return Object.fromEntries(LEGACY_MASTER_FILES.map((n,i)=>[n,Buffer.from(JSON.stringify([family,resources,[],[],items,apus][i]))])) as Record<LegacyFile,Buffer>
}
