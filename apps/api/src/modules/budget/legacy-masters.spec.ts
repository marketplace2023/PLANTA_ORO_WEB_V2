import { recoverLegacyMasters } from './legacy-masters'
import { recoveryFixture } from '../../../test/fixtures/lulo-masters'

describe('Recovering LULO masters',()=>{
  it('preserves codes, decimals, original APU context and unresolved historical currency',()=>{
    const r=recoverLegacyMasters(recoveryFixture());expect(r.report.counts).toMatchObject({families:3,materials:1,items:1,apus:1});expect(r.report.quarantined).toBe(0)
    const resource=r.entries.find(e=>e.kind==='RESOURCE')!;expect(resource.code).toBe('001');expect(resource.data).toMatchObject({historicalPrice:'12.5000',currency:null,costBasis:'UNVERIFIED'})
    expect(r.entries.find(e=>e.kind==='APU')).toMatchObject({name:'Instalación mecánica',sourceContext:'original-context'})
    expect(r.report.excluded).toContain('projects')
  })
  it('quarantines damaged text and dependent compositions rather than inventing a correction',()=>{
    const f=recoveryFixture(),m=JSON.parse(f['lulo_seed_materiales.json'].toString());m[0].descripcion='Acero \ufffd';f['lulo_seed_materiales.json']=Buffer.from(JSON.stringify(m));const r=recoverLegacyMasters(f)
    expect(r.entries.find(e=>e.kind==='RESOURCE')!.issues).toContain('DAMAGED_TEXT');expect(r.entries.find(e=>e.kind==='APU')!.issues).toContain('RESOURCE_NEEDS_REVIEW')
    expect(r.entries.find(e=>e.kind==='RESOURCE')!.name).toBe('Acero \ufffd')
  })
  it('keeps missing references and zero quantities visible in the recovered composition',()=>{
    const f=recoveryFixture(),a=JSON.parse(f['lulo_seed_apu.json'].toString());a[0].insumos[0]={...a[0].insumos[0],cantidad:0,insumoId:'missing',costoUnitario:null,subtotal:null};f['lulo_seed_apu.json']=Buffer.from(JSON.stringify(a));const r=recoverLegacyMasters(f)
    expect(r.report.relationships.orphanResources).toBe(1);expect(r.entries.find(e=>e.kind==='APU')!.issues).toEqual(expect.arrayContaining(['ORPHAN_RESOURCE','NON_POSITIVE_QUANTITY']));expect((r.entries.find(e=>e.kind==='APU')!.data.composition as object[])).toHaveLength(1)
  })
  it('does not merge contextual APU variants and rejects duplicate composite keys',()=>{
    const f=recoveryFixture(),a=JSON.parse(f['lulo_seed_apu.json'].toString());a.push({...a[0],id:'a2',proyectoId:'other-context'});f['lulo_seed_apu.json']=Buffer.from(JSON.stringify(a));expect(recoverLegacyMasters(f).report.issues.MULTIPLE_CONTEXTUAL_APUS).toBe(2)
    a.push({...a[0],id:'a3'});f['lulo_seed_apu.json']=Buffer.from(JSON.stringify(a));expect(()=>recoverLegacyMasters(f)).toThrow('Clave duplicada')
  })
  it('produces stable file fingerprints, bounds structural errors and never defaults invalid costs to zero',()=>{
    const f=recoveryFixture();expect(recoverLegacyMasters(f).fingerprint).toBe(recoverLegacyMasters(f).fingerprint)
    const m=JSON.parse(f['lulo_seed_materiales.json'].toString());m[0].precio='no válido';f['lulo_seed_materiales.json']=Buffer.from(JSON.stringify(m));expect(()=>recoverLegacyMasters(f)).toThrow('no se sustituye por cero')
  })
})
