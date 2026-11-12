import { commercialSchema,variantSchema,money } from './commerce.schemas'
describe('Commercial field validation',()=>{
 it('keeps monetary values in cents and rejects tiny or imprecise prices',()=>{for(const valid of [0,0.01,25.99,1000000000000])expect(money.safeParse(valid).success).toBe(true);for(const invalid of [1e-8,NaN,Infinity,-1,1.234])expect(money.safeParse(invalid).success).toBe(false)})
 it('validates catalogue-compatible primitives without requiring a catalogue model',()=>{expect(commercialSchema.parse({brand:'My brand',model:'My model',specifications:[{label:'Voltage',type:'RANGE',value:{min:220,max:440}}]})).toMatchObject({brand:'My brand',saleMode:'QUOTE'});expect(commercialSchema.safeParse({specifications:[{label:'Invalid',type:'RANGE',value:{min:10,max:1}}]}).success).toBe(false);expect(variantSchema.safeParse({sku:'SKU',name:'Standard',price:10,stock:-1}).success).toBe(false)})
})
