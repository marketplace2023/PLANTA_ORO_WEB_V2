import MDBReader from 'mdb-reader'
import { recoverNativeMdb } from './native-mdb-masters'
jest.mock('mdb-reader',()=>({__esModule:true,default:jest.fn()}))
describe('Native MDB masters',()=>{
  const tables:Record<string,object[]>={
    ObraFami:[{CodFam:'00',TipIns:'1',Descri:'Materiales'},{CodFam:'00',TipIns:'2',Descri:'Equipos'},{CodFam:'00',TipIns:'3',Descri:'Mano de obra'}],
    ObraMate:[{CodMat:'M01',CodFam:'00',Descri:'Ángulo metálico',UniMat:'KG',CosMat:12,Desper:5,FecMat:new Date('2015-01-01')}],
    ObraEqui:[{CodEqu:'E01',CodFam:'00',Descri:'Equipo',CosEqu:100,CosDia:0.25,Deprec:0.0025,Transp:0,FecEqui:null}],
    ObraMano:[{CodMan:'L01',CodFam:'00',Descri:'Técnico',Salari:80}],
    ObraPart:[{CodPar:'P01',Descri:'Montaje mecánico',UniPar:'UND',RenPar:2,PreUni:100}],
    ObraPainMate:[{CodPar:'P01',CodIns:'M01',CanIns:2,Desper:5}],
    ObraPainEqui:[{CodPar:'P01',CodIns:'E01',CanIns:1,Deprec:0.005}],
    ObraPainMano:[{CodPar:'P01',CodIns:'L01',CanIns:1}],
  }
  it('recovers original accented descriptions, equipment cost concepts and master-level compositions without reading private project tables',()=>{
    const requested:string[]=[]
    jest.mocked(MDBReader).mockImplementation(()=>({getTable:(name:string)=>{requested.push(name);if(!tables[name])throw new Error('Private table read');return {getData:()=>tables[name]}}}) as unknown as MDBReader)
    const r=recoverNativeMdb(Buffer.from('fixture database'))
    expect(r.report.files[0].name).toBe('LULO.MDB');expect(r.report.issues.DAMAGED_TEXT).toBeUndefined();expect(requested).not.toContain('ObraProy');expect(requested).not.toContain('ObraApun')
    expect(r.entries.find(e=>e.kind==='RESOURCE'&&e.resourceType==='EQUIPMENT')!.data).toMatchObject({acquisitionCost:100,sourceDailyCost:0.25,sourceDepreciation:0.0025,currency:null})
    const apu=r.entries.find(e=>e.kind==='APU')!;expect(apu.name).toBe('Montaje mecánico');expect(apu.sourceContext).toBe('MASTER');expect((apu.data.composition as Array<Record<string,unknown>>)[1]).toMatchObject({sourceDepreciation:0.005,historicalUnitCost:null})
  })
})
