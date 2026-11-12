import { createHash } from 'node:crypto'
import MDBReader from 'mdb-reader'
import { recoverLegacyMasters, type LegacyFile } from './legacy-masters'

type Row=Record<string,unknown>
const key=(r:Row,k:string)=>{const v=r[k];if(typeof v!=='string'||!v.trim())throw new Error(`${k}: código original ausente`);return v.trim()}
const value=(r:Row,k:string)=>{const v=r[k];if(typeof v!=='number'&&typeof v!=='string')throw new Error(`${k}: valor numérico original ausente`);return v}
const desc=(r:Row)=>typeof r.Descri==='string'?r.Descri:''
const unit=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null
const date=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):null
const TYPE:Record<string,string>={'1':'material','2':'equipo','3':'manoDeObra'}
const RESOURCE_TABLE={material:'ObraMate',equipo:'ObraEqui',manoDeObra:'ObraMano'} as const
type ResourceKind=keyof typeof RESOURCE_TABLE

/** Reads only master tables. Never reads users, banks, clients, private project headers or project APU snapshots. */
export function recoverNativeMdb(buffer:Buffer){
  const reader=new MDBReader(buffer)
  const table=(name:string)=>reader.getTable(name).getData() as Row[]
  const families=table('ObraFami').map(r=>{const tipo=TYPE[String(r.TipIns)];if(!tipo)throw new Error('Tipo de familia no reconocido');return {id:`mdb:family:${tipo}:${key(r,'CodFam')}`,codigo:key(r,'CodFam'),descripcion:desc(r),tipo,referencia:r.RefFam??null}})
  const resources=new Map<string,Row>()
  const convert=(type:ResourceKind,codeKey:string,priceKey:string,dateKey:string)=>table(RESOURCE_TABLE[type]).map(r=>{
    const codigo=key(r,codeKey);resources.set(`${type}:${codigo}`,r)
    return {id:`mdb:${type}:${codigo}`,codigo,descripcion:desc(r),familiaId:`mdb:family:${type}:${key(r,'CodFam')}`,codigoFamilia:key(r,'CodFam'),unidad:type==='material'?unit(r.UniMat):null,precio:value(r,priceKey),fechaActualizacion:date(r[dateKey]),_codigoOriginal:codigo,...(type==='material'?{desperdicio:value(r,'Desper')}:{})}
  })
  const materials=convert('material','CodMat','CosMat','FecMat'),equipment=convert('equipo','CodEqu','CosEqu','FecEqu'),labor=convert('manoDeObra','CodMan','Salari','FecMan')
  const sourceItems=table('ObraPart')
  const items=sourceItems.map(r=>({id:`mdb:item:${key(r,'CodPar')}`,codigo:key(r,'CodPar'),descripcion:desc(r),unidad:unit(r.UniPar),rendimiento:value(r,'RenPar'),precioUnitario:value(r,'PreUni'),_codigoOriginal:key(r,'CodPar')}))
  const compositions=new Map<string,Array<Record<string,unknown>>>()
  const masterTables=['ObraFami','ObraMate','ObraEqui','ObraMano','ObraPart']
  for(const [type,name] of [['material','ObraPainMate'],['equipo','ObraPainEqui'],['manoDeObra','ObraPainMano']] as const){
    masterTables.push(name)
    for(const r of table(name)){
      const code=key(r,'CodPar'),resourceCode=typeof r.CodIns==='string'?r.CodIns.trim():''
      const list=compositions.get(code)??[]
      list.push({insumoId:resourceCode?`mdb:${type}:${resourceCode}`:`mdb:missing:${name}:${String(r.Contad)}`,codigoInsumo:resourceCode,tipo:type,cantidad:value(r,'CanIns'),costoUnitario:null,subtotal:null,...(type==='material'?{sourceWastePct:value(r,'Desper')}:{ }),...(type==='equipo'?{sourceDepreciation:value(r,'Deprec')}:{})})
      compositions.set(code,list)
    }
  }
  const apus=items.map(i=>({id:`mdb:apu:${i.codigo}`,proyectoId:'MASTER',codigo:i.codigo,descripcion:i.descripcion,unidad:i.unidad,rendimiento:i.rendimiento,precioUnitario:i.precioUnitario,insumos:compositions.get(i.codigo)??[]}))
  const availableCodes=new Set(items.map(i=>i.codigo))
  if([...compositions.keys()].some(code=>!availableCodes.has(code)))throw new Error('Hay composición maestra sin partida; revisar antes de incorporar el lote')
  const virtualFiles={'lulo_seed_familias.json':families,'lulo_seed_materiales.json':materials,'lulo_seed_equipos.json':equipment,'lulo_seed_mano_obra.json':labor,'lulo_seed_partidas.json':items,'lulo_seed_apu.json':apus}
  const recovered=recoverLegacyMasters(Object.fromEntries(Object.entries(virtualFiles).map(([n,v])=>[n,Buffer.from(JSON.stringify(v),'utf8')])) as Record<LegacyFile,Buffer>)
  for(const e of recovered.entries){
    if(e.kind==='RESOURCE'){
      const type:ResourceKind=e.resourceType==='MATERIAL'?'material':e.resourceType==='EQUIPMENT'?'equipo':'manoDeObra'
      const r=resources.get(`${type}:${e.code}`)!
      e.data={...e.data,sourceTable:RESOURCE_TABLE[type],originalUnit:type==='material'?r.UniMat:null,unitStatus:type==='material'?'SOURCE':'NOT_DEFINED_IN_SOURCE',...(type==='equipo'?{acquisitionCost:r.CosEqu,sourceDailyCost:r.CosDia,sourceDepreciation:r.Deprec,sourceTransportation:r.Transp,historicalPriceMeaning:'CosEqu: adquisición; no tarifa horaria'}:{}),...(type==='manoDeObra'?{sourceSalary:r.Salari,historicalPriceMeaning:'Salari: período pendiente de validar'}:{})}
    }
    if(e.kind==='APU'){
      const raw=compositions.get(e.code)??[]
      e.data={...e.data,sourceTable:'ObraPart + ObraPain*',composition:(e.data.composition as Array<Record<string,unknown>>).map((c,i)=>({...c,...(raw[i].sourceWastePct!==undefined?{sourceWastePct:raw[i].sourceWastePct}:{}),...(raw[i].sourceDepreciation!==undefined?{sourceDepreciation:raw[i].sourceDepreciation}:{})}))}
    }
  }
  const digest=createHash('sha256').update(buffer).digest('hex')
  recovered.fingerprint=createHash('sha256').update(JSON.stringify({sourceFormat:'MDB',sha256:digest,extractorVersion:1})).digest('hex')
  recovered.report.files=[{name:'LULO.MDB',sha256:digest,bytes:buffer.length,records:recovered.entries.length}]
  recovered.report.excluded=[...recovered.report.excluded,'ObraApun','ObraApin*','ObraProy','ObraMisc','ObraUsua','ObraSegu','ObraBanc','ObraClie','ObraProv']
  return {...recovered,masterTables}
}
