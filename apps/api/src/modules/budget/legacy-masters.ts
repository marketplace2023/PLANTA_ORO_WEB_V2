import { createHash } from 'node:crypto'
import { z } from 'zod'

export const LEGACY_MASTER_FILES = ['lulo_seed_familias.json','lulo_seed_materiales.json','lulo_seed_equipos.json','lulo_seed_mano_obra.json','lulo_seed_partidas.json','lulo_seed_apu.json'] as const
export type LegacyFile = typeof LEGACY_MASTER_FILES[number]
const scalar = z.union([z.string(),z.number().finite()])
const base = z.object({id:z.string().min(1),codigo:scalar,descripcion:z.string()}).passthrough()
const family = base.extend({tipo:z.enum(['material','equipo','manoDeObra'])})
const resource = base.extend({familiaId:z.string(),unidad:z.string().nullable(),precio:scalar,fechaActualizacion:z.string().nullable().optional()})
const item = base.extend({unidad:z.string().nullable(),rendimiento:scalar,precioUnitario:scalar})
const component = z.object({insumoId:z.string(),codigoInsumo:scalar,tipo:z.enum(['material','equipo','manoDeObra']),cantidad:scalar,costoUnitario:scalar.nullable(),subtotal:scalar.nullable()}).passthrough()
const apu = base.extend({descripcion:z.string().nullable(),proyectoId:z.string(),unidad:z.string().nullable(),rendimiento:scalar,precioUnitario:scalar,insumos:z.array(component)})
const TYPES:Record<string,string>={material:'MATERIAL',equipo:'EQUIPMENT',manoDeObra:'LABOR'}
const decimal=(v:string|number,field:string)=>{const s=String(v);if(!/^-?\d+(\.\d+)?$/.test(s)||!Number.isFinite(Number(s)))throw new Error(`${field}: decimal inválido; no se sustituye por cero`);return s}
export type MasterEntry={kind:'FAMILY'|'RESOURCE'|'ITEM'|'APU';resourceType:string;sourceId:string;code:string;name:string;unit:string|null;sourceContext:string;status:'RECOVERED'|'QUARANTINED';issues:string[];data:Record<string,unknown>}
export type RecoveryReport={files:Array<{name:string;sha256:string;bytes:number;records:number}>;counts:Record<string,number>;quarantined:number;issues:Record<string,number>;excluded:string[];currencyStatus:string;priceStatus:string;relationships:{orphanFamilies:number;orphanResources:number};compositionLines:number}
export type RecoveredMasters={fingerprint:string;report:RecoveryReport;entries:MasterEntry[]}

/** Pure recovery: only six master files are accepted; projects, users and budgets never enter this bundle. */
export function recoverLegacyMasters(files:Record<LegacyFile,Buffer>):RecoveredMasters{
  const entries:MasterEntry[]=[];const descriptors:RecoveryReport['files']=[]
  const parse=<T>(name:LegacyFile,schema:z.ZodType<T>):T[]=>{
    const bytes=files[name];if(!bytes)throw new Error(`Falta ${name}`)
    if(bytes.length>40*1024*1024)throw new Error(`${name}: máximo 40 MB`)
    const json=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))
    const validation=z.array(schema).max(100000).safeParse(json)
    if(!validation.success)throw new Error(`${name}: ${validation.error.issues.length} errores de estructura. ${validation.error.issues.slice(0,5).map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}`)
    const rows=validation.data
    descriptors.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,records:rows.length});return rows
  }
  const families=parse('lulo_seed_familias.json',family)
  const materials=parse('lulo_seed_materiales.json',resource)
  const equipment=parse('lulo_seed_equipos.json',resource)
  const labor=parse('lulo_seed_mano_obra.json',resource)
  const items=parse('lulo_seed_partidas.json',item)
  const apus=parse('lulo_seed_apu.json',apu)
  const familiesById=new Map(families.map(r=>[r.id,r]))
  const resourcesByKey=new Map<string,MasterEntry>();const itemsByCode=new Map(items.map(r=>[String(r.codigo),r]))
  const seen=new Set<string>();const relationships={orphanFamilies:0,orphanResources:0}
  const add=(e:MasterEntry)=>{
    const key=JSON.stringify([e.kind,e.resourceType,e.code,e.sourceContext]);if(seen.has(key))throw new Error(`Clave duplicada en origen: ${key}`);seen.add(key)
    if(!e.code.trim())e.issues.push('EMPTY_CODE')
    if(!e.name.trim())e.issues.push('EMPTY_DESCRIPTION')
    if(e.name.includes('\ufffd')||e.unit?.includes('\ufffd'))e.issues.push('DAMAGED_TEXT')
    if((e.kind==='ITEM'||e.kind==='APU'||e.kind==='RESOURCE'&&e.resourceType==='MATERIAL')&&!e.unit?.trim())e.issues.push('MISSING_UNIT')
    e.issues=[...new Set(e.issues)];e.status=e.issues.length?'QUARANTINED':'RECOVERED';entries.push(e);return e
  }
  for(const r of families)add({kind:'FAMILY',resourceType:TYPES[r.tipo],sourceId:r.id,code:String(r.codigo),name:r.descripcion,unit:null,sourceContext:'',status:'RECOVERED',issues:[],data:{originalCode:r.codigo,reference:r.referencia??null}})
  for(const [rows,type] of [[materials,'MATERIAL'],[equipment,'EQUIPMENT'],[labor,'LABOR']] as const){
    for(const r of rows){
      const issues:string[]=[];const price=decimal(r.precio,`${type}.${r.codigo}.precio`)
      if(Number(price)<0)issues.push('NEGATIVE_HISTORICAL_PRICE')
      if(Number(price)===0)issues.push('ZERO_HISTORICAL_PRICE')
      const f=familiesById.get(r.familiaId)
      if(!f||TYPES[f.tipo]!==type){issues.push('MISSING_OR_WRONG_FAMILY');relationships.orphanFamilies++}
      const e=add({kind:'RESOURCE',resourceType:type,sourceId:r.id,code:String(r.codigo),name:r.descripcion,unit:r.unidad,sourceContext:'',status:'RECOVERED',issues,data:{originalCode:r._codigoOriginal??r.codigo,familySourceId:r.familiaId,familyCode:r.codigoFamilia??f?.codigo??null,historicalPrice:price,priceDate:r.fechaActualizacion??null,currency:null,costBasis:'UNVERIFIED',priceStatus:'HISTORICAL_UNVERIFIED',wastePct:r.desperdicio===undefined?null:decimal(r.desperdicio as string|number,'desperdicio')}})
      resourcesByKey.set(`${type}:${r.id}`,e)
    }
  }
  for(const r of items){const yieldValue=decimal(r.rendimiento,`${r.codigo}.rendimiento`);add({kind:'ITEM',resourceType:'',sourceId:r.id,code:String(r.codigo),name:r.descripcion,unit:r.unidad,sourceContext:'',status:'RECOVERED',issues:Number(yieldValue)<=0?['NON_POSITIVE_YIELD']:[],data:{originalCode:r._codigoOriginal??r.codigo,yieldValue,historicalUnitPrice:decimal(r.precioUnitario,'precioUnitario'),currency:null,priceStatus:'HISTORICAL_UNVERIFIED',isSubcontract:r.esSubcontrato??false}})}
  let compositionLines=0
  const variants=new Map<string,number>();for(const r of apus)variants.set(String(r.codigo),(variants.get(String(r.codigo))??0)+1)
  for(const r of apus){
    const code=String(r.codigo);const master=itemsByCode.get(code);const issues:string[]=[]
    if(!master)issues.push('MISSING_MASTER_ITEM')
    if((variants.get(code)??0)>1)issues.push('MULTIPLE_CONTEXTUAL_APUS')
    const yieldValue=decimal(r.rendimiento,`${code}.rendimiento`);if(Number(yieldValue)<=0)issues.push('NON_POSITIVE_YIELD')
    if(!r.insumos.length)issues.push('EMPTY_COMPOSITION')
    const composition=r.insumos.map((c,i)=>{
      compositionLines++;const type=TYPES[c.tipo];const source=resourcesByKey.get(`${type}:${c.insumoId}`)
      if(!source){issues.push('ORPHAN_RESOURCE');relationships.orphanResources++}
      const quantity=decimal(c.cantidad,`${code}.${i}.cantidad`);if(Number(quantity)<=0)issues.push('NON_POSITIVE_QUANTITY')
      if(source?.status==='QUARANTINED')issues.push('RESOURCE_NEEDS_REVIEW')
      return {resourceType:type,resourceSourceId:c.insumoId,code:String(c.codigoInsumo),quantity,historicalUnitCost:c.costoUnitario===null?null:decimal(c.costoUnitario,'costoUnitario'),historicalSubtotal:c.subtotal===null?null:decimal(c.subtotal,'subtotal'),costBasis:'UNVERIFIED'}
    })
    add({kind:'APU',resourceType:'',sourceId:r.id,code,name:master?.descripcion??r.descripcion??'',unit:master?.unidad??r.unidad,sourceContext:r.proyectoId,status:'RECOVERED',issues,data:{masterSourceId:master?.id??null,originalCode:r._codigoOriginal??r.codigo,sourceDescription:r.descripcion,sourceContextId:r.proyectoId,yieldValue,historicalUnitPrice:decimal(r.precioUnitario,'precioUnitario'),currency:null,priceStatus:'HISTORICAL_UNVERIFIED',composition}})
  }
  const counts:Record<string,number>={families:families.length,materials:materials.length,equipment:equipment.length,labor:labor.length,items:items.length,apus:apus.length}
  const issueCounts:Record<string,number>={};for(const e of entries)for(const issue of e.issues)issueCounts[issue]=(issueCounts[issue]??0)+1
  const fingerprint=createHash('sha256').update(JSON.stringify({recoveryVersion:1,files:descriptors.map(d=>[d.name,d.sha256])})).digest('hex')
  return {fingerprint,entries,report:{files:descriptors,counts,compositionLines,quarantined:entries.filter(e=>e.status==='QUARANTINED').length,issues:issueCounts,relationships,excluded:['projects','budgets','clients','users','measurements','valuations','schedule','lulo_seed.json'],currencyStatus:'UNRESOLVED_LEGACY_CURRENCY',priceStatus:'HISTORICAL_UNVERIFIED'}}
}
