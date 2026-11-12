import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'
import { LEGACY_MASTER_FILES, recoverLegacyMasters, type LegacyFile } from '../modules/budget/legacy-masters'
import { storeRecoveredMasters } from '../modules/budget/master-recovery-store'
import { recoverNativeMdb } from '../modules/budget/native-mdb-masters'

async function main(){
  const args=process.argv.slice(2)
  const flag=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined}
  const source=flag('--source');if(!source)throw new Error('Indica --source <archivo LULO.MDB o carpeta seeders>; --apply carga staging local; --output guarda informe')
  const folder=path.resolve(source)
  const result=folder.toLowerCase().endsWith('.mdb')?recoverNativeMdb(await readFile(folder)):recoverLegacyMasters(Object.fromEntries(await Promise.all(LEGACY_MASTER_FILES.map(async name=>[name,await readFile(path.join(folder,name))]))) as Record<LegacyFile,Buffer>)
  const report={fingerprint:result.fingerprint,...result.report,publicPricesPublished:false,privateProjectsImported:false}
  const output=flag('--output')
  if(output){const dest=path.resolve(output);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(report,null,2),'utf8')}
  console.log(JSON.stringify(report,null,2))
  if(!args.includes('--apply')){console.log('Análisis completo. Sin escrituras en base de datos.');return}
  try{process.loadEnvFile('.env')}catch{/* Environment can be supplied externally. */}
  const url=process.env.DATABASE_URL
  if(!url)throw new Error('Falta DATABASE_URL')
  const parsed=new URL(url)
  if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!=='/fur_dev')throw new Error('Este recuperador aplica únicamente al staging local fur_dev')
  const pool=new Pool({connectionString:url})
  try{
    const saved=await storeRecoveredMasters(drizzle(pool,{schema}),result,folder.toLowerCase().endsWith('.mdb')?'Maestros originales LULO.MDB, lectura directa':'Maestros del prototipo LULO, recuperación local')
    console.log(JSON.stringify({batchId:saved.batch.id,created:saved.created,status:saved.batch.status,entries:result.entries.length}))
  }finally{await pool.end()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'No se pudo recuperar el lote');process.exitCode=1})
