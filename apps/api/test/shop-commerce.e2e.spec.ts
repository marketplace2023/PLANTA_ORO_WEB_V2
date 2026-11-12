import {randomUUID} from 'node:crypto'
import type {INestApplication} from '@nestjs/common'
import request from 'supertest'
import {bearer,createApp,login,Session,TestDb} from './helpers'
describe('Store commerce',()=>{
 let app:INestApplication,db:TestDb,admin:Session,seller:Session,buyer:Session,other:Session,provider:string,family:string
 const call=(method:'get'|'post'|'patch'|'delete',path:string,session:Session,body:object={})=>request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization',bearer(session)).send(body)
 const settings={bank:'Bank',beneficiary:'E2E Store',account:'123456',instructions:'Use order number',currency:'USD',shippingFee:5,coverage:'Test city'}
 const address={name:'Buyer',phone:'123456',country:'VE',city:'Test city',address:'Test address'}
 const product=async(mode='DIRECT',stock=4)=>{
  const p=await call('post',`/providers/${provider}/listings`,seller,{title:'E2E Store Product',assetFamilyCode:family,currency:'USD',price:25}).expect(201)
  await call('patch',`/providers/${provider}/commerce/products/${p.body.id}`,seller,{brand:'Independent brand',model:'My model',saleMode:mode,specifications:[{label:'Power',type:'NUMBER',unit:'kW',value:12},{label:'Range',type:'RANGE',unit:'m',value:{min:1,max:2}},{label:'Safety',type:'BOOLEAN',value:true},{label:'Materials',type:'LIST',value:['Steel']},{label:'Use',type:'TEXT',value:'Mining'}]}).expect(200)
  const saved=await call('patch',`/providers/${provider}/commerce/products/${p.body.id}/variants`,seller,{variants:[{sku:randomUUID(),name:'Standard',price:25,stock}]}).expect(200)
  await call('patch',`/providers/${provider}/listings/${p.body.id}`,seller,{status:'ACTIVE'}).expect(200)
  return {id:p.body.id,variantId:saved.body.variants[0].id}
 }
 const checkout=(p:{variantId:string},over:object={})=>({key:randomUUID(),providerId:provider,mode:'DIRECT',expectedTotal:55,lines:[{variantId:p.variantId,quantity:2}],address,...over})
 beforeAll(async()=>{app=await createApp();db=new TestDb();await db.cleanup();await db.user('shop-admin',{isGlobalAdmin:true});for(const name of ['shop-seller','shop-buyer','shop-other'])await db.user(name);admin=await login(app,'shop-admin');seller=await login(app,'shop-seller');buyer=await login(app,'shop-buyer');other=await login(app,'shop-other');family=(await call('get','/catalog/families',admin)).body[0].code;provider=(await call('post','/providers',admin,{organizationName:'E2E Commerce Store',countryCode:'VE',ownerEmail:'shop-seller@e2e.fur.local'}).expect(201)).body.id;await call('patch',`/providers/${provider}/commerce/settings`,seller,settings).expect(200)})
 afterAll(async()=>{try{await db.cleanup()}finally{await db.close();await app.close()}})
 it('creates independent products and validates typed specifications and ownership',async()=>{
  const p=await product();const detail=await call('get',`/marketplace/products/${p.id}`,buyer).expect(200);expect(detail.body.model).toBeNull();expect(detail.body.commercial.model).toBe('My model');expect(detail.body.commercial.specifications).toHaveLength(5);expect(detail.body.variants[0].stock).toBeUndefined();expect(detail.body.terms).not.toHaveProperty('account');await call('patch',`/providers/${provider}/commerce/products/${p.id}`,other,{saleMode:'QUOTE'}).expect(403);await call('patch',`/providers/${provider}/commerce/products/${p.id}`,seller,{specifications:[{label:'Wrong',type:'NUMBER',value:'NaN'}]}).expect(400)
 })
 it('validates images and publishes a private draft gallery only after product publication',async()=>{
  const p=await product();await call('patch',`/providers/${provider}/listings/${p.id}`,seller,{status:'DRAFT'}).expect(200)
  const path=`/api/v1/providers/${provider}/commerce/products/${p.id}/gallery`
  await request(app.getHttpServer()).post(path).set('Authorization',bearer(seller)).attach('file',Buffer.from('<svg/>'),'bad.png').expect(415)
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=','base64')
  const saved=await request(app.getHttpServer()).post(path).set('Authorization',bearer(seller)).attach('file',png,'photo.png').expect(201)
  const image=saved.body.gallery[0];await call('get',image.url,other).expect(404);await call('get',image.url,seller).expect(200);await call('delete',`/providers/${provider}/commerce/products/${p.id}/gallery/${image.id}`,seller).expect(200)
 })
 it('reserves stock atomically, retries idempotently, and preserves banking snapshots',async()=>{
  const p=await product('DIRECT',2),payload=checkout(p)
  const results=await Promise.all([call('post','/marketplace/orders',buyer,payload),call('post','/marketplace/orders',other,checkout(p))]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);const winner=results[0].status===201?buyer:other,order=results.find(r=>r.status===201)!.body
  if(winner===buyer){await call('post','/marketplace/orders',buyer,payload).expect(201).expect(r=>expect(r.body.id).toBe(order.id));await call('post','/marketplace/orders',buyer,{...payload,note:'changed'}).expect(409)}
  await call('get',`/marketplace/orders/${order.id}`,winner===buyer?other:buyer).expect(404)
  await call('patch',`/providers/${provider}/commerce/settings`,seller,{...settings,account:'NEW'}).expect(200)
  await call('get',`/marketplace/orders/${order.id}`,winner).expect(200).expect(r=>expect(r.body.paymentInstructions.account).toBe('123456'))
  await call('patch',`/marketplace/orders/${order.id}`,winner,{status:'PAID'}).expect(409)
  await call('patch',`/marketplace/orders/${order.id}`,winner,{status:'CANCELLED'}).expect(200)
  await call('get',`/marketplace/products/${p.id}`,buyer).expect(200).expect(r=>expect(r.body.variants[0].available).toBe(2))
  await call('patch',`/providers/${provider}/commerce/settings`,seller,settings).expect(200)
 })
 it('requires the shown total and prevents reducing stock below reservations',async()=>{
  const p=await product();await call('post','/marketplace/orders',buyer,checkout(p,{expectedTotal:1})).expect(409)
  const order=await call('post','/marketplace/orders',buyer,checkout(p)).expect(201)
  const detail=await call('get',`/providers/${provider}/commerce/products/${p.id}`,seller).expect(200)
  await call('patch',`/providers/${provider}/commerce/products/${p.id}/variants`,seller,{variants:[{...detail.body.variants[0],stock:0}]}).expect(409)
  await call('patch',`/marketplace/orders/${order.body.id}`,buyer,{status:'CANCELLED'}).expect(200)
 })
 it('requires buyer transfer review and seller confirmation before shipping, supports returns without inventing payments',async()=>{
  const p=await product(),order=(await call('post','/marketplace/orders',buyer,checkout(p)).expect(201)).body
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'SHIPPED',tracking:'Test'}).expect(409)
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'PAYMENT_REVIEW',reference:'TRANSFER-1'}).expect(200)
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'CANCELLED'}).expect(403)
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'PAID'}).expect(403)
  for(const status of ['PAID','PREPARING'])await call('patch',`/marketplace/orders/${order.id}`,seller,{status}).expect(200)
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'SHIPPED',tracking:'Carrier ABC-123'}).expect(200)
  await call('get',`/providers/${provider}/commerce/products/${p.id}`,seller).expect(200).expect(r=>expect(r.body.variants[0]).toMatchObject({stock:2,reserved:0}))
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'DELIVERED'}).expect(200)
  await call('post',`/marketplace/orders/${order.id}/reviews`,other,{listingId:p.id,rating:5,comment:'Invalid review'}).expect(404)
  await call('post',`/marketplace/orders/${order.id}/reviews`,buyer,{listingId:p.id,rating:4,comment:'Verified purchase'}).expect(201)
  await call('post',`/marketplace/orders/${order.id}/reviews`,buyer,{listingId:p.id,rating:5,comment:'Duplicate review'}).expect(409)
  await call('get',`/marketplace/products/${p.id}`,buyer).expect(200).expect(r=>expect(r.body).toMatchObject({rating:4,ratingCount:1}))
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'RETURN_REQUESTED',note:'Wrong part'}).expect(200)
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'RETURN_APPROVED'}).expect(200)
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'REFUNDED',reference:'REFUND-1'}).expect(200)
 })
 it('quotes each line, requires buyer acceptance, and reserves only on acceptance',async()=>{
  const p=await product('QUOTE',5),order=(await call('post','/marketplace/orders',buyer,checkout(p,{mode:'QUOTE'})).expect(201)).body
  await call('get',`/marketplace/products/${p.id}`,buyer).expect(200).expect(r=>expect(r.body.variants[0].available).toBe(5))
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'QUOTED',prices:order.lines.map((l:{id:string})=>({lineId:l.id,price:30}))}).expect(200).expect(r=>expect(r.body.total).toBe(65))
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'ACCEPT_QUOTE',expectedRevision:1}).expect(200)
  await call('get',`/marketplace/products/${p.id}`,buyer).expect(200).expect(r=>expect(r.body.variants[0].available).toBe(3))
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'CANCELLED'}).expect(200)
 })
 it('releases a paid reservation only after the store confirms a pre-shipment refund',async()=>{
  const p=await product('DIRECT',3),order=(await call('post','/marketplace/orders',buyer,checkout(p)).expect(201)).body
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'PAYMENT_REVIEW',reference:'TRANSFER-REFUND'}).expect(200)
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'PAID'}).expect(200)
  await call('patch',`/marketplace/orders/${order.id}`,buyer,{status:'RETURN_REQUESTED',note:'Cancel before shipping'}).expect(200)
  await call('get',`/marketplace/products/${p.id}`,buyer).expect(200).expect(r=>expect(r.body.variants[0].available).toBe(1))
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'RETURN_APPROVED'}).expect(200)
  await call('patch',`/marketplace/orders/${order.id}`,seller,{status:'REFUNDED',reference:'REFUND-BEFORE-SHIP'}).expect(200).expect(r=>expect(r.body.paymentReference).toBe('TRANSFER-REFUND'))
  await call('get',`/providers/${provider}/commerce/products/${p.id}`,seller).expect(200).expect(r=>expect(r.body.variants[0]).toMatchObject({stock:3,reserved:0}))
 })
})
