import type {INestApplication} from '@nestjs/common'
import {eq,sql} from 'drizzle-orm'
import request from 'supertest'
import {bearer,createApp,login,type Session,TestDb} from './helpers'
import {budgetMasterBatches,budgetMasterEntries,resources,assetModels} from '../src/database/schema'
import {recoveryFixture} from './fixtures/lulo-masters'
import {recoverLegacyMasters} from '../src/modules/budget/legacy-masters'
import {storeRecoveredMasters} from '../src/modules/budget/master-recovery-store'

describe('Private LULO master recovery',()=>{
 let app:INestApplication,db:TestDb,admin:Session,user:Session,batchId:string
 beforeAll(async()=>{app=await createApp();db=new TestDb();await db.cleanup();await db.user('lulo-admin',{isGlobalAdmin:true});await db.user('lulo-user');admin=await login(app,'lulo-admin');user=await login(app,'lulo-user')})
 afterAll(async()=>{try{if(batchId)await db.db.delete(budgetMasterBatches).where(eq(budgetMasterBatches.id,batchId));await db.cleanup()}finally{await db.close();await app.close()}})
 const counts=async()=>({technical:Number((await db.db.select({n:sql<number>`count(*)::int`}).from(assetModels))[0].n),plantResources:Number((await db.db.select({n:sql<number>`count(*)::int`}).from(resources))[0].n)})
 it('stores all rows atomically, retries idempotently and leaves technical and plant catalogs untouched',async()=>{
   const initial=await counts();const recovered=recoverLegacyMasters(recoveryFixture());const [a,b]=await Promise.all([storeRecoveredMasters(db.db,recovered,'E2E LULO masters'),storeRecoveredMasters(db.db,recovered,'E2E LULO masters')]);batchId=a.batch.id
   expect(a.batch.id).toBe(b.batch.id);expect([a.created,b.created].sort()).toEqual([false,true]);expect((await db.db.select().from(budgetMasterEntries).where(eq(budgetMasterEntries.batchId,batchId)))).toHaveLength(recovered.entries.length);expect(await counts()).toEqual(initial)
 })
 it('keeps batches, rows and historical costs restricted to global administration',async()=>{
   const get=(path:string,s?:Session)=>{const r=request(app.getHttpServer()).get(`/api/v1${path}`);return s?r.set('Authorization',bearer(s)):r}
   await get('/admin/budget-catalog/batches').expect(401);await get('/admin/budget-catalog/batches',user).expect(403)
   await get('/admin/budget-catalog/batches',admin).expect(200).expect(r=>expect(r.body.some((b:{id:string})=>b.id===batchId)).toBe(true))
   const rows=(await get(`/admin/budget-catalog/batches/${batchId}/entries?kind=RESOURCE&search=001`,admin).expect(200)).body
   expect(rows.total).toBe(1);expect(rows.items[0]).not.toHaveProperty('data')
   await get(`/admin/budget-catalog/entries/${rows.items[0].id}`,user).expect(403)
   await get(`/admin/budget-catalog/entries/${rows.items[0].id}`,admin).expect(200).expect(r=>expect(r.body.data).toMatchObject({currency:null,priceStatus:'HISTORICAL_UNVERIFIED'}))
 })
})
