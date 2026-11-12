import { eq, sql } from 'drizzle-orm'
import type { Database } from '../../database/database.module'
import { budgetMasterBatches, budgetMasterEntries } from '../../database/schema'
import type { RecoveredMasters } from './legacy-masters'

export async function storeRecoveredMasters(db:Database,recovered:RecoveredMasters,source:string){
  return db.transaction(async tx=>{
    // The same files/recovery version produce one batch even when two import processes run together.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${recovered.fingerprint}))`)
    const [existing]=await tx.select().from(budgetMasterBatches).where(eq(budgetMasterBatches.fingerprint,recovered.fingerprint))
    if(existing)return {batch:existing,created:false}
    const [batch]=await tx.insert(budgetMasterBatches).values({fingerprint:recovered.fingerprint,source,report:recovered.report}).returning()
    for(let offset=0;offset<recovered.entries.length;offset+=200){
      await tx.insert(budgetMasterEntries).values(recovered.entries.slice(offset,offset+200).map(e=>({...e,batchId:batch.id})))
    }
    return {batch,created:true}
  })
}
